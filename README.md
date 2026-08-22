# Scrum Gantt

A Gantt chart for planning across multiple scrum teams and streams of work,
with plans saved to Google Drive as versioned JSON snapshots.

Live: https://ahmad2x4.github.io/scrum-gantt/

## Development

```bash
npm install
cp .env.example .env.local   # fill in your Google credentials
npm run dev
```

## Scripts

| Command         | Purpose                              |
| --------------- | ------------------------------------ |
| `npm run dev`   | Local dev server on port 5173        |
| `npm test`      | Unit tests                           |
| `npm run lint`  | Lint, including layer-boundary rules |
| `npm run build` | Production build into `dist/`        |

## Google Cloud setup

The app is a static SPA with no backend, so it holds no secrets. Access is
controlled by origin and referrer restrictions, not by hiding credentials.

- **OAuth client** — add `https://ahmad2x4.github.io` and
  `http://localhost:5173` as Authorized JavaScript origins. Leave redirect URIs
  empty; the token client uses a popup.
- **API key** (Picker only) — restrict to HTTP referrers
  `https://ahmad2x4.github.io/scrum-gantt/*` and `http://localhost:5173/*`, and
  to the Google Picker API. A missing referrer surfaces as the Picker reporting
  that the developer key is invalid, not as a referrer error.
- **Enable** the Google Drive API and the Google Picker API.
- **Publish** the OAuth consent screen. `drive.file` is a non-sensitive scope,
  so publishing needs no security review — but while the screen stays in
  Testing status, only accounts listed as test users can sign in at all, capped
  at 100.

## Architecture

See `docs/superpowers/specs/2026-08-22-scrum-gantt-design.md`.

Layer boundaries are enforced by lint: only `src/chart/` may import amCharts;
`src/ui/` and `src/storage/` must not import `src/chart/`; `src/core/` imports
nothing from other layers. The composition root is `src/App.tsx`, outside
`src/ui/`, so wiring the chart to the UI needs no exception.

Plans are stored as one JSON file per plan in a visible `Scrum Gantt` folder in
My Drive. Each save pins a Drive revision with `keepForever` and unpins anything
beyond the newest 50 — unpinned revisions of a JSON file cannot be downloaded,
so pinning is what makes the history restorable.

## Licence note

Charts are rendered with amCharts 5, which is free to use with a small amCharts
branding link that must not be hidden or altered.
