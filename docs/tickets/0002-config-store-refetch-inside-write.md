# Config stores fold their own refetch into the awaited write

Repository: **Orpheus Edge**.

Raised while removing the per-save restart prompt
(`docs/decisions/0001-remove-per-save-restart-prompt.md`, decision item 7, where
it is recorded as a residual that change could not reach).

## Defect

Several config-store mutation actions end with their own `await fetchConfig()`
*inside* the same awaited call the view makes. A failure of that refetch rejects
the write, so a caller cannot tell "the write failed" from "the write succeeded
and the refresh afterwards failed". Three consequences follow, in order of
severity:

1. The operator is told the save failed for a config that is **on disk**.
2. In the Modbus store the success toast has already fired before the refetch
   runs, so the operator sees a success toast and then a failure toast for one
   action.
3. **New with the restart-banner change:** the view's
   `restartStore.markPending(...)` sits after the awaited write, so a rejected
   write means no mark — no banner at all, for a config that is written and
   un-applied.

### Affected sites

| Store action | Write | Success toast | Refetch |
|---|---|---|---|
| `createOrUpdateBus` | `src/stores/modbus_config.ts:145` | `:147` | `:148` |
| `deleteBus` | `:163` | `:165` | `:166` |
| `createOrUpdateDevice` | `:181` | `:183` | `:184` |
| `deleteDevice` | `:199` | `:201` | `:202` |
| `updateConfig` | `src/stores/system_config.ts:43` | none in store | `:44` |

`src/stores/system_config.ts` has no success toast of its own; the view reports
the failure instead, at `src/views/config/SystemConfigView.vue:385`.

### Not affected

`src/stores/instance_config.ts` is immune by construction: `updateDevice`
(`:152`) and `updateInstance` (`:171`) assign `config.value = res.data` from the
write's own response rather than issuing a separate refetch. Any fix should
prefer this shape where the endpoint returns the new state.

## Status

**Pre-existing on `main`** for consequences 1 and 2 — the store has always
awaited its refetch inside the write. Consequence 3, the missing pending mark,
is new with the restart-banner change, because the banner is now the only
indication that a config is written but not applied.

## Why it was not fixed in the restart-prompt change

Fixing it means changing store behaviour: either separating the refresh from the
write so a refresh failure surfaces on its own, or adopting the
`instance_config` shape and assigning from the write response. Either touches
every view that calls these actions and changes what a rejected call means.
The restart-prompt change deliberately kept the stores untouched, and closed
what it could reach instead: within each view handler, the pending mark now
precedes any refetch the handler itself performs, so only a refetch *inside* the
store can still lose a mark.

## Done looks like

- A failed post-write refresh no longer presents as a failed write: no
  "save failed" toast for a config that is on disk, and no success-then-failure
  pair for one action.
- The pending mark survives a post-write refresh failure wherever it originates,
  not only when the refetch is in the view.
- Prefer assigning from the write response, as `instance_config` does, over a
  second round trip, where the endpoint makes that possible.
