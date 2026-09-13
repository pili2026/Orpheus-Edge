# 0001 — Remove the per-save Talos restart prompt

Status: accepted
Date: 2026-09-13
Branch: `claude/remove-per-save-restart-prompt-rcm5f0`

## Context

An operator commissioning a new plant adds ten or more Modbus devices in one
sitting. On `main`, every successful config write in the Modbus, System and
Instance config views called `promptRestart()` in
`src/composables/useTalosRestart.ts`, which opened a blocking
`ElMessageBox.confirm` asking whether to restart Talos now. The operator
answered it once per device. That prompt is what this change removes, and it is
the whole of what this change removes.

Two defects on `main` went with it, both cited in
`docs/scan/modbus-restart-flow-scan.md`:

- `promptRestart()` ran on every successful mutation (thirteen call sites across
  three views). This was the complaint.
- `restartNow()` cleared the "not yet applied" banner **before** the restart
  POST, and none of the three failure paths (POST rejected, `success: false`,
  poll exhausted) restored it. A saved, un-applied config left no trace on
  screen.

A third defect ceased to exist rather than being fixed: `promptRestart()`
passed `distinguishCancelAndClose: true` but recorded the deferral only on
`action === 'cancel'`, so dismissing the box with X or Escape left no banner.
Deleting `promptRestart()` deletes that path.

### What the Talos scan established

`docs/scan/talos-config-restart-cost.md` in the Talos repository, §3, §4 and
§11, settled the open questions:

- **One process, one restart.** `POST /api/mqtt/restart` and
  `POST /api/provision/service/restart` resolve the same dependency and await
  the same method, which `SIGKILL`s its own PID. There is no MQTT-only restart
  and nothing to route to.
- **The probe is accurate.** `GET /api/provision/config` is served by the
  process being killed, and `await server.serve()` is the last statement of
  Talos's startup sequence, after device construction, two sequential
  health-check passes and monitor start. A 200 cannot arrive early, so a
  successful probe genuinely means the restart completed.
- **`success: false` is never returned.** The restart is fire-and-forget; the
  method has a single unconditional `return {"success": True}`.
- **There is no hot reload for device config.** A restart is unavoidable.
- **A restart is expensive.** Alarm state is lost and re-fires as fresh
  TRIGGERs, device health/backoff is cleared, debounce dwell resets, and the
  upstream timeseries gap is not backfilled. It must never be triggered
  automatically.
- **`metadata.applied_at` is never stamped for `modbus_device`.** Applied state
  cannot be derived from the server.
- **Config writes have no lock and no precondition**, and the Orion cloud push
  writes the same files. Concurrent writers race; last one wins.

## Decision

1. **Delete `promptRestart()` and the modal it raised.** The i18n keys only it
   read (`restartMessage`, `restartNow`, `restartLater`, `restartReminder`) are
   removed from `TalosRestartI18n`, from each view's `restartI18n` computed, and
   from `src/locales/en.ts`, `src/locales/zh-TW.ts` and `src/types/i18n.ts`.
   `restartTitle` survives because `confirmRestart()` still reads it.

2. **A config write marks its scope pending in a new Pinia store**,
   `src/stores/restart.ts`. The store holds one fact: which scopes have config
   written but not yet applied. Scopes are `'modbus' | 'system' | 'instance'`.
   Every former `promptRestart()` call site now calls
   `restartStore.markPending('<scope>')`. Marking happens when the write
   succeeds, not when anything is answered: the config is on disk by then.
   Each view's existing success toast is unchanged.

3. **The banner is store-driven and global.** Each view's inline banner keeps
   its markup; only its `v-if` changed, to `restartStore.showBanner`. The banner
   is visible iff something is pending and the operator has not dismissed it
   since the last `markPending`. The dismissed flag is one boolean in the store,
   not per view: dismissing in one config view hides the banner in all of them
   until the next mark. On `main` each view had its own banner; this is an
   intended behaviour change.

4. **A confirmation remains on explicit restart actions.** The header
   "Restart Service" button in each view still goes through `confirmRestart()`
   (unchanged), and the banner button still calls `restartNow()` directly as on
   `main`. That is where a confirmation belongs: before an action that kills
   the process. Restart is never automatic.

5. **Nothing is cleared before a restart succeeds.** `restartNow()` snapshots
   the pending `[scope, markId]` pairs synchronously before the POST and threads
   the snapshot through `startCountdown` and every `pollUntilUp` attempt.
   Clearing happens only on the polling-success path, via
   `clearMatching(snapshot)`, which deletes an entry only if its **current**
   mark id still equals the snapshotted one. A scope re-saved while a restart
   is in flight carries a newer id and stays pending. `clearMatching` never
   reads the live Map to decide what to clear: a save that landed after the
   POST would otherwise be silently discarded.

6. **The `success: false` branch stays** as defensive handling, with a one-line
   note that Talos does not currently return it.

7. **Every write path marks, and marks on the write's success path.** Two parts,
   one rule.

   *Every write path marks.* Three paths in `InstanceConfigView` were unflagged
   on `main` and now mark: `handleAddInstanceDirect`, `handleImportPinMapping`,
   and the pin-mapping tab's restore-backup branch of `handleRestored`. They
   were harmless while the other prompts existed; now that the banner is the
   only indicator, a write with no mark is an un-applied config with no trace.
   A deliberate one-step widening.

   *The mark goes on the write's success path, never after a subsequent
   refetch.* Most handlers refetch to refresh the screen after writing, and
   that refetch can fail on its own — in every one of these handlers it sits
   inside the same `try`. A mark placed after it would be skipped on a refetch
   failure, leaving the config written, unmarked and the banner absent: the
   same hole the paragraph above closes. So on every marking path the mark
   immediately follows the successful write, before any refresh. Where the
   write happened elsewhere and the handler only learns of it — the
   restore-backup handlers, which receive a `restored` event from
   `BackupDialog` — the mark is the handler's first statement. The rule is
   recorded on `markPending` in `src/stores/restart.ts`, and a test per view
   asserts the scope is still pending when the refetch rejects. Nothing else in
   these handlers changed.

   One residual, not closed here: each mutation action in the config stores
   ends with its own `await fetchConfig()` inside the awaited write call (for
   example `src/stores/modbus_config.ts:184`). A failure of *that* refetch
   rejects the write itself, so the handler cannot distinguish it from a failed
   write and does not mark. Closing it means changing store behaviour, which is
   out of scope for this change; tracked as
   `docs/tickets/0002-config-store-refetch-inside-write.md`.

8. **`pin_mapping` folds into the `'instance'` scope.** `handleImportPinMapping`
   and the pin-mapping restore write the `pin_mapping` config kind, not
   `device_instance_config`, yet they mark `'instance'`. A restart applies every
   kind at once and the banner does not name scopes, so the distinction has no
   consumer today. It is stated here, and on the `RestartScope` type, so that a
   later change which does name scopes in the banner finds it recorded rather
   than inferred.

9. **`MqttConfigView` and `src/stores/mqtt.ts` are untouched.** That view
   already implemented this pattern: its save path sets
   `mqttStore.restartRequired` and shows a toast, and its only
   `ElMessageBox.confirm` sits behind an explicit restart button.

## Alternatives considered

- **Moving polling and `isRestarting` into the store** so a restart started in
  one view completes and clears the banner even after the view unmounts. This
  is the architecture of an earlier, abandoned branch and was explicitly
  rejected for this change (see Consequences, accepted degradation).
- **Per-endpoint restart routing, a multi-button banner, per-endpoint
  readiness probing.** Rejected: the Talos scan shows one process and one
  probe; there is nothing to route to.
- **A completion event carrying scopes.** Rejected: each view keeps its own
  `onRestarted` callback; no consumer needs more.
- **Auto-restart after a save, or a preference for it.** Rejected outright:
  the restart cost (§4 of the Talos scan) is paid by the operator, not the UI.
- **Deriving applied state from the server.** Not possible: `applied_at` is
  never stamped for `modbus_device`.
- **Batching several device edits into one save.** Separate, later change.
  This change removes the modal; it does not remove the repeated saves.

## Consequences

### Accepted degradation: polling is per view

`useTalosRestart` is instantiated per view and `onUnmounted(stopTimers)` kills
its polling. On `main` this was invisible because the banner was
component-local and died with the view. Now that pending state lives in a
store and outlives the view, navigating away during a restart leaves the banner
standing even after Talos is genuinely back. The operator can dismiss it, or
press "Restart Service" again.

This was accepted deliberately rather than closed by moving polling into the
store: a stale banner is recoverable, a silently cleared one is not, and the
store-owned-polling design is the abandoned branch's architecture, out of scope
here. The invariant comment above `onUnmounted` in the composable records it.

Related and also unchanged: `isRestarting` is per view, so another view's
header "Restart Service" button is not disabled during a restart and a second
POST is possible. True on `main`; neither worsened nor fixed.

### Banner dismissal is global

Dismissing the banner in one config view hides it in the others until the next
`markPending`. Pending state is retained across dismissal.

### Test surface

`src/composables/useTalosRestart.ts` and the three views had no unit coverage
on `main`. This change adds a shared stub harness
(`src/views/config/__tests__/configViewHarness.ts`), a store test, a composable
test, one test file per view and a cross-view test. Characterization tests
pinning the `main` behaviour were committed first and then inverted.

## Limitations carried forward

- **`metadata.applied_at` is never stamped for `modbus_device`**, so applied
  state cannot be derived from the server. The client's pending marks are the
  only record.
- **Config writes have no concurrency control.** No `If-Match`, generation or
  checksum is sent; the Orion cloud push writes the same files; last writer
  wins. Not detected, not built against.
- **A save from a dirty form can revert another writer's change**, and the
  client cannot close this without a server-side precondition.
- **`SystemConfigView` re-seeds its form from a watcher.**
  `watch(currentConfig, …, { immediate: true })` at
  `src/views/config/SystemConfigView.vue:337-347` means any refetch, including
  the post-restart `onRestarted` refresh, overwrites unsaved edits. Confirmed
  during this change; neither caused nor worsened by it; out of scope to fix.
- **Concurrent restarts are not prevented** (see above).
- **Pending state does not survive a page reload.** It lives in a Pinia store,
  so a reload loses it and a saved, un-applied config goes unindicated until
  the next write. Persisting the map to `localStorage` was considered and
  declined: it has no clearing authority. Because `metadata.applied_at` is
  never stamped for `modbus_device` (Talos
  `docs/scan/talos-config-restart-cost.md`), there is no server fact to
  reconcile against, so a persisted entry could only ever be cleared by a
  restart that this same browser both initiated and polled to success. Talos
  restarts routinely outside this UI — systemd, SSH, a power cycle, and an
  Orion cloud config push, which awaits `trigger_restart()` (Talos
  `src/core/mqtt/config_subscriber.py:251`, defined at
  `src/core/mqtt/config_executor.py:1193`). `localStorage` is also per-browser,
  so an integrator who saves and an on-site operator who restarts do not share
  the record. The result would be a warning that looks permanently true and
  cannot be cleared, which is worse than the gap it closes. This is not a
  regression from this change: on `main` the banner was component-local and was
  lost on plain navigation, let alone a reload; this change makes it survive
  navigation but not yet a reload. The real fix is server-side applied state —
  stamping `applied_at` for `modbus_device` — tracked as
  `docs/tickets/0001-talos-stamp-applied-at-for-modbus-device.md`.
- **A restart started from `MqttConfigView` does not clear pending scopes.**
  `POST /api/mqtt/restart` restarts the whole Talos process, so it does apply
  the Modbus, System and Instance config too; but that path runs through
  `mqttStore.restartService()` (`src/stores/mqtt.ts:235-240`), which never
  touches the restart store. The banner therefore still stands on the config
  views after an MQTT-initiated restart, and the operator may restart a second
  time — another whole-process restart, another loss of alarm state.

  This one is new with this change: on `main` the banner was component-local
  and died on navigation, so returning to a config view showed nothing either
  way.

  The obvious wiring — calling `clearMatching` from `restartService` — would
  be wrong, and was rejected for that reason rather than for scope.
  `restartService` resets `restartRequired` on the line after the POST resolves
  (`src/stores/mqtt.ts:239`), with no readiness probe; the endpoint is
  fire-and-forget and never returns `success: false`. Clearing there would
  discard pending scopes on an unconfirmed restart, which is exactly the defect
  this change removed from `restartNow()` and which `clearMatching` in
  `src/stores/restart.ts` now carries an invariant comment against. Doing it
  correctly means giving the MQTT path the same snapshot-and-probe flow, which
  means routing `MqttConfigView` through the shared restart flow and retiring
  `mqttStore.restartRequired` as a second source of truth — both out of scope
  here. **This limitation is the prerequisite for that ticket**, listed below.

  Standing pat is the conservative side, and consistent with the accepted
  degradation for navigating away mid-restart: a wrongly cleared banner is
  unrecoverable, a stale one is dismissable.

## Deferred work

Each of these is a separate ticket, named here so it is not mistaken for an
oversight:

- Extracting the three inline banner / restarting-dialog copies into shared
  components.
- A restart-completion event, if a consumer ever needs one.
- Routing `MqttConfigView` through the shared restart flow: giving the MQTT
  path the same snapshot-and-probe sequence, retiring
  `mqttStore.restartRequired` as a second source of truth, and replacing that
  view's hard-coded English restart strings. This is what closes the stale
  banner after an MQTT-initiated restart, recorded above; that limitation is
  its prerequisite and should be read first.
- The dirty-refetch rule in `SystemConfigView` (and any other view).
- Draft or batch-save behaviour for Modbus devices, navigation guards,
  `beforeunload`.
