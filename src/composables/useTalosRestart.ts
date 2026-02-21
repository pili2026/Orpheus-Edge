import { ref, onUnmounted, type Ref } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

type RestartApiResp = { success: boolean; message?: string }

export interface TalosRestartI18n {
  // confirm & prompt
  restartTitle: string
  restartMessage: string
  restartNow: string
  restartLater: string
  restartReminder: string

  confirmRestartMessage: string
  confirmText: string
  cancelText: string

  // status messages
  restartWarning: string
  restartFailed: string
  restartSuccess: string

  // dialog texts
  restartingTitle: string
  restartingMessage: string
  restartingSubtext: string
}

export interface UseTalosRestartOptions {
  /**
   * Restart API endpoint.
   * default: /api/provision/service/restart
   */
  restartUrl?: string

  /**
   * Poll API endpoint to check if service is back.
   * default: /api/provision/config
   */
  pollUrl?: string

  /**
   * When restart finishes, run callback (e.g., reload config)
   */
  onRestarted?: () => void | Promise<void>

  /**
   * Fake progress seconds to reach 80%
   */
  fakeProgressDurationSec?: number

  /**
   * Start polling delay ms (wait service to go down first)
   */
  pollInitialDelayMs?: number

  /**
   * Poll interval ms
   */
  pollIntervalMs?: number

  /**
   * Max poll attempts
   */
  pollMaxAttempts?: number
}

export const useTalosRestart = (i18n: Ref<TalosRestartI18n>, opts: UseTalosRestartOptions = {}) => {
  // ===== Options =====
  const restartUrl = opts.restartUrl ?? '/api/provision/service/restart'
  const pollUrl = opts.pollUrl ?? '/api/provision/config'
  const onRestarted = opts.onRestarted
  const fakeProgressDurationSec = opts.fakeProgressDurationSec ?? 15
  const pollInitialDelayMs = opts.pollInitialDelayMs ?? 3000
  const pollIntervalMs = opts.pollIntervalMs ?? 2000
  const pollMaxAttempts = opts.pollMaxAttempts ?? 25

  // ===== State =====
  const isRestarting = ref(false)
  const showRestartAlert = ref(false)
  const showRestartingDialog = ref(false)
  const restartProgress = ref(0)

  let restartTimer: ReturnType<typeof setInterval> | null = null
  let pollingTimer: ReturnType<typeof setTimeout> | null = null
  let pollingSeq = 0

  const stopTimers = () => {
    if (restartTimer) {
      clearInterval(restartTimer)
      restartTimer = null
    }
    if (pollingTimer) {
      clearTimeout(pollingTimer)
      pollingTimer = null
    }
  }

  onUnmounted(() => stopTimers())

  // ===== Internal =====
  const startCountdown = () => {
    restartProgress.value = 0
    showRestartingDialog.value = true

    // fake progress: 0 -> 80
    let elapsed = 0
    restartTimer = setInterval(() => {
      elapsed += 1
      restartProgress.value = Math.min(Math.round((elapsed / fakeProgressDurationSec) * 80), 80)
    }, 1000)

    pollingTimer = setTimeout(() => {
      pollingSeq += 1
      void pollUntilUp(pollingSeq, 0)
    }, pollInitialDelayMs)
  }

  const pollUntilUp = async (seq: number, attempt: number) => {
    if (seq !== pollingSeq) return // stale poll

    if (attempt >= pollMaxAttempts) {
      stopTimers()
      showRestartingDialog.value = false
      isRestarting.value = false
      ElMessage.error({ message: i18n.value.restartFailed, duration: 5000 })
      return
    }

    try {
      await axios.get(pollUrl, { timeout: 2000 })
      if (seq !== pollingSeq) return

      stopTimers()
      restartProgress.value = 100

      setTimeout(async () => {
        showRestartingDialog.value = false
        isRestarting.value = false
        ElMessage.success({ message: i18n.value.restartSuccess, duration: 3000 })
        if (onRestarted) await onRestarted()
      }, 600)
    } catch {
      if (seq !== pollingSeq) return
      pollingTimer = setTimeout(() => {
        void pollUntilUp(seq, attempt + 1)
      }, pollIntervalMs)
    }
  }

  // ===== Public APIs =====

  /**
   * Call restart API (fire-and-forget), then start countdown + polling
   */
  const restartNow = async () => {
    if (isRestarting.value) return
    isRestarting.value = true
    showRestartAlert.value = false

    try {
      const resp = await axios.post<RestartApiResp>(restartUrl)
      if (resp.data.success) {
        startCountdown()
        return
      }
      ElMessage.warning({
        message: resp.data.message || i18n.value.restartWarning,
        duration: 5000,
      })
      isRestarting.value = false
    } catch (err: unknown) {
      // avoid any
      console.error('Failed to call restart API:', err)
      ElMessage.error({ message: i18n.value.restartFailed, duration: 5000 })
      isRestarting.value = false
    }
  }

  /**
   * After config update: ask user restart now / later
   */
  const promptRestart = () => {
    if (isRestarting.value) return

    ElMessageBox.confirm(i18n.value.restartMessage, i18n.value.restartTitle, {
      confirmButtonText: i18n.value.restartNow,
      cancelButtonText: i18n.value.restartLater,
      type: 'warning',
      distinguishCancelAndClose: true,
    })
      .then(() => void restartNow())
      .catch((action: 'cancel' | 'close') => {
        if (action === 'cancel') {
          showRestartAlert.value = true
          ElMessage.info({ message: i18n.value.restartReminder, duration: 5000 })
        }
      })
  }

  /**
   * Manual restart button: confirm then restart
   */
  const confirmRestart = () => {
    if (isRestarting.value) return

    ElMessageBox.confirm(i18n.value.confirmRestartMessage, i18n.value.restartTitle, {
      confirmButtonText: i18n.value.confirmText,
      cancelButtonText: i18n.value.cancelText,
      type: 'warning',
    })
      .then(() => void restartNow())
      .catch(() => {})
  }

  /**
   * If user closes alert banner
   */
  const dismissAlert = () => {
    showRestartAlert.value = false
  }

  /**
   * Force close dialog & cancel polling (rarely used, but safe)
   */
  const cancelRestartFlow = () => {
    pollingSeq += 1 // invalidate current polling
    stopTimers()
    showRestartingDialog.value = false
    isRestarting.value = false
  }

  return {
    // state
    isRestarting,
    showRestartAlert,
    showRestartingDialog,
    restartProgress,

    // actions
    restartNow,
    promptRestart,
    confirmRestart,
    dismissAlert,
    cancelRestartFlow,
  }
}
