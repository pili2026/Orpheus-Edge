import { storeToRefs } from 'pinia'
import { useRestartStore, type RestartScope } from '@/stores/restart'

/**
 * Thin adapter over `useRestartStore` for the config views.
 *
 * All state and side effects live in the store: a deferred or in-flight
 * restart must survive navigating away from the screen that started it, so
 * nothing here is component-local and nothing is torn down on unmount.
 *
 * `scope` is the config surface this screen owns: what its saves mark pending
 * and what the banner names. It chooses nothing about the restart itself,
 * because there is only one; see RESTART_URL in `@/stores/restart`.
 */
export const useTalosRestart = (scope: RestartScope) => {
  const restartStore = useRestartStore()
  const { isRestarting, showRestartingDialog, restartProgress, hasPending, restartCompletion } =
    storeToRefs(restartStore)

  return {
    // state
    isRestarting,
    showRestartingDialog,
    restartProgress,
    hasPending,
    restartCompletion,

    // actions
    markPending: () => restartStore.markPending(scope),
    restartNow: restartStore.restartNow,
    promptRestart: () => restartStore.promptRestart(scope),
    confirmRestart: restartStore.confirmRestart,
    dismissAlert: restartStore.dismissAlert,
    cancelRestartFlow: restartStore.cancelRestartFlow,
  }
}
