# DR-0002 — A save that would revert another writer's change is refused

- **Status**: Accepted
- **Date**: 2026-09-13
- **Extends**: DR-0001. The collapse recorded there made every config view
  refetch on every restart, which reaches the path described here far more
  often than before. Nothing in DR-0001 is changed.

## Context

The dirty guard from commit `cc21879` keeps a form's unsaved edits when a
refetch finds that the stored configuration changed underneath it: the edits
stay, the baseline moves to the fetched values, and the operator is told the
stored configuration changed. That is the right treatment of the operator's
work. It is not, on its own, a safe treatment of the other writer's work.

The three forms it protects save whole documents. The MQTT view sends its
entire draft; the System view sends all four fields it owns; the Provision
view sends both of its fields. None of them can tell an edited field from an
untouched one. So a form kept dirty across a server-side change still holds
the pre-change values in every field the operator did not touch, and the save
that follows writes those values back, reverting the other writer with both
sides reporting success.

Concurrent writers are real. The Orion cloud push writes the same
configuration files (Talos scan, section 8), as do imports and other
operators. The scan's section 10 established that no config write carries a
precondition of any kind: no `If-Match`, no expected generation or checksum,
no lock shared between the HTTP path and the MQTT path. Two writers race and
the last one wins.

## Decision

**D1. One check, at save time, in one shared helper.**
`useStoredConfigCheck` re-reads the stored configuration immediately before
the write and compares it with the baseline the form was loaded against. The
three views call it; there is one comparison, not three.

**D2. The comparison is baseline against stored, never draft against
stored.** The question is "did anything move since this form was loaded", not
"does the draft differ from the server" -- the draft always differs, that is
what a save is for. A field the server changed is reported whether or not the
operator also edited it.

**D3. Any difference refuses the save.** Nothing is written, the operator's
edits stay in the form, and the refusal names the fields that moved using the
labels the form itself shows. A failed re-read refuses the save too: the
check never falls through to a write it could not perform.

**D4. Save time, not refresh time.** A flag raised during a refresh would miss
a change that lands after that refresh and before the save. Re-reading
immediately before the write is the latest point the client can look.

**D5. What the save sends is unchanged once the check passes**, and the dirty
guard, every dirty predicate, and the ask-before-fetch ordering are untouched.
The comparison covers the fields the save writes: a read-only field such as
the System view's `reverse_ssh_port` or the Provision view's `port_source`
cannot be reverted by the save and is not part of it.

**Not done, deliberately.** No per-field touch tracking, no three-way merge,
no automatic reconciliation: merging two operators' configuration without
showing either of them produces a configuration nobody designed. No force or
override path. No `If-Match`, generation or checksum on the request: the
server honours none of them.

## Consequences

- A save over a changed store fails loudly and names what moved. The operator
  refreshes, which keeps their edits and moves the baseline, and saves again.
- After that refresh the form's untouched fields still hold the values loaded
  before the change, because the dirty guard withholds the copy into a dirty
  form wholesale. The retried save therefore still writes those values. The
  check makes the situation visible; telling an untouched field from an
  edited one needs per-field tracking, which is the next stage.
- The refusal message and the re-read failure message are new keys in both
  locales.

## Known limitations carried forward

The two from DR-0001 stand, and a third is added.

1. **`metadata.applied_at` is never stamped for `modbus_device`.** Applied
   state cannot be derived from the server.
2. **The config write path has no concurrency control.** A concurrent writer
   is neither detected nor prevented by the server.
3. **The race is narrowed, not closed.** A writer can still land between the
   save-time read and the write that follows, and the client cannot see that
   happen. Closing the window needs a server-side precondition, which the
   config API does not provide.
