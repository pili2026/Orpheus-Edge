import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/**
 * Which config surfaces have been written but not yet applied by a restart.
 *
 * `'instance'` covers both the `device_instance_config` and `pin_mapping`
 * config kinds: a restart applies every kind at once and the banner does not
 * name scopes, so the distinction has no consumer today. Stated here so a
 * later change that does name scopes finds it recorded rather than inferred.
 */
export type RestartScope = 'modbus' | 'system' | 'instance'

/** `[scope, markId]` pairs captured at the moment a restart is requested. */
export type PendingSnapshot = Array<[RestartScope, number]>

/**
 * Holds one fact: which scopes have config on disk that Talos has not yet
 * loaded. Polling, progress and dialog state stay in `useTalosRestart`.
 *
 * A restart is never triggered from here, or anywhere else, automatically.
 * Per docs/scan/talos-config-restart-cost.md §4 a restart SIGKILLs the
 * process: alarm state is lost and re-fires as fresh TRIGGERs, device
 * health/backoff is cleared, and the upstream timeseries gap is not
 * backfilled. Only an explicit operator action may pay that cost.
 */
export const useRestartStore = defineStore('restart', () => {
  const pendingScopes = ref(new Map<RestartScope, number>())
  const dismissed = ref(false)
  let nextMarkId = 0

  const hasPending = computed(() => pendingScopes.value.size > 0)
  const showBanner = computed(() => hasPending.value && !dismissed.value)

  /**
   * A config write for `scope` succeeded. Always issues a fresh mark id.
   *
   * Call this on the write's success path, before any follow-up refetch —
   * never after one. Most callers refetch to refresh the screen, and that
   * refetch can fail on its own; marking after it would leave the config
   * written, unmarked and the banner absent, which is the state this store
   * exists to make impossible.
   */
  const markPending = (scope: RestartScope) => {
    nextMarkId += 1
    pendingScopes.value.set(scope, nextMarkId)
    dismissed.value = false
  }

  /** Hide the banner until the next `markPending`. Pending state is kept. */
  const dismiss = () => {
    dismissed.value = true
  }

  const snapshotPending = (): PendingSnapshot => Array.from(pendingScopes.value.entries())

  /**
   * Clear only the scopes whose CURRENT mark id still equals the one in
   * `snapshot`. `snapshot` was taken before the restart POST and is consumed
   * after the readiness poll, so several awaits and a timer chain lie in
   * between; a scope re-marked in that window carries a newer id and stays
   * pending. Clearing must never read the live Map to decide what to clear:
   * a save that landed after the POST would be silently discarded.
   *
   * A re-marked scope is kept pending even though the restart may in fact
   * have picked the re-save up: the client cannot tell a re-save from the
   * original mark, and a stale banner is recoverable where a silently
   * cleared one is not.
   */
  const clearMatching = (snapshot: PendingSnapshot) => {
    for (const [scope, markId] of snapshot) {
      if (pendingScopes.value.get(scope) === markId) pendingScopes.value.delete(scope)
    }
  }

  return {
    pendingScopes,
    dismissed,
    hasPending,
    showBanner,
    markPending,
    dismiss,
    snapshotPending,
    clearMatching,
  }
})
