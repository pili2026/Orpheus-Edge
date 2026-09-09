import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h } from 'vue'
import { useTalosRestart, type TalosRestartI18n } from '@/composables/useTalosRestart'

const { axiosGet, axiosPost, confirm, elMessage } = vi.hoisted(() => ({
  axiosGet: vi.fn(),
  axiosPost: vi.fn(),
  confirm: vi.fn(),
  elMessage: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock('axios', () => ({
  default: { get: axiosGet, post: axiosPost },
}))
vi.mock('element-plus', () => ({
  ElMessage: elMessage,
  ElMessageBox: { confirm },
}))

const I18N: TalosRestartI18n = {
  restartTitle: 'Restart Talos Service',
  restartMessage: 'Configuration updated. Restart Talos service to apply changes?',
  restartNow: 'Restart Now',
  restartLater: 'Restart Later',
  restartReminder: 'Configuration saved. Please remember to restart Talos service manually.',
  confirmRestartMessage: 'Are you sure you want to restart Talos service?',
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  restartWarning: 'Talos service restarted but may not be fully active.',
  restartFailed: 'Failed to restart Talos service.',
  restartSuccess: 'Talos service restarted. New configuration is now active.',
  restartingTitle: 'Restarting Service',
  restartingMessage: 'Restarting Talos service, please wait...',
  restartingSubtext: 'New configuration will take effect after restart.',
}

type RestartApi = ReturnType<typeof useTalosRestart>

/**
 * The composable registers an onUnmounted hook, so it needs a component instance.
 */
const mountComposable = (opts: Parameters<typeof useTalosRestart>[1] = {}) => {
  let api!: RestartApi
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useTalosRestart(
          computed(() => I18N),
          opts,
        )
        return () => h('div')
      },
    }),
  )
  return { api, wrapper }
}

/** Drive a full successful restart up to the point where polling is armed. */
const startRestart = async (api: RestartApi) => {
  axiosPost.mockResolvedValueOnce({ data: { success: true } })
  await api.restartNow()
  await flushPromises()
}

describe('useTalosRestart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    confirm.mockResolvedValue(undefined)
    axiosGet.mockResolvedValue({ data: {} })
    axiosPost.mockResolvedValue({ data: { success: true } })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('promptRestart', () => {
    it('opens the confirm box with the restart copy', async () => {
      const { api } = mountComposable()

      api.promptRestart()
      await flushPromises()

      expect(confirm).toHaveBeenCalledWith(
        I18N.restartMessage,
        I18N.restartTitle,
        expect.objectContaining({
          confirmButtonText: I18N.restartNow,
          cancelButtonText: I18N.restartLater,
        }),
      )
    })

    it('confirm calls the restart endpoint', async () => {
      const { api } = mountComposable()

      api.promptRestart()
      await flushPromises()

      expect(axiosPost).toHaveBeenCalledWith('/api/provision/service/restart')
    })

    it('cancel defers the restart: banner is raised and a reminder is shown', async () => {
      confirm.mockRejectedValueOnce('cancel')
      const { api } = mountComposable()

      api.promptRestart()
      await flushPromises()

      expect(axiosPost).not.toHaveBeenCalled()
      expect(api.showRestartAlert.value).toBe(true)
      expect(elMessage.info).toHaveBeenCalledWith(
        expect.objectContaining({ message: I18N.restartReminder }),
      )
    })

    // PINS CURRENT (BUGGY) BEHAVIOUR — inverted in Part B
    it('close (X / Escape) leaves no banner and no reminder', async () => {
      confirm.mockRejectedValueOnce('close')
      const { api } = mountComposable()

      api.promptRestart()
      await flushPromises()

      expect(axiosPost).not.toHaveBeenCalled()
      expect(api.showRestartAlert.value).toBe(false)
      expect(elMessage.info).not.toHaveBeenCalled()
    })

    it('does nothing while a restart is already in flight', async () => {
      const { api } = mountComposable()
      await startRestart(api)
      confirm.mockClear()

      api.promptRestart()
      await flushPromises()

      expect(confirm).not.toHaveBeenCalled()
    })
  })

  describe('confirmRestart', () => {
    it('opens the manual confirm box and restarts on confirm', async () => {
      const { api } = mountComposable()

      api.confirmRestart()
      await flushPromises()

      expect(confirm).toHaveBeenCalledWith(
        I18N.confirmRestartMessage,
        I18N.restartTitle,
        expect.objectContaining({
          confirmButtonText: I18N.confirmText,
          cancelButtonText: I18N.cancelText,
        }),
      )
      expect(axiosPost).toHaveBeenCalledWith('/api/provision/service/restart')
    })

    it('cancel does not restart and does not raise the banner', async () => {
      confirm.mockRejectedValueOnce('cancel')
      const { api } = mountComposable()

      api.confirmRestart()
      await flushPromises()

      expect(axiosPost).not.toHaveBeenCalled()
      expect(api.showRestartAlert.value).toBe(false)
    })
  })

  describe('restartNow', () => {
    it('success: true opens the progress dialog and arms polling after the initial delay', async () => {
      const { api } = mountComposable()

      await startRestart(api)

      expect(api.isRestarting.value).toBe(true)
      expect(api.showRestartingDialog.value).toBe(true)
      expect(api.restartProgress.value).toBe(0)
      expect(axiosGet).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(3000)

      expect(axiosGet).toHaveBeenCalledWith('/api/provision/config', { timeout: 2000 })
    })

    it('success: false warns with the server message and does not poll', async () => {
      const { api } = mountComposable()
      axiosPost.mockResolvedValueOnce({ data: { success: false, message: 'unit is masked' } })

      await api.restartNow()
      await flushPromises()

      expect(elMessage.warning).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'unit is masked' }),
      )
      expect(api.showRestartingDialog.value).toBe(false)
      expect(api.isRestarting.value).toBe(false)

      await vi.advanceTimersByTimeAsync(10000)
      expect(axiosGet).not.toHaveBeenCalled()
    })

    it('a rejected restart request shows the failure toast and releases the guard', async () => {
      const { api } = mountComposable()
      axiosPost.mockRejectedValueOnce(new Error('network down'))

      await api.restartNow()
      await flushPromises()

      expect(elMessage.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: I18N.restartFailed }),
      )
      expect(api.showRestartingDialog.value).toBe(false)
      expect(api.isRestarting.value).toBe(false)
    })

    // PINS CURRENT (BUGGY) BEHAVIOUR — inverted in Part B
    it('clears a raised banner up front and does not restore it when success: false', async () => {
      confirm.mockRejectedValueOnce('cancel')
      const { api } = mountComposable()
      api.promptRestart()
      await flushPromises()
      expect(api.showRestartAlert.value).toBe(true)

      axiosPost.mockResolvedValueOnce({ data: { success: false } })
      await api.restartNow()
      await flushPromises()

      expect(api.showRestartAlert.value).toBe(false)
    })

    // PINS CURRENT (BUGGY) BEHAVIOUR — inverted in Part B
    it('does not restore the banner when the restart request rejects', async () => {
      confirm.mockRejectedValueOnce('cancel')
      const { api } = mountComposable()
      api.promptRestart()
      await flushPromises()
      expect(api.showRestartAlert.value).toBe(true)

      axiosPost.mockRejectedValueOnce(new Error('network down'))
      await api.restartNow()
      await flushPromises()

      expect(api.showRestartAlert.value).toBe(false)
    })
  })

  describe('polling', () => {
    it('a reachable service completes the restart and runs onRestarted', async () => {
      const onRestarted = vi.fn()
      const { api } = mountComposable({ onRestarted })

      await startRestart(api)
      await vi.advanceTimersByTimeAsync(3000)

      expect(api.restartProgress.value).toBe(100)
      expect(api.showRestartingDialog.value).toBe(true)

      await vi.advanceTimersByTimeAsync(600)

      expect(api.showRestartingDialog.value).toBe(false)
      expect(api.isRestarting.value).toBe(false)
      expect(elMessage.success).toHaveBeenCalledWith(
        expect.objectContaining({ message: I18N.restartSuccess }),
      )
      expect(onRestarted).toHaveBeenCalledTimes(1)
    })

    // PINS CURRENT (BUGGY) BEHAVIOUR — inverted in Part B
    it('an unreachable service gives up after pollMaxAttempts, leaving no banner', async () => {
      confirm.mockRejectedValueOnce('cancel')
      const { api } = mountComposable()
      api.promptRestart()
      await flushPromises()

      axiosGet.mockRejectedValue(new Error('ECONNREFUSED'))
      await startRestart(api)

      // initial delay + 25 attempts at 2000 ms
      await vi.advanceTimersByTimeAsync(3000 + 25 * 2000)

      expect(axiosGet).toHaveBeenCalledTimes(25)
      expect(api.showRestartingDialog.value).toBe(false)
      expect(api.isRestarting.value).toBe(false)
      expect(elMessage.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: I18N.restartFailed }),
      )
      expect(api.showRestartAlert.value).toBe(false)

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
      const onRestarted = vi.fn()
      const { api } = mountComposable({ onRestarted })

      await startRestart(api)
      await vi.advanceTimersByTimeAsync(3000)
      expect(axiosGet).toHaveBeenCalledTimes(1)

      // invalidate the in-flight run before the probe answers
      api.cancelRestartFlow()
      resolveProbe({ data: {} })
      await flushPromises()
      await vi.advanceTimersByTimeAsync(5000)

      expect(api.restartProgress.value).not.toBe(100)
      expect(api.showRestartingDialog.value).toBe(false)
      expect(api.isRestarting.value).toBe(false)
      expect(elMessage.success).not.toHaveBeenCalled()
      expect(onRestarted).not.toHaveBeenCalled()
    })

    it('unmounting stops the progress and polling timers', async () => {
      const { api, wrapper } = mountComposable()

      await startRestart(api)
      wrapper.unmount()
      await vi.advanceTimersByTimeAsync(10000)

      expect(axiosGet).not.toHaveBeenCalled()
    })
  })

  describe('dismissAlert', () => {
    it('clears the banner', async () => {
      confirm.mockRejectedValueOnce('cancel')
      const { api } = mountComposable()
      api.promptRestart()
      await flushPromises()
      expect(api.showRestartAlert.value).toBe(true)

      api.dismissAlert()

      expect(api.showRestartAlert.value).toBe(false)
    })
  })
})
