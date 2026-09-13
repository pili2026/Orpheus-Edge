# Talos: stamp `metadata.applied_at` for `modbus_device`

Repository: **Talos** (`pili2026/Talos`) — not Orpheus Edge. Nothing in this
frontend can fix it.

Raised while removing the per-save restart prompt in Orpheus Edge
(`docs/decisions/0001-remove-per-save-restart-prompt.md`).

## Defect

The apply-stamping mechanism exists and works — it is simply never invoked for
`modbus_device`.

Talos stamps `metadata.applied_at` only from a genuine apply seam, never from a
write. The write path deliberately carries the prior on-disk value forward so a
write cannot forge it (Talos `src/core/util/yaml_manager.py:229-234`, the
carry-forward at `:234`), and `mark_applied()` does the stamping
(`yaml_manager.py:316-329`, the write at `:340`). Its docstring is explicit that
only an apply seam may call it.

Every caller of `mark_applied`, per `docs/scan/talos-config-restart-cost.md` §9
in the Talos repository:

| Call site | Kind |
|---|---|
| `src/main_service.py:925` (`_reload_time_control`) | `time_condition` |
| `src/main_service.py:960` (`_reload_control`) | `control_config` |
| `src/core/mqtt/config_executor.py:1015` | the pushed kind, on a confirmed live apply |

**`modbus_device` is in none of them, and no startup code calls `mark_applied`
either.** So for `modbus_device`:

- `applied_at` is `None` on a file that never carried one, and otherwise is
  carried forward unchanged forever.
- It does not change on restart — and a restart is the only way this kind is
  ever applied, since there is no hot reload for device config (same scan, §3).
- The intended client predicate, `applied_at < last_modified` reading as
  "written, not applied" (stated at `yaml_manager.py:233`), is therefore
  **permanently true** for this kind. It cannot distinguish a pending write from
  a config that is already running, and a client polling it across a restart
  observes no change.

The field is declared on the Orpheus Edge side at
`src/stores/modbus_config.ts:15` and read by nothing, because there is nothing
useful to read.

## Why this is the root cause behind three frontend problems

Orpheus Edge now tracks un-applied config in a client-side store
(`src/stores/restart.ts`), because the server cannot tell it. Every weakness of
that approach traces back here:

1. **Codex P2, "Preserve pending restart state across page reloads"**
   (PR #18, `discussion_r3999331933`, on `src/stores/restart.ts:28-29`). The
   pending map is in memory, so a reload loses it. Persisting it to
   `localStorage` was rejected because there is no server fact to reconcile
   against: a persisted entry could only ever be cleared by a restart that the
   same browser both started and polled to success, so the warning would become
   permanently true-looking and un-clearable — the same permanent-truth
   failure the `applied_at` predicate already has.
2. **Codex P2, "Reconcile pending scopes after MQTT restarts"**
   (PR #18, `discussion_r3999514116`, on
   `src/composables/useTalosRestart.ts:162`). A restart started from
   `MqttConfigView` leaves the banner standing. The frontend can close this one
   on its own, but only by observing its own POST and probe — not by asking
   the server what is applied.
3. **No cross-client agreement.** An integrator who saves and an on-site
   operator who restarts hold different pictures, and always will, while
   "applied" lives only in a browser. Talos also restarts outside the UI
   entirely — systemd, SSH, a power cycle, or an Orion cloud config push
   (`src/core/mqtt/config_subscriber.py:251`, awaiting `trigger_restart()`
   defined at `src/core/mqtt/config_executor.py:1193`).

Stamping `applied_at` collapses all three into one server read.

## Why it was not fixed in the Orpheus Edge change

It is a Talos-side change. For `modbus_device` the apply *is* the restart, so
the stamp belongs in the startup path, after the process has genuinely
constructed the device set and started the monitor — the scan puts monitor
start at `src/main_service.py:1210` and the API bind at `:1244`. That is Talos
territory, and no amount of frontend work substitutes for it. The Orpheus Edge
PR carries the consequence as an accepted, documented limitation instead.

## Done looks like

- A startup-side apply seam calls `mark_applied('modbus_device')` once the
  running process has loaded that generation, so `applied_at` advances on
  restart.
- `GET /api/config/modbus` then returns an `applied_at` that a client can
  compare against `last_modified` to get a true "written, not applied" answer.
- Orpheus Edge can replace its client-side pending map with that comparison,
  retiring both Codex findings and the reload limitation together.
