import { ref, onUnmounted, type Ref } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRestartStore, type PendingSnapshot } from '@/stores/restart'

type RestartApiResp = { success: boolean; message?: string }

export interface TalosRestartI18n {
  // confirm
  restartTitle: string
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

/**
 * Requests a Talos restart and waits for it to come back.
 *
 * One endpoint, one probe. `POST /api/provision/service/restart` and
 * `POST /api/mqtt/restart` await the same method, which SIGKILLs the whole
 * Talos process (docs/scan/talos-config-restart-cost.md §11); there is no
 * subsystem restart to route to. The readiness probe `GET /api/provision/config`
 * is served by the process being killed, and `await server.serve()` is the
 * last statement of Talos's startup sequence, after device construction, both
 * health-check passes and monitor start, so a 200 cannot arrive early: a
 * successful probe genuinely means the restart completed.
 *
 * The restart is never triggered automatically. Per the same scan (§4) it
 * loses alarm state (which re-fires as fresh TRIGGERs), clears device
 * health/backoff, resets debounce dwell and leaves an unbackfilled upstream
 * timeseries gap. Every entry point below is an explicit operator action.
 */
export const useTalosRestart = (i18n: Ref<TalosRestartI18n>, opts: UseTalosRestartOptions = {}) => {
  const restartStore = useRestartStore()

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

  // Polling stops with the view that started it. Pending state lives in the
  // store and outlives the view, so navigating away mid-restart leaves the
  // banner standing even once Talos is back; the operator can dismiss it or
  // press "Restart Service" again. Accepted deliberately: a stale banner is
  // recoverable, a silently cleared one is not. Moving polling into the
  // store to close this is out of scope (see docs/decisions/0001).
  onUnmounted(() => stopTimers())

  // ===== Internal =====
  const startCountdown = (snapshot: PendingSnapshot) => {
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
      void pollUntilUp(pollingSeq, 0, snapshot)
    }, pollInitialDelayMs)
  }

  const pollUntilUp = async (seq: number, attempt: number, snapshot: PendingSnapshot) => {
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

      // The only place pending state is cleared, and only from the snapshot
      // captured before the POST: the restart is fire-and-forget and Talos
      // never answers `success: false`, so once a scope is cleared the banner
      // was the last record that its config is un-applied.
      restartStore.clearMatching(snapshot)

      setTimeout(async () => {
        showRestartingDialog.value = false
        isRestarting.value = false
        ElMessage.success({ message: i18n.value.restartSuccess, duration: 3000 })
        if (onRestarted) await onRestarted()
      }, 600)
    } catch {
      if (seq !== pollingSeq) return
      pollingTimer = setTimeout(() => {
        void pollUntilUp(seq, attempt + 1, snapshot)
      }, pollIntervalMs)
    }
  }

  // ===== Public APIs =====

  /**
   * Call restart API (fire-and-forget), then start countdown + polling
   *
   * Nothing pending is cleared here. The snapshot is taken synchronously
   * before the POST and threaded through to the polling-success path; a
   * rejected POST, a `success: false` reply or an exhausted poll leaves every
   * pending scope, and the banner, exactly as it was.
   */
  const restartNow = async () => {
    if (isRestarting.value) return
    isRestarting.value = true
    const snapshot = restartStore.snapshotPending()

    try {
      const resp = await axios.post<RestartApiResp>(restartUrl)
      if (resp.data.success) {
        startCountdown(snapshot)
        return
      }
      // Defensive: Talos does not currently return `success: false`
      // (docs/scan/talos-config-restart-cost.md §11).
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
    restartStore.dismiss()
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
    showRestartingDialog,
    restartProgress,

    // actions
    restartNow,
    confirmRestart,
    dismissAlert,
    cancelRestartFlow,
  }
}
