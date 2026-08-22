# Scrum Gantt — Design

**Date:** 2026-08-22
**Status:** Approved

## Purpose

A Gantt chart for planning across multiple scrum teams and multiple streams of
work. Plans are saved to the user's Google Drive as JSON snapshots that can be
reopened, modified, saved again, and restored from history.

The app is a static single-page application hosted on GitHub Pages. It has no
backend and no server-side secrets.

## Scope

In scope for v1:

- Team → Stream → Item row hierarchy with collapsible groups
- Today marker and zero-duration milestone markers for releases
- Cross-team dependency links between items
- Per-item progress (0–100) shown on the bars
- Manual save to Google Drive with a dirty indicator and a localStorage draft
- Open from an app-owned Drive folder, or via the Google Picker for plans
  shared by colleagues
- Restore from save history (Drive revisions)

Explicitly out of scope for v1:

- **Sprint ruler.** Rendering a configurable sprint cadence as the minor x-axis
  was considered and rejected for v1. The timeline shows calendar dates. This is
  the most likely v1.1 addition.
- Resource or capacity modelling
- Real-time multi-user collaboration. Concurrent edits are handled by conflict
  detection, not merging.
- Any server-side component

## Charting library

`am5gantt.Gantt` from amCharts 5.

amCharts 5 is proprietary but free to use; the only restriction is a small
amCharts branding link on the chart which must not be hidden or altered. Gantt
is licensed as a standalone product, and no license purchase is required to
ship. Paid licenses exist solely to remove the branding link.

The Gantt class is used rather than a simulated XY column chart because it
provides, without custom code: editable drag-and-resize tasks, dependency
links, progress bars, collapsible parent/child grouping, weekend and holiday
handling, and a `valueschanged` event.

Coding rules for amCharts are in `.claude/skills/amcharts5/`. The
Gantt-specific reference is `references/gantt.md`.

## Architecture

Four layers. Dependencies point downward only.

```
┌─────────────────────────────────────────────────────┐
│  ui/          toolbar · structure panel · dialogs   │
│               (React, no amCharts, no Drive)        │
└────────────┬────────────────────────────┬───────────┘
             │                            │
             ▼                            ▼
┌─────────────────────────┐   ┌───────────────────────┐
│  chart/GanttView.tsx    │   │  storage/             │
│  ONLY file importing    │   │   googleAuth          │
│  @amcharts/*            │   │   driveClient         │
│  store ⇄ am5gantt.Gantt │   │   localDraft          │
└────────────┬────────────┘   └───────────┬───────────┘
             │                            │
             ▼                            ▼
┌─────────────────────────────────────────────────────┐
│  core/   PlanDocument · store · schema · invariants │
│          pure TypeScript — no DOM, no network       │
└─────────────────────────────────────────────────────┘
```

### Enforced boundaries

These are lint rules, not conventions:

1. Only `chart/` may import `@amcharts/*`.
2. `ui/` and `storage/` must not import `chart/`. The composition root
   `src/App.tsx` sits outside `ui/` precisely so this rule needs no exception:
   `ui/` holds presentational components, and wiring the layers together is a
   separate job belonging to a separate file.
3. `core/` must not import from any other layer.

Rule 1 is what keeps the amCharts rules (`.new()` factory, `am5.color()`,
epoch-ms timestamps, set-data-last, mandatory `root.dispose()`) contained in a
single reviewable file.

### Rationale

The snapshot is a *document*. It gets an in-memory representation independent
of the widget that renders it. Save, Open, Save-As, History, the dirty
indicator, the local draft, and schema versioning all follow from that, and the
imperative canvas component stays quarantined behind one interface.

React was chosen over plain TypeScript for `ui/` only. The structure panel is a
tree with inline rename, colour editing, reordering and cascade delete, plus
three dialogs and a dirty-state toolbar — hand-rolled DOM for that amounts to
writing a small, worse reconciler. `core/` and `storage/` are
framework-agnostic and unaffected by this choice, so it is cheap to reverse.

The known hazard of React over a stateful canvas component is addressed by
mounting the chart once in an effect with empty dependencies, disposing it on
cleanup, and feeding it through a store subscription rather than through props.
React never re-renders the chart.

## File layout

No file should exceed roughly 150 lines.

```
src/
  core/
    types.ts              PlanDocument, Row, Task, Calendar, ViewState
    store.ts              get / apply / subscribe / isDirty
    mutations.ts          addTeam, addStream, addItem, rename, move, remove…
    invariants.ts         parent-kind rules, orphan and link-cycle checks
    schema.ts             schemaVersion, migrate(), validate()
  chart/
    GanttView.tsx         mount/dispose; the ONLY amCharts import
    projection.ts         PlanDocument → { rows[], tasks[] }   (pure)
    ingest.ts             chart valueschanged → mutations       (pure)
  storage/
    googleAuth.ts         GIS token client, drive.file scope
    driveClient.ts        list / read / write / revisions / picker
    localDraft.ts         localStorage mirror + recovery
  ui/
    App.tsx
    Toolbar.tsx           Open ▾ · Save · Save as… · History ▾ · dirty dot
    StructurePanel.tsx    tree container
    StructureRow.tsx      one row: rename, recolour, delete
    OpenDialog.tsx
    HistoryDialog.tsx
    useStore.ts           useSyncExternalStore bridge to core/store
```

## Data model

```ts
type RowKind = "team" | "stream" | "item";

interface Row {
  id: string;            // stable uuid; never the display name
  name: string;
  kind: RowKind;
  parentId?: string;     // team → undefined | stream → team | item → stream
  color?: string;        // "#rrggbb" in the file; am5.color() at the boundary
  collapsed?: boolean;
}

interface Task {
  id: string;            // === Row.id (the Gantt requires this correspondence)
  start: number;         // epoch ms — DateAxis requires timestamps, not Dates
  duration: number;      // in calendar.durationUnit; 0 ⇒ milestone
  progress?: number;     // 0–100
  linkTo?: string[];     // dependency target ids, may cross teams
}

interface Calendar {
  durationUnit: "day" | "week";
  weekends: number[];        // 0 = Sunday … 6 = Saturday
  excludeWeekends: boolean;
  holidays: string[];        // ISO date strings
}

interface ViewState {
  zoom?: { start: number; end: number };   // epoch ms
  sidebarWidth: string;      // e.g. "30%"
}

interface PlanDocument {
  schemaVersion: 1;
  name: string;
  savedAt: string;           // ISO 8601
  calendar: Calendar;
  view: ViewState;
  rows: Row[];
  tasks: Task[];
}
```

### Decisions

- **Colours are hex strings in the file, never `am5.Color` objects.** Those do
  not survive `JSON.stringify` intact. Conversion happens in `projection.ts` at
  the chart boundary.
- **Only `kind: "item"` rows have a corresponding `Task`.** Team and stream rows
  are pure grouping; the Gantt derives their bars from their children.
- **Rows are a flat array with `parentId`,** matching what the Gantt's y-axis
  expects. It is not a nested tree.
- **Display order is array order.** There is no `order` field; reordering in the
  structure panel splices the `rows` array. A row must appear after its parent,
  and `invariants.ts` enforces that. This keeps the file diff-friendly across
  Drive revisions and avoids maintaining fractional ranks.
- **Collapsed state lives on `Row.collapsed`, not in `ViewState`.** The Gantt
  reads it directly through the y-axis `collapsedField`, so storing it twice
  would create two sources of truth that drift.
- `id` is a generated uuid so renaming a team or stream never breaks task
  correspondence or dependency links.
- **`durationUnit` is restricted to `"day"` or `"week"`.** The Gantt supports
  units from seconds to years; sprint planning needs neither extreme, and
  narrowing the type removes formatting and snapping cases that would otherwise
  need handling.

### Invariants

Enforced in `invariants.ts` and checked on every mutation:

- A `stream` row's parent must be a `team` row.
- An `item` row's parent must be a `stream` row.
- A `team` row has no parent.
- No row references a missing `parentId`.
- Every row appears after its parent in the `rows` array.
- Every `Task.id` matches an existing `item` row.
- Every `item` row has exactly one `Task`; no `team` or `stream` row has one.
- `linkTo` graphs contain no cycles.
- `progress` is within 0–100; `duration` is non-negative.

## Data flow

```
user edits panel ──► mutations.ts ──► store ──┐
                                              ├──► projection.ts ──► chart
user drags a bar ──► valueschanged ──► ingest.ts ──► store ──┘
                                                       │
                                                       ├──► localDraft (debounce 1s)
                                                       └──► dirty flag ──► Toolbar
```

### Breaking the feedback loop

The chart writes to the store and the store projects back to the chart, which
would loop indefinitely. Two independent guards:

1. `GanttView` sets an `applying` flag while pushing data into the chart and
   ignores any `valueschanged` fired during that window.
2. `store.apply` is a no-op when the mutation yields a structurally equal
   document, so an echo that slips past the first guard dies on arrival.

### Projection granularity

- **Structural edits** (add, remove, or reparent a row) trigger a full
  re-projection: `yAxis.data.setAll()` then `series.data.setAll()`.
- **Bar drags** mutate only the affected `Task`. They never rebuild the chart,
  so dragging cannot collapse groups or reset zoom.

Per the amCharts rule that data is set last, all chart configuration is applied
before either `setAll` call.

## Google authentication

Google Identity Services token client. No backend, no client secret.

```ts
google.accounts.oauth2.initTokenClient({
  client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
  scope: "https://www.googleapis.com/auth/drive.file",
  callback: onToken,
});
```

- `drive.file` is classified **non-sensitive**, so only basic OAuth app
  verification is required — no restricted-scope security review.
- Register `https://<user>.github.io` as an **Authorized JavaScript origin**.
  No redirect URI is needed; the token client uses a popup.
- The client ID is not a secret and ships in the bundle safely.
- The browser token flow returns **no refresh token**. Access tokens last about
  one hour.

The OpenID ID token is used only to display who is signed in. Identity is not
required for storage; `drive.file` scopes access on its own.

### Token lifecycle

`driveClient` wraps every request. A 401 is routine, not an error: attempt a
silent `requestAccessToken({ prompt: "" })`, retry the request once, and fall
back to an interactive prompt only if the silent refresh fails. A token
expiring mid-edit therefore never costs a save.

## Drive storage

Plans live in a visible `Scrum Gantt` folder in My Drive, one JSON file per
plan, so users can see, rename and share them.

### Save history uses pinned revisions

Drive only allows **downloading revisions of binary files that are marked
`keepForever`**. Ordinary revisions of a JSON file are purged after about 30
days, or sooner once a file accumulates 100 unpinned revisions. Without pinning,
the History menu would list revisions it cannot open.

Therefore every save performs:

1. Write content. First save of a plan is a create —
   `POST /upload/drive/v3/files?uploadType=multipart`, carrying the metadata
   (name, `parents: [folderId]`, `mimeType: application/json`) and the body in
   one request. Subsequent saves update in place —
   `PATCH /upload/drive/v3/files/{id}?uploadType=media`. Updating must reuse the
   existing file id; creating a new file each save would break sharing links and
   discard the revision history the feature depends on.
2. Pin it: `PATCH /drive/v3/files/{id}/revisions/{revId} { keepForever: true }`.
3. Prune: keep the newest 50 pinned; unpin older ones so Drive can reclaim them.

The cap is 200 pinned revisions per file and they count against the user's
storage quota, which is why the app keeps 50 rather than the maximum. The
History dialog states this plainly: *"Last 50 saves are restorable."*

### Opening files

Two paths, because `drive.file` grants access only to files **this app
created**, plus files the user explicitly hands it through the Google Picker:

- **My plans** — `files.list` with `q="'<folderId>' in parents and trashed=false"`.
  Fast, covers the common case of reopening your own plan.
- **Browse Drive…** — Google Picker. Required for opening a plan a colleague
  created and shared, which is otherwise invisible to the app. Needs a Google
  API key and the Picker script loaded.

### Conflict detection

Concurrent edits are detected, never merged. The `headRevisionId` is recorded
on load and re-fetched immediately before any write. If it has changed, the
write is refused and the user chooses: **Reload theirs**, **Save as a copy**, or
**Overwrite**.

### Save trigger

Manual. The user presses Save or Cmd/Ctrl+S, so each Drive revision is a
deliberate checkpoint and history stays meaningful. A dot marks unsaved changes
and warns before navigation. Every edit is separately mirrored to localStorage
within one second, so a crash or closed tab loses nothing.

## Error handling

Governing principle: **the local draft is the safety net, so no Drive failure
can lose work.** Every failure below degrades to "try again later" rather than
data loss.

| Failure | Handling |
|---|---|
| Popup blocked on sign-in | Detect the blocked-popup error, show an inline "Allow popups / Sign in" button so the retry is user-gestured |
| Access token expired (401) | Silent refresh, retry once, then interactive. Invisible in the normal case |
| Consent revoked / silent refresh fails | Signed-out state; document retained in memory and draft; banner "Reconnect to save" |
| Offline or network error on save | Stay dirty, keep draft, show "Couldn't reach Drive — your work is saved locally" with Retry |
| 403 rate-limit or 5xx | Exponential backoff with jitter, max 3 attempts, then treat as network error |
| `headRevisionId` moved | Never auto-merge; offer Reload theirs / Save as copy / Overwrite |
| File fails schema validation | Reject before it reaches the chart, name the offending field, leave the current plan untouched |
| Older `schemaVersion` | Run migrations |
| Newer `schemaVersion` | Refuse with "saved by a newer version of this app" |
| Invariant violation from a chart edit | `ingest.ts` rejects the mutation and re-projects, snapping the bar back. The store never holds an invalid document |
| Component unmount | `root.dispose()` in effect cleanup |

## Testing

**Vitest, no DOM — `core/` and pure chart modules.** Mutations and cascade
deletes; invariants (wrong-kind parenting, orphans, `linkTo` cycles); schema
round-trip and migrations; `projection.ts` including hex → colour and date →
epoch-ms conversion; `ingest.ts` echo suppression. This is where the real logic
lives and it needs no browser.

**Vitest with stubbed `fetch` — `storage/driveClient.ts`.** Three behaviours
carry the risk and must be pinned:

1. A 401 triggers exactly one silent refresh, then retries.
2. Every save pins `keepForever` and unpins beyond the newest 50.
3. A moved `headRevisionId` raises a conflict instead of writing.

**Testing Library — `ui/`.** Structure panel add/rename/reorder/cascade-delete,
and the dirty indicator tracking store state.

**Deliberately not unit-tested — `GanttView.tsx`.** amCharts renders to canvas,
which jsdom does not implement, so assertions there would be vacuous. The file
is kept thin for exactly this reason, with all logic in `projection`/`ingest`.
One Playwright smoke test covers it: load a fixture plan, assert the canvas
mounts and the console is clean.

## Credential handling (public repository)

The source repository is public. This is safe because the design contains no
secret material.

**No client secret exists.** The GIS browser token client was chosen over a
server-side OAuth code flow specifically so that no `client_secret.json` is ever
needed. There is nothing to leak.

**The OAuth client ID is public by design** and ships in the JS bundle, as it
does for every browser-based OAuth app. Committing it is expected.

**Security rests on the Authorized JavaScript origins allowlist, not on
secrecy.** Google issues a token for the client ID only when the request comes
from a registered origin, so the client ID is useless to a third-party site.

Origins are scheme + host + optional port only — no path, no wildcard, no
trailing slash. The bare host is correct even though the app is served from the
`/scrum-gantt/` subpath, because the browser transmits the origin, not the path.

```
https://ahmad2x4.github.io      production (GitHub Pages)
http://localhost:5173           local development — remove before publishing
```

**Authorized redirect URIs are left empty.** The GIS token client uses a popup
and never redirects.

**The Picker API key must be restricted.** It is a separate credential from the
OAuth client, configured under APIs & Services → Credentials → API Keys. It is
not secret, but an unrestricted key can be scraped and used against the
project's quota. Unlike JavaScript origins, referrer patterns accept paths and
wildcards, so scope the key to this app rather than the whole domain:

- Application restrictions → Websites → `https://ahmad2x4.github.io/scrum-gantt/*`
- API restrictions → Restrict key → Google Picker API only

**Use GitHub repository Variables, not Secrets.** Vite inlines `VITE_*` values
at build time, so they appear in the published bundle regardless of how they are
injected. Storing them as Secrets implies a protection that does not exist.
Variables keep them out of source and make rotation easy, which is the actual
benefit being sought.

**OAuth consent screen must be published before rollout.** While the app is in
Testing status it is limited to 100 listed test users, and authorizations expire
7 days after consent, forcing weekly re-consent. Publishing moves it to
production. Because `drive.file` is non-sensitive, only basic verification is
required — not a restricted-scope security review.

**Prohibited in this codebase:** service account keys, OAuth client secrets, and
stored refresh tokens. If a feature appears to require one, that indicates the
feature needs a backend and must be redesigned rather than accommodated.

## Deployment

- Vite + TypeScript + React.
- `base: '/<repo>/'` in `vite.config.ts` for the GitHub Pages subpath.
- GitHub Actions workflow builds and publishes to Pages on push to `main`.
- `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_API_KEY` supplied as repository
  variables. Neither is secret; both are public-by-design browser credentials.

## Open questions

None. All decisions above are settled.
