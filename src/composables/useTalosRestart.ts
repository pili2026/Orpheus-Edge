import { storeToRefs } from 'pinia'
import { useRestartStore, type RestartScope } from '@/stores/restart'

/**
 * Thin adapter over `useRestartStore` for the config views.
 *
 * All state and side effects live in the store: a deferred or in-flight
 * restart must survive navigating away from the screen that started it, so
 * nothing here is component-local and nothing is torn down on unmount.
 *
 * `scope` is the config surface this screen owns. It decides which endpoint a
 * restart is sent to; see SCOPE_ENDPOINTS in `@/stores/restart`.
 */
export const useTalosRestart = (scope: RestartScope) => {
  const restartStore = useRestartStore()
  const { isRestarting, showRestartingDialog, restartProgress, hasPending, restartCompletedAt } =
    storeToRefs(restartStore)

  return {
    // state
    isRestarting,
    showRestartingDialog,
    restartProgress,
    hasPending,
    restartCompletedAt,

    // actions
    markPending: () => restartStore.markPending(scope),
    restartNow: () => restartStore.restartNow(scope),
    promptRestart: () => restartStore.promptRestart(scope),
    confirmRestart: () => restartStore.confirmRestart(scope),
    dismissAlert: restartStore.dismissAlert,
    cancelRestartFlow: restartStore.cancelRestartFlow,
  }
}
