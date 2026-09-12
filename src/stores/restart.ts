import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from '@/composables/useI18n'

// ===== Type Definitions =====

/**
 * A config surface whose changes are written but not yet running.
 * A scope is a label -- what the operator has changed and not yet applied --
 * never a route: every scope is applied by the same restart, see RESTART_URL.
 */
export type RestartScope = 'modbus' | 'system' | 'instance' | 'mqtt'

type RestartApiResp = { success: boolean; message?: string }

/** A pending scope together with the id of the write that made it pending. */
type PendingMark = readonly [RestartScope, number]

/**
 * What a completed restart announces to the views: a timestamp, nothing else.
 *
 * The restart kills the whole Talos process, so after it every config view's
 * configuration and metadata are stale and every view refetches. There is no
 * subset of listeners to address, so the event carries nothing to filter on.
 * `at` is a fresh value on every completion so that a repeat restart is still
 * a change and still fires the watchers.
 */
export interface RestartCompletion {
  at: number
}

// ===== Endpoints =====

/**
 * Talos exposes two restart URLs, POST /api/provision/service/restart and
 * POST /api/mqtt/restart, and they kill the same process: both resolve the
 * same FastAPI dependency and await the same method,
 * ProvisionService.restart_talos_service, which SIGKILLs its own PID. See the
 * Talos repository, docs/scan/talos-config-restart-cost.md, section 11. There
 * is no MQTT-only restart, so the client models one restart and one probe,
 * and a RestartScope never chooses an endpoint.
 *
 * GET /api/provision/config is served by the very process being killed, and
 * `await server.serve()` is the last statement of Talos's startup sequence:
 * the port binds only after device construction, both sequential health-check
 * passes and the monitor start have completed. A successful probe therefore
 * cannot arrive early, which is why it is treated as "restart complete".
 *
 * A restart is expensive in ways this client cannot undo: alarm state is lost
 * and re-fires as new triggers, device health and backoff are cleared,
 * debounce dwell restarts from zero, and the upstream timeseries gap is lost,
 * not backfilled. A restart must therefore never be triggered automatically;
 * only an explicit user action may start one.
 */
const RESTART_URL = '/api/provision/service/restart'
const POLL_URL = '/api/provision/config'

export const SCOPE_ORDER: RestartScope[] = ['modbus', 'system', 'instance', 'mqtt']

// ===== Timing =====

/** Fake progress seconds to reach 80% */
const FAKE_PROGRESS_DURATION_SEC = 15
/** Start polling delay ms (wait service to go down first) */
const POLL_INITIAL_DELAY_MS = 3000
/** Poll interval ms */
const POLL_INTERVAL_MS = 2000
/** Max poll attempts */
const POLL_MAX_ATTEMPTS = 25

// ===== Store =====

/**
 * Pending-restart state for every config surface.
 *
 * This lives in a store rather than in each view because a deferred restart
 * outlives the screen that raised it: navigating away from the Modbus page
 * must not lose the fact that its config is saved but not yet running.
 */
export const useRestartStore = defineStore('restart', () => {
  // i18n (get once)
  const { t } = useI18n()

  // ===== State =====
  /**
   * Scope -> the id of the write that made it pending. A fresh id on every
   * mark is what lets a completed restart tell the write it was carrying from
   * one that landed later; see clearScopes().
   */
  const pendingScopes = ref<Map<RestartScope, number>>(new Map())
  let nextMarkId = 0
  const isRestarting = ref(false)
  const showRestartingDialog = ref(false)
  const restartProgress = ref(0)
  /** Replaced on every completed restart; see RestartCompletion. */
  const restartCompletion = ref<RestartCompletion | null>(null)

  // ===== Computed =====
  const hasPending = computed(() => pendingScopes.value.size > 0)
  const pendingScopeList = computed(() =>
    SCOPE_ORDER.filter((scope) => pendingScopes.value.has(scope)),
  )

  /** The [scope, markId] pairs a restart started now would be carrying. */
  const snapshotPending = (): PendingMark[] =>
    pendingScopeList.value.map((scope) => [scope, pendingScopes.value.get(scope) ?? 0])

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

  // ===== Internal =====

  /**
   * A completed restart clears only the scopes it was carrying: those already
   * pending when the request went out. Any scope marked after the request
   * began stays pending.
   *
   * A write that lands while a restart is in flight may or may not have been
   * read by the restarting process; the client cannot tell which, because
   * nothing in the response or the poll reports the configuration the new
   * process came up with. Clearing such a scope would silently drop the only
   * indication that a restart is still required, so the conservative outcome
   * is taken instead: the scope stays pending, and the banner may turn out to
   * be unnecessary.
   */
  const clearScopes = (snapshot: PendingMark[]) => {
    for (const [scope, markId] of snapshot) {
      // Only the write this restart was carrying is cleared. A scope re-saved
      // since the request went out carries a newer markId, and the client
      // cannot tell a re-save apart from the mark it replaced -- nothing in
      // the restart response or the poll reports which configuration the new
      // process came up with. So the newer mark is kept: a banner that may be
      // unnecessary costs one extra restart, while clearing it would cost a
      // permanently unapplied configuration with no UI trace.
      if (pendingScopes.value.get(scope) === markId) {
        pendingScopes.value.delete(scope)
      }
    }
  }

  const startCountdown = (applied: PendingMark[]) => {
    restartProgress.value = 0
    showRestartingDialog.value = true

    // fake progress: 0 -> 80
    let elapsed = 0
    restartTimer = setInterval(() => {
      elapsed += 1
      restartProgress.value = Math.min(Math.round((elapsed / FAKE_PROGRESS_DURATION_SEC) * 80), 80)
    }, 1000)

    pollingTimer = setTimeout(() => {
      pollingSeq += 1
      void pollUntilUp(applied, pollingSeq, 0)
    }, POLL_INITIAL_DELAY_MS)
  }

  const pollUntilUp = async (applied: PendingMark[], seq: number, attempt: number) => {
    if (seq !== pollingSeq) return // stale poll

    if (attempt >= POLL_MAX_ATTEMPTS) {
      stopTimers()
      showRestartingDialog.value = false
      isRestarting.value = false
      // The config is still saved and still not running: the banner stands.
      ElMessage.error({ message: t.value.config.talos.restartFailed, duration: 5000 })
      return
    }

    try {
      await axios.get(POLL_URL, { timeout: 2000 })
      if (seq !== pollingSeq) return

      stopTimers()
      restartProgress.value = 100

      setTimeout(async () => {
        showRestartingDialog.value = false
        isRestarting.value = false
        clearScopes(applied)
        restartCompletion.value = { at: Date.now() }
        ElMessage.success({ message: t.value.config.talos.restartSuccess, duration: 3000 })
      }, 600)
    } catch {
      if (seq !== pollingSeq) return
      pollingTimer = setTimeout(() => {
        void pollUntilUp(applied, seq, attempt + 1)
      }, POLL_INTERVAL_MS)
    }
  }

  // ===== Actions =====

  /**
   * Record that a scope's config is written but not yet running.
   */
  const markPending = (scope: RestartScope) => {
    nextMarkId += 1
    pendingScopes.value.set(scope, nextMarkId)
  }

  /**
   * Drop every pending scope without restarting anything.
   */
  const clearPending = () => {
    pendingScopes.value.clear()
  }

  /**
   * If user closes alert banner
   */
  const dismissAlert = () => {
    clearPending()
  }

  /**
   * Call restart API (fire-and-forget), then start countdown + polling.
   *
   * Pending state is never cleared up front: until the service answers again
   * the config is saved and not running, so every failure path below leaves
   * the banner standing.
   */
  const restartNow = async () => {
    if (isRestarting.value) return
    isRestarting.value = true

    // Snapshot taken before the request goes out; see clearScopes().
    const applied = snapshotPending()

    try {
      const resp = await axios.post<RestartApiResp>(RESTART_URL)
      if (resp.data?.success) {
        startCountdown(applied)
        return
      }
      // Talos has no code path that answers success: false today; this branch
      // is defensive handling, not a state the UI is built around.
      ElMessage.warning({
        message: resp.data?.message || t.value.config.talos.restartWarning,
        duration: 5000,
      })
      isRestarting.value = false
    } catch (err: unknown) {
      // avoid any
      console.error('Failed to call restart API:', err)
      ElMessage.error({ message: t.value.config.talos.restartFailed, duration: 5000 })
      isRestarting.value = false
    }
  }

  /**
   * After config update: ask user restart now / later.
   *
   * The scope is marked pending before the dialog opens, because the config is
   * already written by the time we ask. Dismissing the dialog — Cancel, X or
   * Escape alike — only defers the restart; it never un-saves the config.
   */
  const promptRestart = (scope: RestartScope) => {
    markPending(scope)
    if (isRestarting.value) return

    ElMessageBox.confirm(t.value.config.talos.restartMessage, t.value.config.talos.restartTitle, {
      confirmButtonText: t.value.config.talos.restartNow,
      cancelButtonText: t.value.config.talos.restartLater,
      type: 'warning',
    })
      .then(() => void restartNow())
      .catch(() => {
        ElMessage.info({ message: t.value.config.talos.restartReminder, duration: 5000 })
      })
  }

  /**
   * Manual restart button: confirm then restart
   */
  const confirmRestart = () => {
    if (isRestarting.value) return

    ElMessageBox.confirm(
      t.value.config.talos.confirmRestartMessage,
      t.value.config.talos.restartTitle,
      {
        confirmButtonText: t.value.common.confirm,
        cancelButtonText: t.value.common.cancel,
        type: 'warning',
      },
    )
      .then(() => void restartNow())
      .catch(() => {})
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
    // State
    pendingScopes,
    isRestarting,
    showRestartingDialog,
    restartProgress,
    restartCompletion,

    // Computed
    hasPending,
    pendingScopeList,

    // Actions
    markPending,
    clearPending,
    dismissAlert,
    promptRestart,
    confirmRestart,
    restartNow,
    cancelRestartFlow,
  }
})
