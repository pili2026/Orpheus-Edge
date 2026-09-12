import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import en from '@/locales/en'
import { useUIStore } from '@/stores/ui'
import { useRestartStore } from '@/stores/restart'

const { axiosGet, axiosPost, confirm, elMessage } = vi.hoisted(() => ({
  axiosGet: vi.fn(),
  axiosPost: vi.fn(),
  confirm: vi.fn(),
  elMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

vi.mock('axios', () => ({ default: { get: axiosGet, post: axiosPost } }))
vi.mock('element-plus', () => ({ ElMessage: elMessage, ElMessageBox: { confirm } }))

const TALOS = en.config.talos
const RESTART_URL = '/api/provision/service/restart'
const POLL_URL = '/api/provision/config'

const newStore = () => {
  setActivePinia(createPinia())
  useUIStore().setLanguage('en')
  return useRestartStore()
}

type Store = ReturnType<typeof useRestartStore>

/** Fire a restart and let the POST settle, leaving polling armed. */
const startRestart = async (store: Store) => {
  await store.restartNow()
  await flushPromises()
}

describe('restart store', () => {
  let store: Store

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    confirm.mockResolvedValue(undefined)
    axiosGet.mockResolvedValue({ data: {} })
    axiosPost.mockResolvedValue({ data: { success: true } })
    store = newStore()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('pending scopes', () => {
    it('starts empty', () => {
      expect(store.hasPending).toBe(false)
      expect(store.pendingScopeList).toEqual([])
    })

    it('markPending is idempotent and keeps a stable display order', () => {
      store.markPending('mqtt')
      store.markPending('modbus')
      store.markPending('modbus')

      expect(store.hasPending).toBe(true)
      expect(store.pendingScopeList).toEqual(['modbus', 'mqtt'])
    })

    it('dismissAlert drops every pending scope', () => {
      store.markPending('modbus')
      store.markPending('mqtt')

      store.dismissAlert()

      expect(store.hasPending).toBe(false)
    })
  })

  describe('promptRestart', () => {
    it('opens the confirm box with the restart copy', async () => {
      store.promptRestart('modbus')
      await flushPromises()

      expect(confirm).toHaveBeenCalledWith(
        TALOS.restartMessage,
        TALOS.restartTitle,
        expect.objectContaining({
          confirmButtonText: TALOS.restartNow,
          cancelButtonText: TALOS.restartLater,
        }),
      )
    })

    it('marks the scope pending before asking, because the config is already written', async () => {
      store.promptRestart('modbus')

      expect(store.pendingScopeList).toEqual(['modbus'])
    })

    it('confirm calls the restart endpoint', async () => {
      store.promptRestart('modbus')
      await flushPromises()

      expect(axiosPost).toHaveBeenCalledWith(RESTART_URL)
    })

    it('cancel defers the restart: the scope stays pending and a reminder is shown', async () => {
      confirm.mockRejectedValueOnce('cancel')

      store.promptRestart('modbus')
      await flushPromises()

      expect(axiosPost).not.toHaveBeenCalled()
      expect(store.pendingScopeList).toEqual(['modbus'])
      expect(elMessage.info).toHaveBeenCalledWith(
        expect.objectContaining({ message: TALOS.restartReminder }),
      )
    })

    // Was: close left no banner and no reminder (Part A pinned that defect).
    it('close (X / Escape) defers exactly like cancel', async () => {
      confirm.mockRejectedValueOnce('close')

      store.promptRestart('modbus')
      await flushPromises()

      expect(axiosPost).not.toHaveBeenCalled()
      expect(store.pendingScopeList).toEqual(['modbus'])
      expect(elMessage.info).toHaveBeenCalledWith(
        expect.objectContaining({ message: TALOS.restartReminder }),
      )
    })

    it('still records the scope while a restart is already in flight, without asking again', async () => {
      await startRestart(store)
      confirm.mockClear()

      store.promptRestart('modbus')
      await flushPromises()

      expect(confirm).not.toHaveBeenCalled()
      expect(store.pendingScopeList).toContain('modbus')
    })
  })

  describe('confirmRestart', () => {
    it('opens the manual confirm box and restarts on confirm', async () => {
      store.confirmRestart()
      await flushPromises()

      expect(confirm).toHaveBeenCalledWith(
        TALOS.confirmRestartMessage,
        TALOS.restartTitle,
        expect.objectContaining({
          confirmButtonText: en.common.confirm,
          cancelButtonText: en.common.cancel,
        }),
      )
      expect(axiosPost).toHaveBeenCalledWith(RESTART_URL)
    })

    it('cancel neither restarts nor marks anything pending', async () => {
      confirm.mockRejectedValueOnce('cancel')

      store.confirmRestart()
      await flushPromises()

      expect(axiosPost).not.toHaveBeenCalled()
      expect(store.hasPending).toBe(false)
    })
  })

  describe('restartNow', () => {
    it('success: true opens the progress dialog and arms polling after the initial delay', async () => {
      await startRestart(store)

      expect(store.isRestarting).toBe(true)
      expect(store.showRestartingDialog).toBe(true)
      expect(store.restartProgress).toBe(0)
      expect(axiosGet).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(3000)

      expect(axiosGet).toHaveBeenCalledWith(POLL_URL, { timeout: 2000 })
    })

    it('success: false warns with the server message and does not poll', async () => {
      axiosPost.mockResolvedValueOnce({ data: { success: false, message: 'unit is masked' } })

      await startRestart(store)

      expect(elMessage.warning).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'unit is masked' }),
      )
      expect(store.showRestartingDialog).toBe(false)
      expect(store.isRestarting).toBe(false)

      await vi.advanceTimersByTimeAsync(10000)
      expect(axiosGet).not.toHaveBeenCalled()
    })

    it('a rejected restart request shows the failure toast and releases the guard', async () => {
      axiosPost.mockRejectedValueOnce(new Error('network down'))

      await startRestart(store)

      expect(elMessage.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: TALOS.restartFailed }),
      )
      expect(store.showRestartingDialog).toBe(false)
      expect(store.isRestarting).toBe(false)
    })

    // Was: restartNow() cleared the banner up front and no failure path restored it.
    it('leaves the scope pending when the server refuses', async () => {
      store.markPending('modbus')
      axiosPost.mockResolvedValueOnce({ data: { success: false } })

      await startRestart(store)

      expect(store.pendingScopeList).toEqual(['modbus'])
    })

    // Was: restartNow() cleared the banner up front and no failure path restored it.
    it('leaves the scope pending when the request rejects', async () => {
      store.markPending('modbus')
      axiosPost.mockRejectedValueOnce(new Error('network down'))

      await startRestart(store)

      expect(store.pendingScopeList).toEqual(['modbus'])
    })

    it('ignores a second request while one is in flight', async () => {
      await startRestart(store)
      await startRestart(store)

      expect(axiosPost).toHaveBeenCalledTimes(1)
    })
  })

  describe('polling', () => {
    it('a reachable service completes the restart and announces it', async () => {
      store.markPending('modbus')
      await startRestart(store)
      await vi.advanceTimersByTimeAsync(3000)

      expect(store.restartProgress).toBe(100)
      expect(store.showRestartingDialog).toBe(true)

      await vi.advanceTimersByTimeAsync(600)

      expect(store.showRestartingDialog).toBe(false)
      expect(store.isRestarting).toBe(false)
      expect(store.hasPending).toBe(false)
      expect(store.restartCompletion).toEqual({ at: expect.any(Number) })
      expect(elMessage.success).toHaveBeenCalledWith(
        expect.objectContaining({ message: TALOS.restartSuccess }),
      )
    })

    // Was: an exhausted poll left no banner at all.
    it('an unreachable service gives up after 25 attempts and leaves the scope pending', async () => {
      store.markPending('modbus')
      axiosGet.mockRejectedValue(new Error('ECONNREFUSED'))

      await startRestart(store)
      // initial delay + 25 attempts at 2000 ms
      await vi.advanceTimersByTimeAsync(3000 + 25 * 2000)

      expect(axiosGet).toHaveBeenCalledTimes(25)
      expect(store.showRestartingDialog).toBe(false)
      expect(store.isRestarting).toBe(false)
      expect(elMessage.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: TALOS.restartFailed }),
      )
      expect(store.pendingScopeList).toEqual(['modbus'])
      expect(store.restartCompletion).toBeNull()

      // timers are cleared: no further probing
      axiosGet.mockClear()
      await vi.advanceTimersByTimeAsync(10000)
      expect(axiosGet).not.toHaveBeenCalled()
    })

    it('a superseded polling run does not touch shared state', async () => {
      let resolveProbe: (value: unknown) => void = () => undefined
      axiosGet.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveProbe = resolve
          }),
      )
      store.markPending('modbus')

      await startRestart(store)
      await vi.advanceTimersByTimeAsync(3000)
      expect(axiosGet).toHaveBeenCalledTimes(1)

      // invalidate the in-flight run before the probe answers
      store.cancelRestartFlow()
      resolveProbe({ data: {} })
      await flushPromises()
      await vi.advanceTimersByTimeAsync(5000)

      expect(store.restartProgress).not.toBe(100)
      expect(store.showRestartingDialog).toBe(false)
      expect(store.isRestarting).toBe(false)
      expect(store.restartCompletion).toBeNull()
      expect(store.pendingScopeList).toEqual(['modbus'])
      expect(elMessage.success).not.toHaveBeenCalled()
    })
  })

  describe('one restart for every scope', () => {
    const completeRestart = async () => {
      await vi.advanceTimersByTimeAsync(3000 + 600)
    }

    it('applies every pending scope, MQTT included, through the one Talos endpoint', async () => {
      store.markPending('modbus')
      store.markPending('system')
      store.markPending('instance')
      store.markPending('mqtt')

      await startRestart(store)
      await completeRestart()

      expect(axiosPost).toHaveBeenCalledTimes(1)
      expect(axiosPost).toHaveBeenCalledWith(RESTART_URL)
      expect(store.hasPending).toBe(false)
    })

    it('probes the one readiness URL on every attempt', async () => {
      axiosGet.mockRejectedValue(new Error('ECONNREFUSED'))

      await startRestart(store)
      await vi.advanceTimersByTimeAsync(3000 + 3 * 2000)

      expect(axiosGet).toHaveBeenCalledTimes(4)
      expect(axiosGet.mock.calls.every(([url]) => url === POLL_URL)).toBe(true)
    })
  })

  describe('completion event', () => {
    const completeRestart = async () => {
      await vi.advanceTimersByTimeAsync(3000 + 600)
    }

    it('carries a timestamp and nothing else', async () => {
      store.markPending('modbus')
      store.markPending('mqtt')

      await startRestart(store)
      await completeRestart()

      expect(store.restartCompletion).toEqual({ at: expect.any(Number) })
      expect(Object.keys(store.restartCompletion!)).toEqual(['at'])
    })

    it('still fires when the restart carried nothing pending', async () => {
      expect(store.hasPending).toBe(false)

      await startRestart(store)
      await completeRestart()

      expect(store.restartCompletion).toEqual({ at: expect.any(Number) })
      expect(store.hasPending).toBe(false)
    })

    it('is a new value on every completion', async () => {
      await startRestart(store)
      await completeRestart()
      const first = store.restartCompletion

      await startRestart(store)
      await completeRestart()
      const second = store.restartCompletion

      expect(second).not.toBe(first)
      expect(second!.at).toBeGreaterThan(first!.at)
    })
  })

  describe('scopes recorded while a restart is in flight', () => {
    const completeRestart = async () => {
      await vi.advanceTimersByTimeAsync(3000 + 600)
    }

    it('clears the scopes that were pending when the request went out', async () => {
      store.markPending('modbus')
      store.markPending('system')

      await startRestart(store)
      await completeRestart()

      expect(store.hasPending).toBe(false)
    })

    it('keeps a scope marked after the request went out', async () => {
      store.markPending('modbus')

      await startRestart(store)
      // a save lands mid-restart: the restarting process may or may not have
      // read it, so this scope must survive
      store.markPending('system')
      await completeRestart()

      expect(store.pendingScopeList).toEqual(['system'])
      expect(store.hasPending).toBe(true)
    })

    it('keeps a scope re-saved while its own restart was in flight', async () => {
      store.markPending('modbus')

      await startRestart(store)
      // the same screen saves again: a new mark, which this restart is not
      // known to be carrying
      store.markPending('modbus')
      await completeRestart()

      expect(store.pendingScopeList).toEqual(['modbus'])
      expect(store.hasPending).toBe(true)
    })

    it('a scope marked mid-restart is still pending after a promptRestart deferral', async () => {
      await startRestart(store)

      // promptRestart records the scope and returns early while restarting
      store.promptRestart('modbus')
      await flushPromises()
      await completeRestart()

      expect(store.pendingScopeList).toEqual(['modbus'])
    })
  })
})
