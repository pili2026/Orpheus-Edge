import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import {
  useTalosRestart,
  type TalosRestartI18n,
  type UseTalosRestartOptions,
} from '@/composables/useTalosRestart'
import { useRestartStore } from '@/stores/restart'

// ==================== Restart flow ====================
//
// A config write marks its scope pending in the restart store and raises no
// modal. The composable only ever clears pending state on the polling-success
// path, and only from the snapshot it captured before the restart POST.

const { confirm, message, axiosGet, axiosPost } = vi.hoisted(() => ({
  confirm: vi.fn(async (): Promise<unknown> => undefined),
  message: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  axiosGet: vi.fn(async (): Promise<unknown> => ({ data: {} })),
  axiosPost: vi.fn(
    async (): Promise<{ data: { success: boolean; message?: string } }> => ({
      data: { success: true },
    }),
  ),
}))

vi.mock('axios', () => ({ default: { get: axiosGet, post: axiosPost } }))
vi.mock('element-plus', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('element-plus')
  return { ...actual, ElMessage: message, ElMessageBox: { confirm } }
})

// A leaked host instance would keep its polling timers alive and could
// consume a one-shot mock meant for the next test.
enableAutoUnmount(afterEach)

const i18n = ref<TalosRestartI18n>({
  restartTitle: 'restartTitle',
  confirmRestartMessage: 'confirmRestartMessage',
  confirmText: 'confirmText',
  cancelText: 'cancelText',
  restartWarning: 'restartWarning',
  restartFailed: 'restartFailed',
  restartSuccess: 'restartSuccess',
  restartingTitle: 'restartingTitle',
  restartingMessage: 'restartingMessage',
  restartingSubtext: 'restartingSubtext',
})

// Short timings so a whole restart runs in a few fake-timer ticks.
const TIMING = {
  fakeProgressDurationSec: 1,
  pollInitialDelayMs: 10,
  pollIntervalMs: 10,
  pollMaxAttempts: 3,
}
const SUCCESS_SETTLE_MS = 600 // the composable's post-poll pause before closing the dialog

type Api = ReturnType<typeof useTalosRestart>

// `useTalosRestart` registers `onUnmounted`, so it has to run inside a
// component. The host exposes the composable's return value to the test.
const mountComposable = (opts: UseTalosRestartOptions = {}) => {
  let api!: Api
  const Host = defineComponent({
    setup() {
      api = useTalosRestart(i18n, { ...TIMING, ...opts })
      return () => null
    },
  })
  const wrapper = mount(Host)
  return { wrapper, api }
}

const advance = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms)
  await flushPromises()
}

/** Drive a started restart through its first poll and the settle pause. */
const letPollSucceed = async () => {
  await advance(TIMING.pollInitialDelayMs)
  await advance(SUCCESS_SETTLE_MS)
}

/** Drive a started restart through every poll attempt until it gives up. */
const letPollExhaust = async () => {
  await advance(TIMING.pollInitialDelayMs)
  for (let i = 0; i < TIMING.pollMaxAttempts; i += 1) await advance(TIMING.pollIntervalMs)
}

describe('useTalosRestart', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    // `clearAllMocks` keeps implementations, so re-pin the happy-path defaults.
    confirm.mockResolvedValue(undefined)
    axiosGet.mockResolvedValue({ data: {} })
    axiosPost.mockResolvedValue({ data: { success: true } })
    // Leave setImmediate real so `flushPromises` still resolves.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('no longer exposes a per-save prompt', () => {
    const { api } = mountComposable()
    expect(api).not.toHaveProperty('promptRestart')
    expect(api).not.toHaveProperty('showRestartAlert')
    expect(confirm).not.toHaveBeenCalled()
  })

  it('a successful poll clears the scopes snapshotted before the POST and runs onRestarted', async () => {
    const store = useRestartStore()
    store.markPending('modbus')
    const onRestarted = vi.fn()
    const { api } = mountComposable({ onRestarted })

    await api.restartNow()
    expect(axiosPost).toHaveBeenCalledWith('/api/provision/service/restart')
    // nothing is cleared before the poll succeeds
    expect(store.hasPending).toBe(true)
    expect(api.isRestarting.value).toBe(true)
    expect(api.showRestartingDialog.value).toBe(true)

    await letPollSucceed()

    expect(axiosGet).toHaveBeenCalledWith('/api/provision/config', expect.anything())
    expect(store.hasPending).toBe(false)
    expect(store.showBanner).toBe(false)
    expect(api.restartProgress.value).toBe(100)
    expect(api.showRestartingDialog.value).toBe(false)
    expect(api.isRestarting.value).toBe(false)
    expect(message.success).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'restartSuccess' }),
    )
    expect(onRestarted).toHaveBeenCalledTimes(1)
  })

  it('a scope re-saved while the restart is in flight is still pending afterwards', async () => {
    const store = useRestartStore()
    store.markPending('modbus')
    const { api } = mountComposable()

    await api.restartNow()
    store.markPending('modbus') // re-save mid-flight: fresh mark id
    await letPollSucceed()

    expect(store.pendingScopes.has('modbus')).toBe(true)
    expect(store.showBanner).toBe(true)
  })

  it('snapshot capture across the await: a scope marked after the POST survives, the earlier one clears', async () => {
    const store = useRestartStore()
    store.markPending('modbus')
    const { api } = mountComposable()

    await api.restartNow() // the POST has resolved; polling has not started
    store.markPending('system')
    await letPollSucceed()

    expect(store.pendingScopes.has('modbus')).toBe(false)
    expect(store.pendingScopes.has('system')).toBe(true)
    expect(store.showBanner).toBe(true)
  })

  it('a rejected restart POST toasts and clears nothing', async () => {
    const store = useRestartStore()
    store.markPending('instance')
    axiosPost.mockRejectedValueOnce(new Error('network'))
    const onRestarted = vi.fn()
    const { api } = mountComposable({ onRestarted })

    await api.restartNow()
    await flushPromises()

    expect(message.error).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'restartFailed' }),
    )
    expect(api.isRestarting.value).toBe(false)
    expect(api.showRestartingDialog.value).toBe(false)
    expect(onRestarted).not.toHaveBeenCalled()
    expect(store.pendingScopes.has('instance')).toBe(true)
    expect(store.showBanner).toBe(true)
  })

  it('a `success: false` reply toasts and clears nothing', async () => {
    const store = useRestartStore()
    store.markPending('system')
    axiosPost.mockResolvedValueOnce({ data: { success: false, message: 'nope' } })
    const onRestarted = vi.fn()
    const { api } = mountComposable({ onRestarted })

    await api.restartNow()
    await flushPromises()

    expect(message.warning).toHaveBeenCalledWith(expect.objectContaining({ message: 'nope' }))
    expect(api.isRestarting.value).toBe(false)
    expect(api.showRestartingDialog.value).toBe(false)
    expect(onRestarted).not.toHaveBeenCalled()
    expect(store.pendingScopes.has('system')).toBe(true)
    expect(store.showBanner).toBe(true)
  })

  it('poll exhaustion toasts and clears nothing', async () => {
    const store = useRestartStore()
    store.markPending('modbus')
    axiosGet.mockRejectedValue(new Error('down'))
    const onRestarted = vi.fn()
    const { api } = mountComposable({ onRestarted })

    await api.restartNow()
    await letPollExhaust()

    expect(axiosGet).toHaveBeenCalledTimes(TIMING.pollMaxAttempts)
    expect(message.error).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'restartFailed' }),
    )
    expect(onRestarted).not.toHaveBeenCalled()
    expect(api.isRestarting.value).toBe(false)
    expect(api.showRestartingDialog.value).toBe(false)
    expect(store.pendingScopes.has('modbus')).toBe(true)
    expect(store.showBanner).toBe(true)
  })

  it('a manual restart with nothing pending completes and still runs onRestarted', async () => {
    const store = useRestartStore()
    const onRestarted = vi.fn()
    const { api } = mountComposable({ onRestarted })

    await api.restartNow()
    await letPollSucceed()

    expect(onRestarted).toHaveBeenCalledTimes(1)
    expect(store.hasPending).toBe(false)
    expect(api.isRestarting.value).toBe(false)
  })

  it('unmounting the restarting view mid-poll stops polling and clears nothing', async () => {
    const store = useRestartStore()
    store.markPending('modbus')
    axiosGet.mockRejectedValueOnce(new Error('still down'))
    const onRestarted = vi.fn()
    const { wrapper, api } = mountComposable({ onRestarted })

    await api.restartNow()
    await advance(TIMING.pollInitialDelayMs) // first attempt fails, next one is scheduled
    expect(axiosGet).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    await advance(TIMING.pollIntervalMs * (TIMING.pollMaxAttempts + 1))

    expect(axiosGet).toHaveBeenCalledTimes(1) // no further attempts after unmount
    expect(onRestarted).not.toHaveBeenCalled()
    expect(store.pendingScopes.has('modbus')).toBe(true)
    expect(store.showBanner).toBe(true) // stale banner: accepted degradation
  })

  it('dismissAlert hides the banner in the store and keeps pending state', () => {
    const store = useRestartStore()
    store.markPending('modbus')
    const { api } = mountComposable()

    api.dismissAlert()

    expect(store.showBanner).toBe(false)
    expect(store.hasPending).toBe(true)
    store.markPending('system')
    expect(store.showBanner).toBe(true)
  })

  it('confirmRestart() asks first and restarts only on confirm', async () => {
    confirm.mockRejectedValueOnce('cancel')
    const { api } = mountComposable()
    api.confirmRestart()
    await flushPromises()
    expect(confirm).toHaveBeenCalledWith(
      'confirmRestartMessage',
      'restartTitle',
      expect.objectContaining({ confirmButtonText: 'confirmText', cancelButtonText: 'cancelText' }),
    )
    expect(axiosPost).not.toHaveBeenCalled()

    api.confirmRestart()
    await flushPromises()
    expect(axiosPost).toHaveBeenCalledTimes(1)
  })
})
