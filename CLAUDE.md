# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

All 19 planned tasks are implemented. The app renders the chart, edits
structure, and saves to Drive with pinned revision history.

- **Spec:** `docs/superpowers/specs/2026-08-22-scrum-gantt-design.md`
- **Plan:** `docs/superpowers/plans/2026-08-22-scrum-gantt.md` (19 tasks, TDD, commit per task)

Deferred by decision, not oversight: the sprint ruler, recorded in the spec's
Backlog section.

## Commands

| Command            | Purpose                                                   |
| ------------------ | --------------------------------------------------------- |
| `npm run dev`      | Dev server at http://localhost:5173/scrum-gantt/          |
| `npm test`         | Unit tests (vitest)                                       |
| `npm run test:e2e` | Playwright smoke test — the only coverage for `GanttView` |
| `npm run lint`     | oxlint, including the layer-boundary rules                |
| `npm run build`    | Typecheck and production build                            |

`npm test` passing is not sufficient evidence a change is sound: vitest
transpiles without typechecking, so run `npm run build` too.

## What this is

A static SPA Gantt chart for planning across multiple scrum teams and streams of
work, hosted on GitHub Pages. Plans are saved to the user's Google Drive as
versioned JSON. There is no backend and no server-side secret.

## Repository layout

This repo uses a **bare + worktree** layout. The bare repository is `.bare/`;
`.git` at the root is a pointer file. Working trees are subdirectories — `main/`
is the primary one. Run builds and commits from inside a worktree, not the root.

Add a worktree with `git worktree add <dir> -b <branch>`.

## Architecture constraints

These are enforced by lint rules, not convention. Do not work around them:

1. Only `src/chart/` may import `@amcharts/*`.
2. `src/ui/` and `src/storage/` must not import `src/chart/`. The composition
   root `src/App.tsx` lives outside `src/ui/` so this rule needs no exception.
3. `src/core/` must not import from any other layer.

The reasoning: `am5gantt.Gantt` is an imperative, canvas-rendered component that
owns its own editing state. Quarantining it behind one module keeps the
`PlanDocument` — which is also the saved file format — independent of the widget
that renders it, and keeps the amCharts rules in one reviewable place.

## Non-obvious invariants

- **Colours are hex strings in `PlanDocument`, never `am5.Color`** — those do not
  survive `JSON.stringify`. Conversion happens at the chart boundary.
- **Timestamps are epoch milliseconds, never `Date`** — the amCharts `DateAxis`
  requires this.
- **`rows` array order is display order**; there is no `order` field, and every
  row must appear after its parent.
- **Drive revisions must be pinned with `keepForever`** — for binary files,
  unpinned revisions cannot be downloaded and are purged after ~30 days. The app
  keeps the newest 50 pinned (Drive's cap is 200).
- **`drive.file` scope cannot see files the app did not create.** Opening a
  colleague's shared plan requires the Google Picker.
- **Dispose with `root.dispose()`, never `chart.dispose()`.**

## Chart interaction

Zooming is by gesture: drag the date ruler left or right, or pinch (macOS sends
that as a wheel event with `ctrlKey`, which amCharts does not handle itself).
The toolbar offers only **Fit**, because framing the whole plan is the one
thing the gestures cannot do.

`durationUnit` is day or week only. amCharts expresses it as a bare enum with
no count (`GanttSeries.getUnitDuration`), so there is no two-week unit.
Overriding that method to fake one also breaks `getOpenValue`, whose weekend
nudge then steps by a fortnight and loops forever — do not go there.

## amCharts

Coding rules live in `.claude/skills/amcharts5/`. Read `SKILL.md` (critical
rules) and `references/gantt.md` before touching `src/chart/`.

amCharts 5 is free to use with a small branding link that must not be hidden or
altered.

## Deployment

Pushing to `main` builds and publishes to https://ahmad2x4.github.io/scrum-gantt/
via `.github/workflows/deploy.yml`. Pages is configured with
`build_type: workflow`, so there is no `gh-pages` branch.

The build succeeds whether or not the two repository Variables are set, so a
green run is not proof the deployed site works — an unset variable ships a
bundle where sign-in silently does nothing.

## Credentials

`VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_API_KEY` are public-by-design browser
credentials and are inlined into the bundle at build time. Security comes from
Authorized JavaScript origins (client ID) and referrer + API restrictions (API
key), not from hiding them. Use GitHub repository **Variables**, not Secrets.

Never introduce a service account key, an OAuth client secret, or a stored
refresh token. If a feature seems to need one, it needs a backend instead.

Local development needs `http://localhost:5173` added to the OAuth client's
authorized origins **and** `http://localhost:5173/*` to the API key's website
restrictions. Both are separate credentials with separate restriction lists;
missing the API key one surfaces as the Picker claiming the key is invalid.
See `.env.example` for the full console checklist.
