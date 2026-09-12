# DR-0001 — One restart and one probe: the two-endpoint restart model is collapsed

- **Status**: Accepted
- **Date**: 2026-09-12
- **Supersedes**: the per-endpoint restart model built on branch
  `claude/talos-modbus-restart-ux-z6koji` in commits `7d50b32`, `a13b6ac` and
  `cc21879`. Those commits stay in history; this record explains why their
  routing machinery was deleted in the commit that adds it.

## Context

### What the two-endpoint model was

Talos exposes two restart URLs: `POST /api/provision/service/restart` and
`POST /api/mqtt/restart`. Whether they restarted the same process was, at the
time, an open backend question, and the client was built not to assume the
answer. Commits `7d50b32` through `cc21879` therefore modelled a distinction:

- a `RESTART_ENDPOINTS` table with one entry per URL, each with its own
  readiness probe (`GET /api/provision/config` for Talos,
  `GET /api/mqtt/status` for MQTT) and its own acceptance rule;
- a `SCOPE_ENDPOINTS` map routing each config scope (`modbus`, `system`,
  `instance`, `mqtt`) to the endpoint that would apply it;
- a pending-restart banner rendering one row and one button per endpoint with
  pending scopes, labelled "Restart Service" or "Restart MQTT Service";
- a completion event carrying `{ at, scopes }`, where `scopes` named what that
  restart had cleared, so that each config view could refetch only when its own
  scope was among them.

The mapping's own comment said what would happen if the question were answered:
"If a backend scan confirms the two endpoints restart the same process, delete
this mapping, the `restartMqttService` copy, and the banner's per-service
rendering together: one endpoint means one button again."

### What the scan established

The Talos repository's `docs/scan/talos-config-restart-cost.md`, section 11,
answered the question from the code, with `path:line` citations:

- **Same process, unambiguously.** Both handlers resolve the same FastAPI
  dependency (`get_provision_service`) and await the same method,
  `ProvisionService.restart_talos_service`, which sends `SIGKILL` to its own
  PID. `POST /api/mqtt/restart` does not restart an MQTT subsystem; it kills the
  whole Talos process, identically to the provision endpoint. There is no
  MQTT-only restart.
- **The probe is accurate and conservative.** `GET /api/provision/config` is
  served by the process being killed, so it fails at the transport layer until
  systemd respawns Talos. `await server.serve()` is the last statement of the
  startup sequence, after device construction, both sequential health-check
  passes and the monitor start. A 200 therefore cannot arrive early.
- **`success: false` is never returned.** The restart method has a single,
  unconditional success return; the kill is scheduled as a fire-and-forget task
  after the response is sent.
- **A restart is expensive and irreversible from the client.** Alarm state is
  in-memory and lost, so a violation still present re-fires as a new trigger;
  device health and backoff are cleared and every device is re-probed at full
  rate; debounce dwell timers restart from zero; and the upstream timeseries gap
  covering the restart window is lost, not backfilled.

The per-endpoint model therefore described a distinction the server does not
have. Its relevance filtering was not merely unnecessary but wrong: after any
restart, every view's configuration and metadata are stale, so a view that
declined to refetch because "its" scope was not named was keeping stale data on
screen.

## Decision

**D1. One restart endpoint and one readiness probe, both constants in the
restart store.** `POST /api/provision/service/restart` and
`GET /api/provision/config`. No map, no per-scope lookup, no indirection kept
for later. The invariant comment at those constants records the scan's finding,
the reason a successful probe counts as "restart complete", and the reason a
restart must never be triggered automatically.

**D2. Scopes are labels, not routes.** `pendingScopes` remains
`Map<RestartScope, number>`; a scope now says only what the operator has changed
and not yet applied. The banner renders one row naming every pending scope and
one "Restart Service" button.

**D3. The completion event is a timestamp only.** `RestartCompletion` is
`{ at }`, published after a successful readiness poll and fresh on every
completion. Every config view watches it and refetches unconditionally.

**D4. Restart remains manual.** Nothing in this change, and nothing built on it,
may start a restart without an explicit user action.

### What was deleted

- `RESTART_ENDPOINTS`, `SCOPE_ENDPOINTS`, the `RestartEndpointId` and
  `RestartEndpoint` types, the per-endpoint `pollUrl` and `isAccepted`, and
  `restartEndpoint(id)`.
- `GET /api/mqtt/status` as a readiness probe. It is not used anywhere after
  this change; it remains in use as a status read on the MQTT and Provision
  screens, which is a different purpose.
- `POST /api/mqtt/restart` as a call site, including the dead
  `restartMqttService` service function that had had no caller since `a13b6ac`.
- The banner's per-endpoint rows and its second button.
- `scopes` on the completion event, and the per-view membership test against it.
- The i18n key `restartMqttService` in both locales and the type.
- The tests that pinned each of these.

### What was kept, and why

- **Mark ids and snapshot-based clearing.** A restart still clears only the
  writes it was carrying, because nothing in the restart response or the probe
  reports which configuration the new process came up with. A scope re-saved
  during an in-flight restart stays pending after that restart completes.
- **The dirty guard and its ask-before-fetch ordering** (from `cc21879`). It is
  now the only thing protecting unsaved edits, because every view refetches on
  every restart. No dirty predicate was rewritten.
- **`registerGateway` marking `mqtt` pending on `restart_required`.** It is the
  only server-declared restart signal in the codebase.
- **The `success: false` branch in the restart flow.** The server does not
  return it today; the branch is defensive handling and no UI is built on it.
- **`RestartingDialog.vue`**, non-dismissable as before.

## Consequences

- The restart surface is one URL, one probe, one button and one event. There is
  no state left in the client that a second endpoint would need.
- Every config view refetches after every restart. Views with forms (System,
  MQTT) keep unsaved edits through that refetch by the existing dirty guard and
  say so only when the stored values actually changed. Views without forms
  (Modbus, Instance) simply reload.
- Any future distinction between services would have to be re-established from
  the server side first, by a scan of the kind that produced this record.

## Known limitations carried forward

Both are server-side facts recorded in the same scan and are not addressed here.

1. **`metadata.applied_at` is never stamped for `modbus_device`.** Talos marks
   `applied_at` only for `time_condition`, `control_config` and the executor
   path; a restart does not advance it for the modbus device file. Applied
   state therefore cannot be derived from the server, and the client's pending
   marks remain the only record that a saved configuration is not yet running.
2. **The config write path has no concurrency control.** Two writers to the same
   config file are last-writer-wins, silently; there is no version check, lock
   or conditional write. A concurrent writer is neither detected nor prevented,
   by the server or by this client.
