# Locking a plan

## Purpose

Freeze an agreed baseline. Once sprint planning is done and dates are
committed, a locked plan cannot be edited by accident — not through the
structure panel, not by dragging a bar, not by the chart writing back values of
its own. Unlocking is deliberate and takes two steps.

This is not access control. Anyone can unlock the plan, or edit the JSON in
Drive. Drive permissions are the only real enforcement. The lock protects
against slips, not against people.

## Where the lock lives

`PlanDocument.locked?: boolean`.

A document field, so it travels to Drive with the plan and comes back with it.
Optional and additive: `schemaVersion` stays at 1, and plans saved before this
feature load as unlocked. `validate` rejects a present-but-non-boolean value.

## The choke point

The gate belongs in `store.apply`, not in the UI.

Disabling buttons is not enough. The chart is an independent writer: it reports
its own `valueschanged` events, which `ingestTasks` turns into a document. A
UI-only lock would leave that path open. One gate at the store covers every
writer that exists now or later.

    apply(m, options)  refused when doc.locked, unless options.allowLocked
    replace(doc)       never gated — open and restore swap the whole document

Only `setLocked` passes `allowLocked`. A refused apply changes nothing and
notifies nobody, so there is no render and no feedback loop.

The chart is also told `editable: false` while locked, pushed on change through
the same path as the calendar settings. That removes the drag handles rather
than letting a drag appear to work and be silently rejected: the affordance has
to match reality. The store gate stays as the backstop.

## Interactions decided

**Restore preserves the current lock.** Restoring a revision is allowed while
locked, but an old revision predating the lock carries `locked: false`, so
adopting it wholesale would silently unlock the plan. Restore rolls back the
content and keeps the lock as it is. Opening a *different* plan is not the same
thing — that adopts whatever that file says.

**A `Save as…` copy arrives unlocked.** Branching off a frozen baseline in
order to work on it is the point. The original stays locked and untouched.

**Locking needs no confirmation.** It is safe and reversible. Only unlocking
is gated.

**Locking marks the plan dirty**, like any other change, and is persisted by an
ordinary save. Auto-saving would demand auth at a moment the user did not ask
for it.

## Unlock flow

Two steps, because repeated identical dialogs train people to click through
without reading:

1. A dialog whose Unlock button stays disabled until the plan's **exact name**
   is typed. Typing cannot be done reflexively, and it forces the user to
   notice which plan they are unlocking.
2. A short confirm.

Cancelling at either step leaves the plan locked.

## What the lock disables

Disabled: add team / stream / item, rename, colour, move, delete, the duration
unit buttons, and every chart edit.

Still available: Open, Save, Save as…, History and restore, Fit, pinch and
ruler-drag zoom, collapsing rows, the panel toggle.

Collapse is stored in the document but no code path currently writes it back —
`setCollapsed` exists and is unused, and the chart handles collapsing
internally. If it ever does round-trip, it must pass `allowLocked`.

## Testing

- Store: apply refused while locked, `allowLocked` passes, `replace` still
  works, a refused apply does not notify.
- Mutations: `setLocked` sets and clears.
- Schema: `locked` round-trips, absent means unlocked, non-boolean rejected.
- Save controller: restore keeps the current lock, open adopts the file's,
  `Save as…` writes an unlocked copy.
- UI: Toolbar and StructurePanel controls disabled while locked; the unlock
  dialog needs the exact name and a second confirm.
- Chart: `editable` follows the lock.
- End to end: lock, confirm Add team is disabled, unlock by typing the name,
  confirm editing works again.
