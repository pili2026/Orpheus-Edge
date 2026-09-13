import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import {
  useTalosRestart,
  type TalosRestartI18n,
  type UseTalosRestartOptions,
} from '@/composables/useTalosRestart'

// ==================== Characterization ====================
//
// These tests pin the restart flow as it behaves on `main`, including two
// defects that the next commit removes:
//   - every successful config write raises a blocking confirm box;
//   - the "not yet applied" banner is cleared before the restart POST and is
//     never restored when the restart fails.
// Tests marked PINS CURRENT (BUGGY) BEHAVIOUR are inverted in commit 2.

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
  restartMessage: 'restartMessage',
  restartNow: 'restartNow',
  restartLater: 'restartLater',
  restartReminder: 'restartReminder',
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

describe('useTalosRestart on main', () => {
  beforeEach(() => {
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

  // PINS CURRENT (BUGGY) BEHAVIOUR — inverted in commit 2
  it('promptRestart() raises a blocking confirm box after a config write', async () => {
    const { api } = mountComposable()
    api.promptRestart()
    await flushPromises()

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm).toHaveBeenCalledWith(
      'restartMessage',
      'restartTitle',
      expect.objectContaining({
        confirmButtonText: 'restartNow',
        cancelButtonText: 'restartLater',
        distinguishCancelAndClose: true,
      }),
    )
    // confirming starts the restart straight away
    expect(axiosPost).toHaveBeenCalledWith('/api/provision/service/restart')
  })

  // PINS CURRENT (BUGGY) BEHAVIOUR — inverted in commit 2
  it('"Restart Later" on the prompt raises the banner and a reminder toast', async () => {
    confirm.mockRejectedValueOnce('cancel')
    const { api } = mountComposable()
    api.promptRestart()
    await flushPromises()

    expect(api.showRestartAlert.value).toBe(true)
    expect(message.info).toHaveBeenCalledTimes(1)
    expect(axiosPost).not.toHaveBeenCalled()
  })

  // PINS CURRENT (BUGGY) BEHAVIOUR — inverted in commit 2
  it('closing the prompt with X / Escape leaves no banner and no reminder', async () => {
    confirm.mockRejectedValueOnce('close')
    const { api } = mountComposable()
    api.promptRestart()
    await flushPromises()

    expect(api.showRestartAlert.value).toBe(false)
    expect(message.info).not.toHaveBeenCalled()
    expect(axiosPost).not.toHaveBeenCalled()
  })

  // PINS CURRENT (BUGGY) BEHAVIOUR — inverted in commit 2
  it('a rejected restart POST clears the banner and never restores it', async () => {
    confirm.mockRejectedValueOnce('cancel')
    axiosPost.mockRejectedValueOnce(new Error('network'))
    const { api } = mountComposable()
    api.promptRestart()
    await flushPromises()
    expect(api.showRestartAlert.value).toBe(true)

    await api.restartNow()
    await flushPromises()

    expect(message.error).toHaveBeenCalledTimes(1)
    expect(api.isRestarting.value).toBe(false)
    expect(api.showRestartingDialog.value).toBe(false)
    expect(api.showRestartAlert.value).toBe(false)
  })

  // PINS CURRENT (BUGGY) BEHAVIOUR — inverted in commit 2
  it('a `success: false` reply clears the banner and never restores it', async () => {
    confirm.mockRejectedValueOnce('cancel')
    axiosPost.mockResolvedValueOnce({ data: { success: false, message: 'nope' } })
    const { api } = mountComposable()
    api.promptRestart()
    await flushPromises()
    expect(api.showRestartAlert.value).toBe(true)

    await api.restartNow()
    await flushPromises()

    expect(message.warning).toHaveBeenCalledWith(expect.objectContaining({ message: 'nope' }))
    expect(api.isRestarting.value).toBe(false)
    expect(api.showRestartingDialog.value).toBe(false)
    expect(api.showRestartAlert.value).toBe(false)
  })

  // PINS CURRENT (BUGGY) BEHAVIOUR — inverted in commit 2
  it('poll exhaustion clears the banner and never restores it', async () => {
    confirm.mockRejectedValueOnce('cancel')
    axiosGet.mockRejectedValue(new Error('down'))
    const onRestarted = vi.fn()
    const { api } = mountComposable({ onRestarted })
    api.promptRestart()
    await flushPromises()
    expect(api.showRestartAlert.value).toBe(true)

    await api.restartNow()
    expect(api.showRestartingDialog.value).toBe(true)
    await letPollExhaust()

    expect(axiosGet).toHaveBeenCalledTimes(TIMING.pollMaxAttempts)
    expect(message.error).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'restartFailed' }),
    )
    expect(onRestarted).not.toHaveBeenCalled()
    expect(api.isRestarting.value).toBe(false)
    expect(api.showRestartingDialog.value).toBe(false)
    expect(api.showRestartAlert.value).toBe(false)
  })

  it('a successful poll closes the dialog, toasts, and runs onRestarted', async () => {
    const onRestarted = vi.fn()
    const { api } = mountComposable({ onRestarted })

    await api.restartNow()
    expect(api.isRestarting.value).toBe(true)
    expect(api.showRestartingDialog.value).toBe(true)
    await letPollSucceed()

    expect(axiosGet).toHaveBeenCalledWith('/api/provision/config', expect.anything())
    expect(api.restartProgress.value).toBe(100)
    expect(api.showRestartingDialog.value).toBe(false)
    expect(api.isRestarting.value).toBe(false)
    expect(message.success).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'restartSuccess' }),
    )
    expect(onRestarted).toHaveBeenCalledTimes(1)
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
