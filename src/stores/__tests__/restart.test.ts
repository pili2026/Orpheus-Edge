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
const MQTT_RESTART_URL = '/api/mqtt/restart'
const POLL_URL = '/api/provision/config'
const MQTT_POLL_URL = '/api/mqtt/status'

const newStore = () => {
  setActivePinia(createPinia())
  useUIStore().setLanguage('en')
  return useRestartStore()
}

type Store = ReturnType<typeof useRestartStore>

/** Fire a restart and let the POST settle, leaving polling armed. */
const startRestart = async (store: Store, scope: Parameters<Store['restartNow']>[0]) => {
  await store.restartNow(scope)
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
      await startRestart(store, 'system')
      confirm.mockClear()

      store.promptRestart('modbus')
      await flushPromises()

      expect(confirm).not.toHaveBeenCalled()
      expect(store.pendingScopeList).toContain('modbus')
    })
  })

  describe('confirmRestart', () => {
    it('opens the manual confirm box and restarts on confirm', async () => {
      store.confirmRestart('system')
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

      store.confirmRestart('system')
      await flushPromises()

      expect(axiosPost).not.toHaveBeenCalled()
      expect(store.hasPending).toBe(false)
    })
  })

  describe('restartNow', () => {
    it('success: true opens the progress dialog and arms polling after the initial delay', async () => {
      await startRestart(store, 'modbus')

      expect(store.isRestarting).toBe(true)
      expect(store.showRestartingDialog).toBe(true)
      expect(store.restartProgress).toBe(0)
      expect(axiosGet).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(3000)

      expect(axiosGet).toHaveBeenCalledWith(POLL_URL, { timeout: 2000 })
    })

    it('success: false warns with the server message and does not poll', async () => {
      axiosPost.mockResolvedValueOnce({ data: { success: false, message: 'unit is masked' } })

      await startRestart(store, 'modbus')

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

      await startRestart(store, 'modbus')

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

      await startRestart(store, 'modbus')

      expect(store.pendingScopeList).toEqual(['modbus'])
    })

    // Was: restartNow() cleared the banner up front and no failure path restored it.
    it('leaves the scope pending when the request rejects', async () => {
      store.markPending('modbus')
      axiosPost.mockRejectedValueOnce(new Error('network down'))

      await startRestart(store, 'modbus')

      expect(store.pendingScopeList).toEqual(['modbus'])
    })

    it('ignores a second request while one is in flight', async () => {
      await startRestart(store, 'modbus')
      await startRestart(store, 'modbus')

      expect(axiosPost).toHaveBeenCalledTimes(1)
    })
  })

  describe('polling', () => {
    it('a reachable service completes the restart and announces it', async () => {
      store.markPending('modbus')
      await startRestart(store, 'modbus')
      await vi.advanceTimersByTimeAsync(3000)

      expect(store.restartProgress).toBe(100)
      expect(store.showRestartingDialog).toBe(true)

      await vi.advanceTimersByTimeAsync(600)

      expect(store.showRestartingDialog).toBe(false)
      expect(store.isRestarting).toBe(false)
      expect(store.hasPending).toBe(false)
      expect(store.restartCompletedAt).toEqual(expect.any(Number))
      expect(elMessage.success).toHaveBeenCalledWith(
        expect.objectContaining({ message: TALOS.restartSuccess }),
      )
    })

    // Was: an exhausted poll left no banner at all.
    it('an unreachable service gives up after 25 attempts and leaves the scope pending', async () => {
      store.markPending('modbus')
      axiosGet.mockRejectedValue(new Error('ECONNREFUSED'))

      await startRestart(store, 'modbus')
      // initial delay + 25 attempts at 2000 ms
      await vi.advanceTimersByTimeAsync(3000 + 25 * 2000)

      expect(axiosGet).toHaveBeenCalledTimes(25)
      expect(store.showRestartingDialog).toBe(false)
      expect(store.isRestarting).toBe(false)
      expect(elMessage.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: TALOS.restartFailed }),
      )
      expect(store.pendingScopeList).toEqual(['modbus'])
      expect(store.restartCompletedAt).toBeNull()

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

      await startRestart(store, 'modbus')
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
      expect(store.restartCompletedAt).toBeNull()
      expect(store.pendingScopeList).toEqual(['modbus'])
      expect(elMessage.success).not.toHaveBeenCalled()
    })
  })

  describe('scope endpoints', () => {
    const completeRestart = async () => {
      await vi.advanceTimersByTimeAsync(3000 + 600)
    }

    it('a Talos service restart applies every scope it serves', async () => {
      store.markPending('modbus')
      store.markPending('system')
      store.markPending('instance')

      await startRestart(store, 'modbus')
      await completeRestart()

      expect(axiosPost).toHaveBeenCalledWith(RESTART_URL)
      expect(store.hasPending).toBe(false)
    })

    it('a Talos service restart does not apply pending MQTT changes', async () => {
      store.markPending('modbus')
      store.markPending('mqtt')

      await startRestart(store, 'modbus')
      await completeRestart()

      expect(store.pendingScopeList).toEqual(['mqtt'])
    })

    it('groups pending work by the service that applies it', () => {
      store.markPending('modbus')
      store.markPending('system')
      store.markPending('mqtt')

      expect(store.pendingRestarts).toEqual([
        {
          id: 'talos',
          label: TALOS.restartService,
          scopeLabels: [TALOS.scopes.modbus, TALOS.scopes.system],
        },
        { id: 'mqtt', label: TALOS.restartMqttService, scopeLabels: [TALOS.scopes.mqtt] },
      ])
    })

    it('restartEndpoint posts to that service and clears only its scopes', async () => {
      store.markPending('modbus')
      store.markPending('mqtt')

      await store.restartEndpoint('mqtt')
      await flushPromises()
      await completeRestart()

      expect(axiosPost).toHaveBeenCalledTimes(1)
      expect(axiosPost).toHaveBeenCalledWith(MQTT_RESTART_URL)
      expect(store.pendingScopeList).toEqual(['modbus'])
    })

    it('the mqtt scope restarts through its own endpoint and clears only itself', async () => {
      store.markPending('mqtt')
      store.markPending('system')

      await startRestart(store, 'mqtt')
      await completeRestart()

      expect(axiosPost).toHaveBeenCalledWith(MQTT_RESTART_URL)
      expect(store.pendingScopeList).toEqual(['system'])
    })

    it('accepts a 2xx from the mqtt endpoint that carries no success flag', async () => {
      axiosPost.mockResolvedValueOnce({ data: {} })

      await startRestart(store, 'mqtt')

      expect(store.showRestartingDialog).toBe(true)
      expect(elMessage.warning).not.toHaveBeenCalled()
    })

    it('still refuses an explicit success: false from the mqtt endpoint', async () => {
      axiosPost.mockResolvedValueOnce({ data: { success: false } })

      await startRestart(store, 'mqtt')

      expect(store.showRestartingDialog).toBe(false)
      expect(elMessage.warning).toHaveBeenCalled()
    })
  })

  describe('readiness probes', () => {
    it('a talos restart probes the talos endpoint and never the mqtt one', async () => {
      await startRestart(store, 'modbus')
      await vi.advanceTimersByTimeAsync(3000)

      expect(axiosGet).toHaveBeenCalledWith(POLL_URL, { timeout: 2000 })
      expect(axiosGet).not.toHaveBeenCalledWith(MQTT_POLL_URL, expect.anything())
    })

    it('an mqtt restart probes the mqtt endpoint and never the talos one', async () => {
      await startRestart(store, 'mqtt')
      await vi.advanceTimersByTimeAsync(3000)

      expect(axiosGet).toHaveBeenCalledWith(MQTT_POLL_URL, { timeout: 2000 })
      expect(axiosGet).not.toHaveBeenCalledWith(POLL_URL, expect.anything())
    })

    it('keeps probing its own endpoint across retries', async () => {
      axiosGet.mockRejectedValue(new Error('ECONNREFUSED'))

      await startRestart(store, 'mqtt')
      await vi.advanceTimersByTimeAsync(3000 + 3 * 2000)

      expect(axiosGet.mock.calls.every(([url]) => url === MQTT_POLL_URL)).toBe(true)
    })
  })

  describe('scopes recorded while a restart is in flight', () => {
    const completeRestart = async () => {
      await vi.advanceTimersByTimeAsync(3000 + 600)
    }

    it('clears the scopes that were pending when the request went out', async () => {
      store.markPending('modbus')
      store.markPending('system')

      await startRestart(store, 'modbus')
      await completeRestart()

      expect(store.hasPending).toBe(false)
    })

    it('keeps a scope marked after the request went out', async () => {
      store.markPending('modbus')

      await startRestart(store, 'modbus')
      // a save lands mid-restart: the restarting process may or may not have
      // read it, so this scope must survive
      store.markPending('system')
      await completeRestart()

      expect(store.pendingScopeList).toEqual(['system'])
      expect(store.hasPending).toBe(true)
    })

    it('keeps a scope re-saved while its own restart was in flight', async () => {
      store.markPending('modbus')

      await startRestart(store, 'modbus')
      // the same screen saves again: a new mark, which this restart is not
      // known to be carrying
      store.markPending('modbus')
      await completeRestart()

      expect(store.pendingScopeList).toEqual(['modbus'])
      expect(store.hasPending).toBe(true)
    })

    it('a scope marked mid-restart is still pending after a promptRestart deferral', async () => {
      await startRestart(store, 'system')

      // promptRestart records the scope and returns early while restarting
      store.promptRestart('modbus')
      await flushPromises()
      await completeRestart()

      expect(store.pendingScopeList).toEqual(['modbus'])
    })
  })
})
