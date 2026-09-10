import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from '@/composables/useI18n'

// ===== Type Definitions =====

/**
 * A config surface whose changes are written but not yet running.
 * Scopes are tracked separately because they are not applied by the same
 * endpoint: see SCOPE_ENDPOINTS.
 */
export type RestartScope = 'modbus' | 'system' | 'instance' | 'mqtt'

/** A restartable service, identified by the endpoint that restarts it. */
export type RestartEndpointId = 'talos' | 'mqtt'

export interface RestartEndpoint {
  /** Endpoint that asks the device to restart. */
  restartUrl: string
  /**
   * Endpoint polled until the service answers again.
   *
   * A service is probed on its own endpoint: probing another one proves
   * nothing about this restart. What a successful probe does prove is only
   * that the request succeeded -- not that the service finished loading its
   * configuration, and not that it is ready. Neither endpoint reports
   * readiness, so only the request's success or failure is used, never
   * anything in its body. Whether /api/mqtt/status even goes away during an
   * MQTT restart is an open backend question; a scan is pending on it,
   * together with the question of whether the two restart endpoints restart
   * the same process.
   */
  pollUrl: string
  /** Whether the endpoint's response body counts as "restart accepted". */
  isAccepted: (data: RestartApiResp | undefined) => boolean
  /** Key under `config.talos` naming the button that restarts this service. */
  labelKey: 'restartService' | 'restartMqttService'
}

type RestartApiResp = { success: boolean; message?: string }

/** A pending scope together with the id of the write that made it pending. */
type PendingMark = readonly [RestartScope, number]

// ===== Endpoints =====

const RESTART_ENDPOINTS: Record<RestartEndpointId, RestartEndpoint> = {
  talos: {
    restartUrl: '/api/provision/service/restart',
    pollUrl: '/api/provision/config',
    isAccepted: (data) => !!data?.success,
    labelKey: 'restartService',
  },
  mqtt: {
    restartUrl: '/api/mqtt/restart',
    pollUrl: '/api/mqtt/status',
    // This endpoint's response shape is unknown to the frontend and was never
    // inspected before, so only an explicit `success: false` counts as refusal.
    isAccepted: (data) => data?.success !== false,
    labelKey: 'restartMqttService',
  },
}

/**
 * Which service applies which scope. `mqtt` is deliberately kept apart:
 * whether POST /api/mqtt/restart restarts the same process as
 * POST /api/provision/service/restart is an open backend question, so a
 * Talos service restart is not assumed to apply pending MQTT changes.
 *
 * This mapping is the only reason the pending-restart banner renders one
 * button per service rather than a single Restart button. If a backend scan
 * confirms the two endpoints restart the same process, delete this mapping,
 * the `restartMqttService` copy, and the banner's per-service rendering
 * together: one endpoint means one button again.
 */
const SCOPE_ENDPOINTS: Record<RestartScope, RestartEndpointId> = {
  modbus: 'talos',
  system: 'talos',
  instance: 'talos',
  mqtt: 'mqtt',
}

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
  /** Bumped on every completed restart so views can refetch their config. */
  const restartCompletedAt = ref<number | null>(null)

  // ===== Computed =====
  const hasPending = computed(() => pendingScopes.value.size > 0)
  const pendingScopeList = computed(() =>
    SCOPE_ORDER.filter((scope) => pendingScopes.value.has(scope)),
  )
  const scopesPendingOn = (id: RestartEndpointId) =>
    pendingScopeList.value.filter((scope) => SCOPE_ENDPOINTS[scope] === id)

  /** The [scope, markId] pairs a restart of this endpoint would be carrying. */
  const snapshotPendingOn = (id: RestartEndpointId): PendingMark[] =>
    scopesPendingOn(id).map((scope) => [scope, pendingScopes.value.get(scope) ?? 0])

  /**
   * The pending work, grouped by the service that would apply it — one entry
   * per distinct endpoint, in scope order. The banner renders one button per
   * entry so that it never offers a restart it has not named.
   */
  const pendingRestarts = computed(() => {
    const ids: RestartEndpointId[] = []
    for (const scope of pendingScopeList.value) {
      const id = SCOPE_ENDPOINTS[scope]
      if (!ids.includes(id)) ids.push(id)
    }
    return ids.map((id) => ({
      id,
      label: t.value.config.talos[RESTART_ENDPOINTS[id].labelKey],
      scopeLabels: scopesPendingOn(id).map((scope) => t.value.config.talos.scopes[scope]),
    }))
  })

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
   * A completed restart clears only the scopes it was carrying: those served
   * by the endpoint it was sent to AND already pending when the request went
   * out. Scopes on another endpoint stay pending, and so does any scope marked
   * after the request began.
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

  const startCountdown = (endpoint: RestartEndpoint, applied: PendingMark[]) => {
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
      void pollUntilUp(endpoint, applied, pollingSeq, 0)
    }, POLL_INITIAL_DELAY_MS)
  }

  const pollUntilUp = async (
    endpoint: RestartEndpoint,
    applied: PendingMark[],
    seq: number,
    attempt: number,
  ) => {
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
      await axios.get(endpoint.pollUrl, { timeout: 2000 })
      if (seq !== pollingSeq) return

      stopTimers()
      restartProgress.value = 100

      setTimeout(async () => {
        showRestartingDialog.value = false
        isRestarting.value = false
        clearScopes(applied)
        restartCompletedAt.value = Date.now()
        ElMessage.success({ message: t.value.config.talos.restartSuccess, duration: 3000 })
      }, 600)
    } catch {
      if (seq !== pollingSeq) return
      pollingTimer = setTimeout(() => {
        void pollUntilUp(endpoint, applied, seq, attempt + 1)
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
  const restartEndpoint = async (id: RestartEndpointId) => {
    if (isRestarting.value) return
    isRestarting.value = true

    const endpoint = RESTART_ENDPOINTS[id]
    // Snapshot taken before the request goes out; see clearScopes().
    const applied = snapshotPendingOn(id)

    try {
      const resp = await axios.post<RestartApiResp>(endpoint.restartUrl)
      if (endpoint.isAccepted(resp.data)) {
        startCountdown(endpoint, applied)
        return
      }
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
   * Restart whichever service applies this scope.
   */
  const restartNow = async (scope: RestartScope) => restartEndpoint(SCOPE_ENDPOINTS[scope])

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
      .then(() => void restartNow(scope))
      .catch(() => {
        ElMessage.info({ message: t.value.config.talos.restartReminder, duration: 5000 })
      })
  }

  /**
   * Manual restart button: confirm then restart
   */
  const confirmRestart = (scope: RestartScope) => {
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
      .then(() => void restartNow(scope))
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
    restartCompletedAt,

    // Computed
    hasPending,
    pendingScopeList,
    pendingRestarts,

    // Actions
    markPending,
    clearPending,
    dismissAlert,
    promptRestart,
    confirmRestart,
    restartNow,
    restartEndpoint,
    cancelRestartFlow,
  }
})
