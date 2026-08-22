# Scrum Gantt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static single-page Gantt chart for planning across multiple scrum teams and streams of work, with plans saved to Google Drive as versioned JSON snapshots.

**Architecture:** A central plain-TypeScript store holds a `PlanDocument`, which is the exact shape of the saved file. React renders the toolbar and structure panel; a single quarantined module projects the store into an `am5gantt.Gantt` instance and folds user edits back. Google Drive access is browser-only via the GIS token client with the `drive.file` scope — no backend, no client secret.

**Tech Stack:** Vite, React, TypeScript, amCharts 5 (`@amcharts/amcharts5/gantt`), Vitest, Testing Library, Playwright, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-08-22-scrum-gantt-design.md`

**amCharts rules:** `.claude/skills/amcharts5/SKILL.md` and `.claude/skills/amcharts5/references/gantt.md`. Read these before Task 8.

## Global Constraints

Every task's requirements implicitly include this section.

- **Layer boundaries (lint-enforced):** only `src/chart/` may import `@amcharts/*`; `src/ui/` and `src/storage/` must never import `src/chart/`; `src/core/` must not import from any other layer.
- **File size:** no file exceeds ~150 lines. Split rather than exceed.
- **Colours are hex strings** (`"#rrggbb"`) in `PlanDocument`. Never store `am5.Color` objects — they do not survive `JSON.stringify`.
- **Timestamps are epoch milliseconds** (`number`), never `Date` objects. The amCharts `DateAxis` requires this.
- **`durationUnit` is `"day" | "week"` only.**
- **`rows` array order is display order.** There is no `order` field. Every row must appear after its parent in the array.
- **`MAX_PINNED_REVISIONS = 50`.** Drive permits 200; the app keeps 50.
- **`CURRENT_SCHEMA_VERSION = 1`.**
- **Prohibited:** service account keys, OAuth client secrets, stored refresh tokens.
- **amCharts:** use the `.new()` factory (never `new ClassName()`), pass `root` as the first argument, set data last, and call `root.dispose()` (never `chart.dispose()`) on teardown.
- **No constructor parameter properties** (`constructor(public x: T)`). The
  TypeScript 6 template enables `erasableSyntaxOnly`, which rejects them.
  Declare the field and assign it in the body. Vitest transpiles without
  typechecking, so only `npm run build` catches this — run it before committing.
- **Commit after every task.** Conventional commit prefixes (`feat:`, `test:`, `chore:`, `fix:`).

## File Structure

| File | Responsibility |
|---|---|
| `src/core/types.ts` | `PlanDocument`, `Row`, `Task`, `Calendar`, `ViewState`, `RowKind` |
| `src/core/schema.ts` | `CURRENT_SCHEMA_VERSION`, `validate`, `migrate`, `emptyPlan` |
| `src/core/invariants.ts` | `checkInvariants`, `assertValid`, `InvariantError` |
| `src/core/mutations.ts` | Pure `PlanDocument → PlanDocument` edit functions |
| `src/core/store.ts` | `createStore`, subscription, dirty tracking |
| `src/chart/projection.ts` | `PlanDocument` → plain Gantt category/task arrays; `hexToNumber` |
| `src/chart/ingest.ts` | Chart edit snapshots → mutation; echo detection |
| `src/chart/GanttView.tsx` | The only amCharts import; mount/dispose |
| `src/storage/localDraft.ts` | localStorage mirror and recovery |
| `src/storage/googleAuth.ts` | GIS token client, silent refresh |
| `src/storage/driveClient.ts` | Folder, list, read, create, update, revisions |
| `src/storage/picker.ts` | Google Picker loader and open flow |
| `src/ui/useStore.ts` | `useSyncExternalStore` bridge |
| `src/ui/App.tsx` | Layout, wiring, save orchestration |
| `src/ui/Toolbar.tsx` | Open / Save / Save as / History / dirty dot |
| `src/ui/StructurePanel.tsx` | Tree container |
| `src/ui/StructureRow.tsx` | One row: rename, recolour, delete |
| `src/ui/OpenDialog.tsx` | My plans list + Browse Drive |
| `src/ui/HistoryDialog.tsx` | Revision list and restore |

---

### Task 1: Project scaffold, tooling, and layer-boundary lint

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `eslint.config.js`, `index.html`, `src/main.tsx`, `src/ui/App.tsx`
- Test: `src/core/smoke.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: a working `npm run dev`, `npm run build`, `npm test`, `npm run lint`. All later tasks depend on these scripts.

- [ ] **Step 1: Scaffold the project**

Run from the repository root (`main/`):

```bash
npm create vite@latest . -- --template react-ts
npm install
npm install --save-dev vitest @vitest/coverage-v8 jsdom \
  @testing-library/react @testing-library/user-event @testing-library/jest-dom \
  eslint-plugin-import
npm install @amcharts/amcharts5
```

- [ ] **Step 2: Configure Vite for GitHub Pages and Vitest**

Write `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/scrum-gantt/",
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
```

Write `src/test-setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Add to `package.json` scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint ."
  }
}
```

- [ ] **Step 3: Add the layer-boundary lint rules**

These encode the Global Constraints. Append to `eslint.config.js` inside the exported config array:

```js
{
  files: ["src/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [
        { group: ["@amcharts/*"], message: "Only src/chart/ may import amCharts." },
      ],
    }],
  },
},
{
  files: ["src/chart/**/*.{ts,tsx}"],
  rules: { "no-restricted-imports": "off" },
},
{
  files: ["src/ui/**/*.{ts,tsx}", "src/storage/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [
        { group: ["**/chart/**"], message: "ui/ and storage/ must not import chart/." },
        { group: ["@amcharts/*"], message: "Only src/chart/ may import amCharts." },
      ],
    }],
  },
},
{
  files: ["src/core/**/*.ts"],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [
        { group: ["**/chart/**", "**/ui/**", "**/storage/**"], message: "core/ must not import other layers." },
        { group: ["@amcharts/*"], message: "core/ must stay dependency-free." },
      ],
    }],
  },
},
```

- [ ] **Step 4: Write a smoke test**

Create `src/core/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("toolchain", () => {
  it("runs tests", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Verify everything runs**

```bash
npm test
npm run lint
npm run build
```

Expected: test passes, lint clean, build emits `dist/` with asset paths prefixed `/scrum-gantt/`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold vite react ts with vitest and layer lint rules"
```

---

### Task 2: Core types and schema

**Files:**
- Create: `src/core/types.ts`, `src/core/schema.ts`
- Test: `src/core/schema.test.ts`
- Delete: `src/core/smoke.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `RowKind`, `Row`, `Task`, `Calendar`, `ViewState`, `PlanDocument` (types)
  - `CURRENT_SCHEMA_VERSION: 1`
  - `emptyPlan(name: string): PlanDocument`
  - `validate(raw: unknown): PlanDocument` — throws `SchemaError`
  - `migrate(raw: Record<string, unknown>): Record<string, unknown>`
  - `class SchemaError extends Error`

- [ ] **Step 1: Write the failing tests**

Create `src/core/schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { emptyPlan, validate, SchemaError, CURRENT_SCHEMA_VERSION } from "./schema";

describe("emptyPlan", () => {
  it("produces a valid document at the current schema version", () => {
    const doc = emptyPlan("My Plan");
    expect(doc.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(doc.name).toBe("My Plan");
    expect(doc.rows).toEqual([]);
    expect(doc.tasks).toEqual([]);
    expect(doc.calendar.durationUnit).toBe("day");
    expect(doc.calendar.weekends).toEqual([0, 6]);
  });
});

describe("validate", () => {
  it("accepts a round-tripped document", () => {
    const doc = emptyPlan("Round Trip");
    expect(validate(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });

  it("rejects a non-object", () => {
    expect(() => validate("nope")).toThrow(SchemaError);
  });

  it("rejects a missing schemaVersion", () => {
    expect(() => validate({ name: "x", rows: [], tasks: [] })).toThrow(/schemaVersion/);
  });

  it("refuses a newer schemaVersion by name", () => {
    const doc = { ...emptyPlan("Future"), schemaVersion: 99 };
    expect(() => validate(doc)).toThrow(/newer version/);
  });

  it("rejects an unknown durationUnit", () => {
    const doc = emptyPlan("Bad Unit");
    // @ts-expect-error deliberately invalid
    doc.calendar.durationUnit = "fortnight";
    expect(() => validate(doc)).toThrow(/durationUnit/);
  });

  it("names the offending field so the UI can report it", () => {
    const doc = emptyPlan("Bad Rows");
    // @ts-expect-error deliberately invalid
    doc.rows = "not an array";
    expect(() => validate(doc)).toThrow(/rows/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/core/schema.test.ts
```

Expected: FAIL — cannot resolve `./schema`.

- [ ] **Step 3: Write the types**

Create `src/core/types.ts`:

```ts
export type RowKind = "team" | "stream" | "item";

export interface Row {
  id: string;
  name: string;
  kind: RowKind;
  parentId?: string;
  color?: string;
  collapsed?: boolean;
}

export interface Task {
  id: string;
  start: number;
  duration: number;
  progress?: number;
  linkTo?: string[];
}

export interface Calendar {
  durationUnit: "day" | "week";
  weekends: number[];
  excludeWeekends: boolean;
  holidays: string[];
}

export interface ViewState {
  zoom?: { start: number; end: number };
  sidebarWidth: string;
}

export interface PlanDocument {
  schemaVersion: 1;
  name: string;
  savedAt: string;
  calendar: Calendar;
  view: ViewState;
  rows: Row[];
  tasks: Task[];
}
```

- [ ] **Step 4: Write the schema module**

Create `src/core/schema.ts`:

```ts
import type { PlanDocument } from "./types";

export const CURRENT_SCHEMA_VERSION = 1 as const;

export class SchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaError";
  }
}

export function emptyPlan(name: string): PlanDocument {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    name,
    savedAt: new Date().toISOString(),
    calendar: { durationUnit: "day", weekends: [0, 6], excludeWeekends: true, holidays: [] },
    view: { sidebarWidth: "30%" },
    rows: [],
    tasks: [],
  };
}

/** No migrations exist yet; version 1 is the first schema. */
export function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  return raw;
}

const UNITS = ["day", "week"];

export function validate(raw: unknown): PlanDocument {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new SchemaError("File is not a plan object.");
  }
  const o = raw as Record<string, any>;

  if (typeof o.schemaVersion !== "number") {
    throw new SchemaError("Missing or invalid field: schemaVersion.");
  }
  if (o.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new SchemaError("This plan was saved by a newer version of this app.");
  }
  const doc = migrate(o) as Record<string, any>;

  if (typeof doc.name !== "string") throw new SchemaError("Missing or invalid field: name.");
  if (!Array.isArray(doc.rows)) throw new SchemaError("Missing or invalid field: rows.");
  if (!Array.isArray(doc.tasks)) throw new SchemaError("Missing or invalid field: tasks.");
  if (typeof doc.calendar !== "object" || doc.calendar === null) {
    throw new SchemaError("Missing or invalid field: calendar.");
  }
  if (!UNITS.includes(doc.calendar.durationUnit)) {
    throw new SchemaError(`Invalid calendar.durationUnit: expected one of ${UNITS.join(", ")}.`);
  }
  if (typeof doc.view !== "object" || doc.view === null) {
    throw new SchemaError("Missing or invalid field: view.");
  }
  return doc as unknown as PlanDocument;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/core/schema.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 6: Remove the scaffold smoke test and commit**

```bash
rm src/core/smoke.test.ts
git add -A
git commit -m "feat: add core plan document types and schema validation"
```

---

### Task 3: Invariants

**Files:**
- Create: `src/core/invariants.ts`
- Test: `src/core/invariants.test.ts`

**Interfaces:**
- Consumes: `PlanDocument`, `Row`, `Task` from `src/core/types.ts`
- Produces:
  - `interface Violation { code: string; message: string; rowId?: string }`
  - `checkInvariants(doc: PlanDocument): Violation[]`
  - `assertValid(doc: PlanDocument): void` — throws `InvariantError`
  - `class InvariantError extends Error { violations: Violation[] }`

- [ ] **Step 1: Write the failing tests**

Create `src/core/invariants.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { emptyPlan } from "./schema";
import { checkInvariants, assertValid, InvariantError } from "./invariants";
import type { PlanDocument } from "./types";

function plan(rows: PlanDocument["rows"], tasks: PlanDocument["tasks"] = []): PlanDocument {
  return { ...emptyPlan("t"), rows, tasks };
}

const codes = (doc: PlanDocument) => checkInvariants(doc).map((v) => v.code).sort();

describe("checkInvariants", () => {
  it("accepts a well-formed team/stream/item tree", () => {
    const doc = plan(
      [
        { id: "t1", name: "Falcon", kind: "team" },
        { id: "s1", name: "Payments", kind: "stream", parentId: "t1" },
        { id: "i1", name: "Tokenisation", kind: "item", parentId: "s1" },
      ],
      [{ id: "i1", start: 0, duration: 5 }],
    );
    expect(checkInvariants(doc)).toEqual([]);
  });

  it("rejects a team with a parent", () => {
    const doc = plan([
      { id: "t1", name: "Falcon", kind: "team" },
      { id: "t2", name: "Otter", kind: "team", parentId: "t1" },
    ]);
    expect(codes(doc)).toContain("team-has-parent");
  });

  it("rejects a stream whose parent is not a team", () => {
    const doc = plan([
      { id: "t1", name: "Falcon", kind: "team" },
      { id: "s1", name: "A", kind: "stream", parentId: "t1" },
      { id: "s2", name: "B", kind: "stream", parentId: "s1" },
    ]);
    expect(codes(doc)).toContain("bad-parent-kind");
  });

  it("rejects an item whose parent is not a stream", () => {
    const doc = plan(
      [
        { id: "t1", name: "Falcon", kind: "team" },
        { id: "i1", name: "Orphaned", kind: "item", parentId: "t1" },
      ],
      [{ id: "i1", start: 0, duration: 1 }],
    );
    expect(codes(doc)).toContain("bad-parent-kind");
  });

  it("rejects a missing parent reference", () => {
    const doc = plan([{ id: "s1", name: "A", kind: "stream", parentId: "ghost" }]);
    expect(codes(doc)).toContain("missing-parent");
  });

  it("rejects a child appearing before its parent", () => {
    const doc = plan([
      { id: "s1", name: "A", kind: "stream", parentId: "t1" },
      { id: "t1", name: "Falcon", kind: "team" },
    ]);
    expect(codes(doc)).toContain("child-before-parent");
  });

  it("rejects a task with no matching item row", () => {
    const doc = plan([{ id: "t1", name: "Falcon", kind: "team" }], [{ id: "ghost", start: 0, duration: 1 }]);
    expect(codes(doc)).toContain("orphan-task");
  });

  it("rejects an item row with no task", () => {
    const doc = plan([
      { id: "t1", name: "Falcon", kind: "team" },
      { id: "s1", name: "A", kind: "stream", parentId: "t1" },
      { id: "i1", name: "X", kind: "item", parentId: "s1" },
    ]);
    expect(codes(doc)).toContain("item-without-task");
  });

  it("rejects a task attached to a group row", () => {
    const doc = plan([{ id: "t1", name: "Falcon", kind: "team" }], [{ id: "t1", start: 0, duration: 1 }]);
    expect(codes(doc)).toContain("task-on-group");
  });

  it("rejects a cycle in linkTo", () => {
    const doc = plan(
      [
        { id: "t1", name: "F", kind: "team" },
        { id: "s1", name: "S", kind: "stream", parentId: "t1" },
        { id: "a", name: "A", kind: "item", parentId: "s1" },
        { id: "b", name: "B", kind: "item", parentId: "s1" },
      ],
      [
        { id: "a", start: 0, duration: 1, linkTo: ["b"] },
        { id: "b", start: 0, duration: 1, linkTo: ["a"] },
      ],
    );
    expect(codes(doc)).toContain("link-cycle");
  });

  it("rejects progress out of range and negative duration", () => {
    const doc = plan(
      [
        { id: "t1", name: "F", kind: "team" },
        { id: "s1", name: "S", kind: "stream", parentId: "t1" },
        { id: "a", name: "A", kind: "item", parentId: "s1" },
      ],
      [{ id: "a", start: 0, duration: -1, progress: 150 }],
    );
    expect(codes(doc)).toContain("bad-duration");
    expect(codes(doc)).toContain("bad-progress");
  });
});

describe("assertValid", () => {
  it("throws InvariantError carrying the violations", () => {
    const doc = plan([{ id: "s1", name: "A", kind: "stream", parentId: "ghost" }]);
    try {
      assertValid(doc);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(InvariantError);
      expect((e as InvariantError).violations.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/core/invariants.test.ts
```

Expected: FAIL — cannot resolve `./invariants`.

- [ ] **Step 3: Write the implementation**

Create `src/core/invariants.ts`:

```ts
import type { PlanDocument, Row } from "./types";

export interface Violation {
  code: string;
  message: string;
  rowId?: string;
}

export class InvariantError extends Error {
  readonly violations: Violation[];

  constructor(violations: Violation[]) {
    super(violations.map((v) => v.message).join("; "));
    this.name = "InvariantError";
    this.violations = violations;
  }
}

const ALLOWED_PARENT: Record<Row["kind"], Row["kind"] | null> = {
  team: null,
  stream: "team",
  item: "stream",
};

export function checkInvariants(doc: PlanDocument): Violation[] {
  const out: Violation[] = [];
  const byId = new Map(doc.rows.map((r) => [r.id, r]));
  const indexOf = new Map(doc.rows.map((r, i) => [r.id, i]));

  doc.rows.forEach((row, i) => {
    const expected = ALLOWED_PARENT[row.kind];
    if (expected === null && row.parentId !== undefined) {
      out.push({ code: "team-has-parent", rowId: row.id, message: `Team "${row.name}" must not have a parent.` });
      return;
    }
    if (expected === null) return;

    if (row.parentId === undefined) {
      out.push({ code: "missing-parent", rowId: row.id, message: `${row.kind} "${row.name}" needs a parent.` });
      return;
    }
    const parent = byId.get(row.parentId);
    if (!parent) {
      out.push({ code: "missing-parent", rowId: row.id, message: `"${row.name}" references a row that does not exist.` });
      return;
    }
    if (parent.kind !== expected) {
      out.push({ code: "bad-parent-kind", rowId: row.id, message: `${row.kind} "${row.name}" must sit under a ${expected}.` });
    }
    if ((indexOf.get(row.parentId) ?? Infinity) > i) {
      out.push({ code: "child-before-parent", rowId: row.id, message: `"${row.name}" appears before its parent.` });
    }
  });

  const taskIds = new Set<string>();
  for (const task of doc.tasks) {
    taskIds.add(task.id);
    const row = byId.get(task.id);
    if (!row) {
      out.push({ code: "orphan-task", rowId: task.id, message: `Task "${task.id}" has no matching row.` });
      continue;
    }
    if (row.kind !== "item") {
      out.push({ code: "task-on-group", rowId: task.id, message: `"${row.name}" is a ${row.kind} and cannot carry a task.` });
    }
    if (task.duration < 0) {
      out.push({ code: "bad-duration", rowId: task.id, message: `"${row.name}" has a negative duration.` });
    }
    if (task.progress !== undefined && (task.progress < 0 || task.progress > 100)) {
      out.push({ code: "bad-progress", rowId: task.id, message: `"${row.name}" has progress outside 0-100.` });
    }
  }

  for (const row of doc.rows) {
    if (row.kind === "item" && !taskIds.has(row.id)) {
      out.push({ code: "item-without-task", rowId: row.id, message: `"${row.name}" has no task.` });
    }
  }

  if (hasLinkCycle(doc)) {
    out.push({ code: "link-cycle", message: "Dependency links contain a cycle." });
  }
  return out;
}

function hasLinkCycle(doc: PlanDocument): boolean {
  const edges = new Map(doc.tasks.map((t) => [t.id, t.linkTo ?? []]));
  const state = new Map<string, 1 | 2>();

  const visit = (id: string): boolean => {
    const s = state.get(id);
    if (s === 1) return true;
    if (s === 2) return false;
    state.set(id, 1);
    for (const next of edges.get(id) ?? []) {
      if (edges.has(next) && visit(next)) return true;
    }
    state.set(id, 2);
    return false;
  };
  return [...edges.keys()].some(visit);
}

export function assertValid(doc: PlanDocument): void {
  const violations = checkInvariants(doc);
  if (violations.length > 0) throw new InvariantError(violations);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/core/invariants.test.ts
```

Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/invariants.ts src/core/invariants.test.ts
git commit -m "feat: add plan document structural invariants"
```

---

### Task 4: Mutations

**Files:**
- Create: `src/core/mutations.ts`
- Test: `src/core/mutations.test.ts`

**Interfaces:**
- Consumes: `PlanDocument`, `Row`, `Task`; `assertValid` from `invariants.ts`
- Produces:
  - `type Mutation = (doc: PlanDocument) => PlanDocument`
  - `addTeam(name: string): Mutation`
  - `addStream(teamId: string, name: string): Mutation`
  - `addItem(streamId: string, name: string, start: number, duration: number): Mutation`
  - `renameRow(id: string, name: string): Mutation`
  - `setRowColor(id: string, color: string): Mutation`
  - `setCollapsed(id: string, collapsed: boolean): Mutation`
  - `removeRow(id: string): Mutation` — cascades to descendants and their tasks, and strips dangling `linkTo`
  - `moveRow(id: string, toIndex: number): Mutation`
  - `updateTask(id: string, patch: Partial<Omit<Task, "id">>): Mutation`

All mutations return a new document and never mutate the input. `newId()` uses `crypto.randomUUID()`.

- [ ] **Step 1: Write the failing tests**

Create `src/core/mutations.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { emptyPlan } from "./schema";
import { checkInvariants } from "./invariants";
import { addTeam, addStream, addItem, renameRow, setRowColor, removeRow, updateTask, moveRow } from "./mutations";
import type { PlanDocument } from "./types";

function seeded(): { doc: PlanDocument; teamId: string; streamId: string; itemId: string } {
  let doc = addTeam("Falcon")(emptyPlan("p"));
  const teamId = doc.rows[0].id;
  doc = addStream(teamId, "Payments")(doc);
  const streamId = doc.rows[1].id;
  doc = addItem(streamId, "Tokenisation", 1000, 5)(doc);
  const itemId = doc.rows[2].id;
  return { doc, teamId, streamId, itemId };
}

describe("add mutations", () => {
  it("appends a team with no parent", () => {
    const doc = addTeam("Falcon")(emptyPlan("p"));
    expect(doc.rows).toHaveLength(1);
    expect(doc.rows[0]).toMatchObject({ name: "Falcon", kind: "team" });
    expect(doc.rows[0].parentId).toBeUndefined();
  });

  it("does not mutate the input document", () => {
    const before = emptyPlan("p");
    addTeam("Falcon")(before);
    expect(before.rows).toHaveLength(0);
  });

  it("inserts a stream directly after its team", () => {
    const { doc, teamId } = seeded();
    expect(doc.rows[1]).toMatchObject({ kind: "stream", parentId: teamId });
  });

  it("creates a task alongside an item row", () => {
    const { doc, itemId } = seeded();
    expect(doc.tasks).toEqual([{ id: itemId, start: 1000, duration: 5, progress: 0 }]);
  });

  it("produces a document satisfying all invariants", () => {
    expect(checkInvariants(seeded().doc)).toEqual([]);
  });

  it("inserts a second stream after the first team's subtree, not at the end", () => {
    let { doc, teamId } = seeded();
    doc = addTeam("Otter")(doc);
    doc = addStream(teamId, "Mobile")(doc);
    const names = doc.rows.map((r) => r.name);
    expect(names.indexOf("Mobile")).toBeLessThan(names.indexOf("Otter"));
    expect(checkInvariants(doc)).toEqual([]);
  });
});

describe("edit mutations", () => {
  it("renames a row", () => {
    const { doc, teamId } = seeded();
    expect(renameRow(teamId, "Renamed")(doc).rows[0].name).toBe("Renamed");
  });

  it("sets a colour as a hex string", () => {
    const { doc, teamId } = seeded();
    expect(setRowColor(teamId, "#ff0000")(doc).rows[0].color).toBe("#ff0000");
  });

  it("patches a task without touching its id", () => {
    const { doc, itemId } = seeded();
    const next = updateTask(itemId, { progress: 60, duration: 9 })(doc);
    expect(next.tasks[0]).toMatchObject({ id: itemId, progress: 60, duration: 9, start: 1000 });
  });
});

describe("removeRow", () => {
  it("cascades to descendants and their tasks", () => {
    const { doc, teamId } = seeded();
    const next = removeRow(teamId)(doc);
    expect(next.rows).toHaveLength(0);
    expect(next.tasks).toHaveLength(0);
  });

  it("removes only the targeted subtree", () => {
    let { doc, streamId } = seeded();
    doc = addItem(streamId, "Second", 2000, 3)(doc);
    const next = removeRow(doc.rows[2].id)(doc);
    expect(next.rows.map((r) => r.name)).toEqual(["Falcon", "Payments", "Second"]);
  });

  it("strips links pointing at removed tasks", () => {
    let { doc, streamId, itemId } = seeded();
    doc = addItem(streamId, "Second", 2000, 3)(doc);
    const secondId = doc.rows[3].id;
    doc = updateTask(secondId, { linkTo: [itemId] })(doc);
    const next = removeRow(itemId)(doc);
    expect(next.tasks.find((t) => t.id === secondId)?.linkTo).toEqual([]);
    expect(checkInvariants(next)).toEqual([]);
  });
});

describe("moveRow", () => {
  it("reorders siblings and keeps invariants", () => {
    let { doc, teamId } = seeded();
    doc = addStream(teamId, "Mobile")(doc);
    const mobileId = doc.rows[3].id;
    const next = moveRow(mobileId, 1)(doc);
    expect(next.rows[1].name).toBe("Mobile");
    expect(checkInvariants(next)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/core/mutations.test.ts
```

Expected: FAIL — cannot resolve `./mutations`.

- [ ] **Step 3: Write the implementation**

Create `src/core/mutations.ts`:

```ts
import type { PlanDocument, Row, Task } from "./types";

export type Mutation = (doc: PlanDocument) => PlanDocument;

const newId = () => crypto.randomUUID();

/** Index just past the end of a row's subtree, so inserts land inside the parent. */
function subtreeEnd(rows: Row[], parentId: string): number {
  const start = rows.findIndex((r) => r.id === parentId);
  if (start < 0) return rows.length;
  const descendants = new Set([parentId]);
  let i = start + 1;
  for (; i < rows.length; i++) {
    if (rows[i].parentId && descendants.has(rows[i].parentId!)) {
      descendants.add(rows[i].id);
    } else break;
  }
  return i;
}

function insertAt(rows: Row[], index: number, row: Row): Row[] {
  const next = rows.slice();
  next.splice(index, 0, row);
  return next;
}

export const addTeam = (name: string): Mutation => (doc) => ({
  ...doc,
  rows: [...doc.rows, { id: newId(), name, kind: "team" }],
});

export const addStream = (teamId: string, name: string): Mutation => (doc) => ({
  ...doc,
  rows: insertAt(doc.rows, subtreeEnd(doc.rows, teamId), {
    id: newId(), name, kind: "stream", parentId: teamId,
  }),
});

export const addItem =
  (streamId: string, name: string, start: number, duration: number): Mutation =>
  (doc) => {
    const id = newId();
    return {
      ...doc,
      rows: insertAt(doc.rows, subtreeEnd(doc.rows, streamId), {
        id, name, kind: "item", parentId: streamId,
      }),
      tasks: [...doc.tasks, { id, start, duration, progress: 0 }],
    };
  };

const patchRow = (id: string, patch: Partial<Row>): Mutation => (doc) => ({
  ...doc,
  rows: doc.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
});

export const renameRow = (id: string, name: string): Mutation => patchRow(id, { name });
export const setRowColor = (id: string, color: string): Mutation => patchRow(id, { color });
export const setCollapsed = (id: string, collapsed: boolean): Mutation => patchRow(id, { collapsed });

export const updateTask =
  (id: string, patch: Partial<Omit<Task, "id">>): Mutation =>
  (doc) => ({
    ...doc,
    tasks: doc.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  });

export const removeRow = (id: string): Mutation => (doc) => {
  const doomed = new Set([id]);
  for (const row of doc.rows) {
    if (row.parentId && doomed.has(row.parentId)) doomed.add(row.id);
  }
  return {
    ...doc,
    rows: doc.rows.filter((r) => !doomed.has(r.id)),
    tasks: doc.tasks
      .filter((t) => !doomed.has(t.id))
      .map((t) => (t.linkTo ? { ...t, linkTo: t.linkTo.filter((x) => !doomed.has(x)) } : t)),
  };
};

export const moveRow = (id: string, toIndex: number): Mutation => (doc) => {
  const from = doc.rows.findIndex((r) => r.id === id);
  if (from < 0) return doc;
  const end = subtreeEnd(doc.rows, id);
  const block = doc.rows.slice(from, end);
  const rest = [...doc.rows.slice(0, from), ...doc.rows.slice(end)];
  const clamped = Math.max(0, Math.min(toIndex, rest.length));
  return { ...doc, rows: [...rest.slice(0, clamped), ...block, ...rest.slice(clamped)] };
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/core/mutations.test.ts
```

Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/mutations.ts src/core/mutations.test.ts
git commit -m "feat: add pure plan document mutations"
```

---

### Task 5: Store

**Files:**
- Create: `src/core/store.ts`
- Test: `src/core/store.test.ts`

**Interfaces:**
- Consumes: `PlanDocument`, `Mutation`
- Produces:
  - `interface Store { get(); apply(m: Mutation): void; replace(doc: PlanDocument): void; subscribe(fn: () => void): () => void; isDirty(): boolean; markSaved(): void }`
  - `createStore(initial: PlanDocument): Store`

`apply` is a no-op when the mutation yields a structurally equal document. This is echo-guard #2 from the spec.

- [ ] **Step 1: Write the failing tests**

Create `src/core/store.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { createStore } from "./store";
import { emptyPlan } from "./schema";
import { addTeam, renameRow } from "./mutations";

describe("createStore", () => {
  it("exposes the initial document and starts clean", () => {
    const doc = emptyPlan("p");
    const store = createStore(doc);
    expect(store.get()).toEqual(doc);
    expect(store.isDirty()).toBe(false);
  });

  it("applies a mutation, notifies subscribers and becomes dirty", () => {
    const store = createStore(emptyPlan("p"));
    const listener = vi.fn();
    store.subscribe(listener);
    store.apply(addTeam("Falcon"));
    expect(store.get().rows).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.isDirty()).toBe(true);
  });

  it("ignores a mutation that produces an equal document", () => {
    const store = createStore(addTeam("Falcon")(emptyPlan("p")));
    const id = store.get().rows[0].id;
    const listener = vi.fn();
    store.subscribe(listener);
    store.apply(renameRow(id, "Falcon"));
    expect(listener).not.toHaveBeenCalled();
    expect(store.isDirty()).toBe(false);
  });

  it("returns a stable reference when nothing changed", () => {
    const store = createStore(emptyPlan("p"));
    const before = store.get();
    store.apply((d) => ({ ...d }));
    expect(store.get()).toBe(before);
  });

  it("stops notifying after unsubscribe", () => {
    const store = createStore(emptyPlan("p"));
    const listener = vi.fn();
    store.subscribe(listener)();
    store.apply(addTeam("Falcon"));
    expect(listener).not.toHaveBeenCalled();
  });

  it("replace swaps the document and clears dirty", () => {
    const store = createStore(emptyPlan("p"));
    store.apply(addTeam("Falcon"));
    const loaded = emptyPlan("loaded");
    store.replace(loaded);
    expect(store.get()).toEqual(loaded);
    expect(store.isDirty()).toBe(false);
  });

  it("markSaved clears dirty without changing the document", () => {
    const store = createStore(emptyPlan("p"));
    store.apply(addTeam("Falcon"));
    const doc = store.get();
    store.markSaved();
    expect(store.isDirty()).toBe(false);
    expect(store.get()).toBe(doc);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/core/store.test.ts
```

Expected: FAIL — cannot resolve `./store`.

- [ ] **Step 3: Write the implementation**

Create `src/core/store.ts`:

```ts
import type { PlanDocument } from "./types";
import type { Mutation } from "./mutations";

export interface Store {
  get(): PlanDocument;
  apply(m: Mutation): void;
  replace(doc: PlanDocument): void;
  subscribe(fn: () => void): () => void;
  isDirty(): boolean;
  markSaved(): void;
}

/**
 * Structural equality via canonical JSON. Documents are small (tens of KB) and
 * this runs only on edits, so the simplicity is worth more than the speed.
 */
function equal(a: PlanDocument, b: PlanDocument): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function createStore(initial: PlanDocument): Store {
  let doc = initial;
  let dirty = false;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((fn) => fn());

  return {
    get: () => doc,

    apply(m) {
      const next = m(doc);
      if (equal(doc, next)) return;
      doc = next;
      dirty = true;
      notify();
    },

    replace(next) {
      doc = next;
      dirty = false;
      notify();
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    isDirty: () => dirty,

    markSaved() {
      dirty = false;
      notify();
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/core/store.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/store.ts src/core/store.test.ts
git commit -m "feat: add observable plan store with dirty tracking"
```

---

### Task 6: Projection (store to chart)

**Files:**
- Create: `src/chart/projection.ts`
- Test: `src/chart/projection.test.ts`

**Interfaces:**
- Consumes: `PlanDocument` from `src/core/types.ts`
- Produces:
  - `interface GanttCategory { id: string; name: string; parentId?: string; color?: number; collapsed?: boolean }`
  - `interface GanttTask { id: string; start: number; duration: number; progress?: number; linkTo?: string[] }`
  - `hexToNumber(hex: string): number`
  - `project(doc: PlanDocument): { categories: GanttCategory[]; tasks: GanttTask[] }`

**Note:** `project` deliberately emits `color` as a **number** (`0xrrggbb`) rather than an `am5.Color`. `GanttView` performs the single `am5.color(n)` call. This keeps the conversion logic pure and unit-testable without loading amCharts, which cannot run under jsdom. This is a refinement of the spec, which said conversion happens "in projection.ts".

- [ ] **Step 1: Write the failing tests**

Create `src/chart/projection.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { project, hexToNumber } from "./projection";
import { emptyPlan } from "../core/schema";
import type { PlanDocument } from "../core/types";

const doc = (over: Partial<PlanDocument>): PlanDocument => ({ ...emptyPlan("p"), ...over });

describe("hexToNumber", () => {
  it("converts a six-digit hex string", () => {
    expect(hexToNumber("#ff0000")).toBe(0xff0000);
    expect(hexToNumber("#000000")).toBe(0x000000);
    expect(hexToNumber("#1a2b3c")).toBe(0x1a2b3c);
  });

  it("tolerates a missing leading hash", () => {
    expect(hexToNumber("00ff00")).toBe(0x00ff00);
  });

  it("throws on a malformed value rather than silently yielding NaN", () => {
    expect(() => hexToNumber("#xyz")).toThrow();
  });
});

describe("project", () => {
  it("passes rows through in order with hierarchy intact", () => {
    const { categories } = project(
      doc({
        rows: [
          { id: "t1", name: "Falcon", kind: "team", color: "#ff0000" },
          { id: "s1", name: "Payments", kind: "stream", parentId: "t1" },
        ],
      }),
    );
    expect(categories).toEqual([
      { id: "t1", name: "Falcon", color: 0xff0000 },
      { id: "s1", name: "Payments", parentId: "t1" },
    ]);
  });

  it("carries collapsed state through", () => {
    const { categories } = project(doc({ rows: [{ id: "t1", name: "F", kind: "team", collapsed: true }] }));
    expect(categories[0].collapsed).toBe(true);
  });

  it("emits tasks with epoch-ms starts untouched", () => {
    const { tasks } = project(doc({ tasks: [{ id: "a", start: 1700000000000, duration: 5, progress: 40 }] }));
    expect(tasks).toEqual([{ id: "a", start: 1700000000000, duration: 5, progress: 40 }]);
  });

  it("preserves zero duration so milestones render", () => {
    const { tasks } = project(doc({ tasks: [{ id: "m", start: 1, duration: 0 }] }));
    expect(tasks[0].duration).toBe(0);
  });

  it("keeps linkTo arrays for dependency arrows", () => {
    const { tasks } = project(doc({ tasks: [{ id: "a", start: 1, duration: 2, linkTo: ["b"] }] }));
    expect(tasks[0].linkTo).toEqual(["b"]);
  });

  it("omits undefined optional fields rather than emitting nulls", () => {
    const { categories } = project(doc({ rows: [{ id: "t1", name: "F", kind: "team" }] }));
    expect(Object.keys(categories[0])).toEqual(["id", "name"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/chart/projection.test.ts
```

Expected: FAIL — cannot resolve `./projection`.

- [ ] **Step 3: Write the implementation**

Create `src/chart/projection.ts`:

```ts
import type { PlanDocument } from "../core/types";

export interface GanttCategory {
  id: string;
  name: string;
  parentId?: string;
  color?: number;
  collapsed?: boolean;
}

export interface GanttTask {
  id: string;
  start: number;
  duration: number;
  progress?: number;
  linkTo?: string[];
}

export function hexToNumber(hex: string): number {
  const cleaned = hex.replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    throw new Error(`Invalid hex colour: ${hex}`);
  }
  return parseInt(cleaned, 16);
}

export function project(doc: PlanDocument): { categories: GanttCategory[]; tasks: GanttTask[] } {
  const categories = doc.rows.map((row) => {
    const c: GanttCategory = { id: row.id, name: row.name };
    if (row.parentId !== undefined) c.parentId = row.parentId;
    if (row.color !== undefined) c.color = hexToNumber(row.color);
    if (row.collapsed !== undefined) c.collapsed = row.collapsed;
    return c;
  });

  const tasks = doc.tasks.map((task) => {
    const t: GanttTask = { id: task.id, start: task.start, duration: task.duration };
    if (task.progress !== undefined) t.progress = task.progress;
    if (task.linkTo !== undefined) t.linkTo = task.linkTo;
    return t;
  });

  return { categories, tasks };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/chart/projection.test.ts
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/chart/projection.ts src/chart/projection.test.ts
git commit -m "feat: add pure store to gantt projection"
```

---

### Task 7: Ingest (chart to store)

**Files:**
- Create: `src/chart/ingest.ts`
- Test: `src/chart/ingest.test.ts`

**Interfaces:**
- Consumes: `PlanDocument`, `Task`, `Mutation` from core; `GanttTask` from `./projection`
- Produces:
  - `isEcho(doc: PlanDocument, snapshots: GanttTask[]): boolean`
  - `ingestTasks(snapshots: GanttTask[]): Mutation` — applies incoming task edits, ignoring unknown ids and rejecting edits that would violate invariants (returns the document unchanged in that case)

- [ ] **Step 1: Write the failing tests**

Create `src/chart/ingest.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ingestTasks, isEcho } from "./ingest";
import { emptyPlan } from "../core/schema";
import type { PlanDocument } from "../core/types";

function seeded(): PlanDocument {
  return {
    ...emptyPlan("p"),
    rows: [
      { id: "t1", name: "F", kind: "team" },
      { id: "s1", name: "S", kind: "stream", parentId: "t1" },
      { id: "a", name: "A", kind: "item", parentId: "s1" },
    ],
    tasks: [{ id: "a", start: 1000, duration: 5, progress: 0 }],
  };
}

describe("isEcho", () => {
  it("is true when snapshots match the document exactly", () => {
    expect(isEcho(seeded(), [{ id: "a", start: 1000, duration: 5, progress: 0 }])).toBe(true);
  });

  it("is false when a value differs", () => {
    expect(isEcho(seeded(), [{ id: "a", start: 2000, duration: 5, progress: 0 }])).toBe(false);
  });

  it("is false when a task is missing", () => {
    expect(isEcho(seeded(), [])).toBe(false);
  });
});

describe("ingestTasks", () => {
  it("applies a drag that changed start and duration", () => {
    const next = ingestTasks([{ id: "a", start: 9000, duration: 12, progress: 0 }])(seeded());
    expect(next.tasks[0]).toMatchObject({ id: "a", start: 9000, duration: 12 });
  });

  it("applies a progress change", () => {
    const next = ingestTasks([{ id: "a", start: 1000, duration: 5, progress: 75 }])(seeded());
    expect(next.tasks[0].progress).toBe(75);
  });

  it("applies a new dependency link", () => {
    const next = ingestTasks([{ id: "a", start: 1000, duration: 5, progress: 0, linkTo: [] }])(seeded());
    expect(next.tasks[0].linkTo).toEqual([]);
  });

  it("ignores snapshots for ids not in the document", () => {
    const next = ingestTasks([{ id: "ghost", start: 1, duration: 1 }])(seeded());
    expect(next.tasks).toHaveLength(1);
    expect(next.tasks[0]).toMatchObject({ id: "a", start: 1000 });
  });

  it("rejects an edit that would violate invariants, returning the document unchanged", () => {
    const doc = seeded();
    const next = ingestTasks([{ id: "a", start: 1000, duration: -5, progress: 0 }])(doc);
    expect(next).toBe(doc);
  });

  it("rejects an edit introducing a link cycle", () => {
    const doc: PlanDocument = {
      ...seeded(),
      rows: [...seeded().rows, { id: "b", name: "B", kind: "item", parentId: "s1" }],
      tasks: [
        { id: "a", start: 1000, duration: 5, linkTo: ["b"] },
        { id: "b", start: 2000, duration: 5 },
      ],
    };
    const next = ingestTasks([
      { id: "a", start: 1000, duration: 5, linkTo: ["b"] },
      { id: "b", start: 2000, duration: 5, linkTo: ["a"] },
    ])(doc);
    expect(next).toBe(doc);
  });

  it("does not mutate the input document", () => {
    const doc = seeded();
    ingestTasks([{ id: "a", start: 9999, duration: 1 }])(doc);
    expect(doc.tasks[0].start).toBe(1000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/chart/ingest.test.ts
```

Expected: FAIL — cannot resolve `./ingest`.

- [ ] **Step 3: Write the implementation**

Create `src/chart/ingest.ts`:

```ts
import type { PlanDocument, Task } from "../core/types";
import type { Mutation } from "../core/mutations";
import { checkInvariants } from "../core/invariants";
import type { GanttTask } from "./projection";

function merge(existing: Task, snapshot: GanttTask): Task {
  const next: Task = { ...existing, start: snapshot.start, duration: snapshot.duration };
  if (snapshot.progress !== undefined) next.progress = snapshot.progress;
  if (snapshot.linkTo !== undefined) next.linkTo = snapshot.linkTo;
  return next;
}

function same(a: Task, b: GanttTask): boolean {
  return (
    a.start === b.start &&
    a.duration === b.duration &&
    (a.progress ?? 0) === (b.progress ?? 0) &&
    JSON.stringify(a.linkTo ?? []) === JSON.stringify(b.linkTo ?? [])
  );
}

/** Echo guard #2: the chart is reporting exactly what we just gave it. */
export function isEcho(doc: PlanDocument, snapshots: GanttTask[]): boolean {
  if (snapshots.length !== doc.tasks.length) return false;
  const byId = new Map(doc.tasks.map((t) => [t.id, t]));
  return snapshots.every((s) => {
    const t = byId.get(s.id);
    return t !== undefined && same(t, s);
  });
}

export function ingestTasks(snapshots: GanttTask[]): Mutation {
  return (doc) => {
    const byId = new Map(snapshots.map((s) => [s.id, s]));
    const next: PlanDocument = {
      ...doc,
      tasks: doc.tasks.map((t) => {
        const s = byId.get(t.id);
        return s ? merge(t, s) : t;
      }),
    };
    // An edit the chart allows but our model forbids is dropped; GanttView
    // re-projects afterwards, which snaps the bar back to the stored value.
    if (checkInvariants(next).length > 0) return doc;
    return next;
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/chart/ingest.test.ts
```

Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/chart/ingest.ts src/chart/ingest.test.ts
git commit -m "feat: add chart edit ingest with echo and invariant guards"
```

---

### Task 8: GanttView — the amCharts quarantine

**Files:**
- Create: `src/chart/GanttView.tsx`
- Modify: `src/ui/App.tsx`

**Interfaces:**
- Consumes: `Store` from `src/core/store.ts`; `project` and `GanttTask` from `./projection`; `ingestTasks`, `isEcho` from `./ingest`
- Produces: `function GanttView({ store }: { store: Store }): JSX.Element`

**Before starting, read** `.claude/skills/amcharts5/references/gantt.md` and the Critical Rules in `.claude/skills/amcharts5/SKILL.md`.

There is **no unit test** for this file. amCharts renders to canvas, which jsdom does not implement, so assertions would be vacuous. Task 17 covers it with a Playwright smoke test. Keep this file thin — any logic belongs in `projection.ts` or `ingest.ts`.

- [ ] **Step 1: Write the component**

Create `src/chart/GanttView.tsx`:

```tsx
import { useEffect, useRef } from "react";
import * as am5 from "@amcharts/amcharts5";
import * as am5xy from "@amcharts/amcharts5/xy";
import * as am5gantt from "@amcharts/amcharts5/gantt";
import am5themes_Animated from "@amcharts/amcharts5/themes/Animated";
import type { Store } from "../core/store";
import { project, type GanttTask } from "./projection";
import { ingestTasks, isEcho } from "./ingest";

export function GanttView({ store }: { store: Store }) {
  const divRef = useRef<HTMLDivElement>(null);

  // Empty deps: the chart is created once and fed through the store
  // subscription. React must never re-render it.
  useEffect(() => {
    if (!divRef.current) return;

    const root = am5.Root.new(divRef.current);
    root.setThemes([am5themes_Animated.new(root)]);

    const doc0 = store.get();
    const chart = root.container.children.push(
      am5gantt.Gantt.new(root, {
        editable: true,
        durationUnit: doc0.calendar.durationUnit,
        weekends: doc0.calendar.weekends,
        excludeWeekends: doc0.calendar.excludeWeekends,
        holidays: doc0.calendar.holidays.map((d) => new Date(d)),
        sidebarWidth: doc0.view.sidebarWidth,
      }),
    );

    // Echo guard #1: ignore valueschanged fired by our own writes.
    let applying = false;

    const apply = () => {
      const { categories, tasks } = project(store.get());
      applying = true;
      try {
        // Set data last, and category data before series data.
        chart.yAxis.data.setAll(
          categories.map((c) => ({ ...c, color: c.color !== undefined ? am5.color(c.color) : undefined })),
        );
        chart.series.data.setAll(tasks);
      } finally {
        applying = false;
      }
    };

    chart.events.onDebounced(
      "valueschanged",
      () => {
        if (applying) return;
        const snapshots = chart.series.data.values as unknown as GanttTask[];
        if (isEcho(store.get(), snapshots)) return;
        store.apply(ingestTasks(snapshots));
      },
      300,
    );

    // Today marker. Settings go on the data item, not on the returned range.
    const todayItem = chart.xAxis.makeDataItem({ value: Date.now() });
    chart.xAxis.createAxisRange(todayItem);
    todayItem.get("grid")!.setAll({
      stroke: am5.color(0xd93025),
      strokeWidth: 2,
      strokeOpacity: 1,
      visible: true,
    });
    todayItem.get("label")!.setAll({
      text: "Today",
      fill: am5.color(0xd93025),
      centerX: am5.p50,
      inside: true,
    });

    apply();
    const unsubscribe = store.subscribe(apply);
    chart.appear(1000, 100);

    return () => {
      unsubscribe();
      root.dispose(); // never chart.dispose()
    };
  }, [store]);

  return <div ref={divRef} style={{ width: "100%", height: "100%" }} />;
}
```

- [ ] **Step 2: Render it from App with seed data**

Replace `src/ui/App.tsx` with a temporary harness so the chart is visible:

```tsx
import { useMemo } from "react";
import { createStore } from "../core/store";
import { emptyPlan } from "../core/schema";
import { addTeam, addStream, addItem } from "../core/mutations";
import { GanttView } from "../chart/GanttView";

export default function App() {
  const store = useMemo(() => {
    let doc = addTeam("Team Falcon")(emptyPlan("Demo"));
    const teamId = doc.rows[0].id;
    doc = addStream(teamId, "Payments Modernisation")(doc);
    const streamId = doc.rows[1].id;
    doc = addItem(streamId, "Card tokenisation", Date.now(), 10)(doc);
    doc = addItem(streamId, "3DS2 rollout", Date.now() + 86400000 * 12, 8)(doc);
    return createStore(doc);
  }, []);

  return (
    <div style={{ height: "100vh" }}>
      <GanttView store={store} />
    </div>
  );
}
```

Update `src/main.tsx` if its import path differs, so it renders `./ui/App`.

- [ ] **Step 3: Verify in the browser**

```bash
npm run dev
```

Expected: a Gantt with one team, one stream and two bars. Dragging a bar leaves it where you dropped it (proving ingest works and there is no feedback loop). The browser console is clean.

- [ ] **Step 4: Verify lint still enforces the boundary**

```bash
npm run lint
```

Expected: clean. The amCharts imports are allowed because the file is under `src/chart/`.

- [ ] **Step 5: Commit**

```bash
git add src/chart/GanttView.tsx src/ui/App.tsx src/main.tsx
git commit -m "feat: render gantt chart from store with disposal and echo guards"
```

---

### Task 9: React store bridge and toolbar

**Files:**
- Create: `src/ui/useStore.ts`, `src/ui/Toolbar.tsx`
- Test: `src/ui/Toolbar.test.tsx`

**Interfaces:**
- Consumes: `Store`
- Produces:
  - `usePlan(store: Store): PlanDocument`
  - `useDirty(store: Store): boolean`
  - `interface ToolbarProps { store: Store; onOpen(): void; onSave(): void; onSaveAs(): void; onHistory(): void; saving: boolean }`
  - `function Toolbar(props: ToolbarProps): JSX.Element`

- [ ] **Step 1: Write the failing tests**

Create `src/ui/Toolbar.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toolbar } from "./Toolbar";
import { createStore } from "../core/store";
import { emptyPlan } from "../core/schema";
import { addTeam } from "../core/mutations";

const noop = () => {};
const props = (store: ReturnType<typeof createStore>, over = {}) => ({
  store, onOpen: noop, onSave: noop, onSaveAs: noop, onHistory: noop, saving: false, ...over,
});

describe("Toolbar", () => {
  it("shows the plan name", () => {
    render(<Toolbar {...props(createStore(emptyPlan("FY26 Roadmap")))} />);
    expect(screen.getByText("FY26 Roadmap")).toBeInTheDocument();
  });

  it("hides the unsaved marker when the store is clean", () => {
    render(<Toolbar {...props(createStore(emptyPlan("p")))} />);
    expect(screen.queryByTestId("dirty-dot")).not.toBeInTheDocument();
  });

  it("shows the unsaved marker after an edit", async () => {
    const store = createStore(emptyPlan("p"));
    render(<Toolbar {...props(store)} />);
    store.apply(addTeam("Falcon"));
    expect(await screen.findByTestId("dirty-dot")).toBeInTheDocument();
  });

  it("calls onSave when Save is clicked", async () => {
    const onSave = vi.fn();
    render(<Toolbar {...props(createStore(emptyPlan("p")), { onSave })} />);
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("disables Save while a save is in flight", () => {
    render(<Toolbar {...props(createStore(emptyPlan("p")), { saving: true })} />);
    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
  });

  it("calls onOpen and onHistory", async () => {
    const onOpen = vi.fn();
    const onHistory = vi.fn();
    render(<Toolbar {...props(createStore(emptyPlan("p")), { onOpen, onHistory })} />);
    await userEvent.click(screen.getByRole("button", { name: /open/i }));
    await userEvent.click(screen.getByRole("button", { name: /history/i }));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onHistory).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/ui/Toolbar.test.tsx
```

Expected: FAIL — cannot resolve `./Toolbar`.

- [ ] **Step 3: Write the store bridge**

Create `src/ui/useStore.ts`:

```ts
import { useSyncExternalStore } from "react";
import type { Store } from "../core/store";
import type { PlanDocument } from "../core/types";

export function usePlan(store: Store): PlanDocument {
  return useSyncExternalStore(store.subscribe, store.get);
}

export function useDirty(store: Store): boolean {
  return useSyncExternalStore(store.subscribe, store.isDirty);
}
```

- [ ] **Step 4: Write the toolbar**

Create `src/ui/Toolbar.tsx`:

```tsx
import type { Store } from "../core/store";
import { usePlan, useDirty } from "./useStore";

export interface ToolbarProps {
  store: Store;
  onOpen(): void;
  onSave(): void;
  onSaveAs(): void;
  onHistory(): void;
  saving: boolean;
}

export function Toolbar({ store, onOpen, onSave, onSaveAs, onHistory, saving }: ToolbarProps) {
  const plan = usePlan(store);
  const dirty = useDirty(store);

  return (
    <header className="toolbar">
      <span className="plan-name">{plan.name}</span>
      {dirty && (
        <span data-testid="dirty-dot" className="dirty-dot" title="Unsaved changes" aria-label="Unsaved changes">
          ●
        </span>
      )}
      <span className="spacer" />
      <button onClick={onOpen}>Open</button>
      <button onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      <button onClick={onSaveAs} disabled={saving}>Save as…</button>
      <button onClick={onHistory}>History</button>
    </header>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/ui/Toolbar.test.tsx
```

Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/ui/useStore.ts src/ui/Toolbar.tsx src/ui/Toolbar.test.tsx
git commit -m "feat: add store bridge and toolbar with dirty indicator"
```

---

### Task 10: Structure panel

**Files:**
- Create: `src/ui/StructurePanel.tsx`, `src/ui/StructureRow.tsx`
- Test: `src/ui/StructurePanel.test.tsx`

**Interfaces:**
- Consumes: `Store`; mutations `addTeam`, `addStream`, `addItem`, `renameRow`, `setRowColor`, `removeRow`, `moveRow`
- Produces:
  - `function StructurePanel({ store }: { store: Store }): JSX.Element`
  - `interface StructureRowProps { row: Row; depth: number; onRename(name: string): void; onColor(hex: string): void; onDelete(): void; onMoveUp(): void }`
  - `function StructureRow(props: StructureRowProps): JSX.Element`

- [ ] **Step 1: Write the failing tests**

Create `src/ui/StructurePanel.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StructurePanel } from "./StructurePanel";
import { createStore } from "../core/store";
import { emptyPlan } from "../core/schema";
import { addTeam, addStream, addItem } from "../core/mutations";
import { checkInvariants } from "../core/invariants";

function seededStore() {
  let doc = addTeam("Falcon")(emptyPlan("p"));
  const teamId = doc.rows[0].id;
  doc = addStream(teamId, "Payments")(doc);
  doc = addItem(doc.rows[1].id, "Tokenisation", 1000, 5)(doc);
  return createStore(doc);
}

describe("StructurePanel", () => {
  it("renders every row", () => {
    render(<StructurePanel store={seededStore()} />);
    expect(screen.getByText("Falcon")).toBeInTheDocument();
    expect(screen.getByText("Payments")).toBeInTheDocument();
    expect(screen.getByText("Tokenisation")).toBeInTheDocument();
  });

  it("adds a team", async () => {
    const store = createStore(emptyPlan("p"));
    render(<StructurePanel store={store} />);
    await userEvent.click(screen.getByRole("button", { name: /add team/i }));
    expect(store.get().rows).toHaveLength(1);
    expect(store.get().rows[0].kind).toBe("team");
  });

  it("renames a row through the inline editor", async () => {
    const store = seededStore();
    render(<StructurePanel store={store} />);
    await userEvent.click(screen.getAllByRole("button", { name: /rename/i })[0]);
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed{Enter}");
    expect(store.get().rows[0].name).toBe("Renamed");
  });

  it("cascade-deletes a team with its descendants", async () => {
    const store = seededStore();
    render(<StructurePanel store={store} />);
    await userEvent.click(screen.getAllByRole("button", { name: /delete/i })[0]);
    expect(store.get().rows).toHaveLength(0);
    expect(store.get().tasks).toHaveLength(0);
  });

  it("keeps the document valid after editing", async () => {
    const store = seededStore();
    render(<StructurePanel store={store} />);
    await userEvent.click(screen.getAllByRole("button", { name: /add stream/i })[0]);
    expect(checkInvariants(store.get())).toEqual([]);
  });

  it("indents children below their parent", () => {
    render(<StructurePanel store={seededStore()} />);
    const item = screen.getByText("Tokenisation").closest("[data-depth]");
    expect(item).toHaveAttribute("data-depth", "2");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/ui/StructurePanel.test.tsx
```

Expected: FAIL — cannot resolve `./StructurePanel`.

- [ ] **Step 3: Write the row component**

Create `src/ui/StructureRow.tsx`:

```tsx
import { useState } from "react";
import type { Row } from "../core/types";

export interface StructureRowProps {
  row: Row;
  depth: number;
  onRename(name: string): void;
  onColor(hex: string): void;
  onDelete(): void;
  onMoveUp(): void;
}

export function StructureRow({ row, depth, onRename, onColor, onDelete, onMoveUp }: StructureRowProps) {
  const [editing, setEditing] = useState(false);

  const commit = (value: string) => {
    const trimmed = value.trim();
    if (trimmed) onRename(trimmed);
    setEditing(false);
  };

  return (
    <div className="structure-row" data-depth={depth} style={{ paddingLeft: depth * 16 }}>
      {editing ? (
        <input
          autoFocus
          defaultValue={row.name}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
            if (e.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <span className="row-name">{row.name}</span>
      )}
      <span className="spacer" />
      <input
        type="color"
        aria-label={`Colour for ${row.name}`}
        value={row.color ?? "#888888"}
        onChange={(e) => onColor(e.target.value)}
      />
      <button aria-label={`Move ${row.name} up`} onClick={onMoveUp}>↑</button>
      <button aria-label={`Rename ${row.name}`} onClick={() => setEditing(true)}>✎</button>
      <button aria-label={`Delete ${row.name}`} onClick={onDelete}>✕</button>
    </div>
  );
}
```

- [ ] **Step 4: Write the panel**

Create `src/ui/StructurePanel.tsx`:

```tsx
import type { Store } from "../core/store";
import type { Row } from "../core/types";
import { usePlan } from "./useStore";
import { StructureRow } from "./StructureRow";
import { addTeam, addStream, addItem, renameRow, setRowColor, removeRow, moveRow } from "../core/mutations";

const DEPTH: Record<Row["kind"], number> = { team: 0, stream: 1, item: 2 };

export function StructurePanel({ store }: { store: Store }) {
  const plan = usePlan(store);

  return (
    <aside className="structure-panel">
      <h2>Structure</h2>
      <div className="rows">
        {plan.rows.map((row, index) => (
          <div key={row.id}>
            <StructureRow
              row={row}
              depth={DEPTH[row.kind]}
              onRename={(name) => store.apply(renameRow(row.id, name))}
              onColor={(hex) => store.apply(setRowColor(row.id, hex))}
              onDelete={() => store.apply(removeRow(row.id))}
              onMoveUp={() => store.apply(moveRow(row.id, Math.max(0, index - 1)))}
            />
            {row.kind === "team" && (
              <button className="add-child" aria-label={`Add stream to ${row.name}`}
                onClick={() => store.apply(addStream(row.id, "New stream"))}>
                + Add stream
              </button>
            )}
            {row.kind === "stream" && (
              <button className="add-child" aria-label={`Add item to ${row.name}`}
                onClick={() => store.apply(addItem(row.id, "New item", Date.now(), 5))}>
                + Add item
              </button>
            )}
          </div>
        ))}
      </div>
      <button onClick={() => store.apply(addTeam("New team"))}>+ Add team</button>
    </aside>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/ui/StructurePanel.test.tsx
```

Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/ui/StructurePanel.tsx src/ui/StructureRow.tsx src/ui/StructurePanel.test.tsx
git commit -m "feat: add structure panel for team stream and item editing"
```

---

### Task 11: Local draft persistence

**Files:**
- Create: `src/storage/localDraft.ts`
- Test: `src/storage/localDraft.test.ts`

**Interfaces:**
- Consumes: `PlanDocument`, `validate` from `core/schema`
- Produces:
  - `interface Draft { doc: PlanDocument; fileId: string | null; savedAt: string }`
  - `saveDraft(draft: Draft): void`
  - `loadDraft(): Draft | null` — returns `null` on absent or unparseable data
  - `clearDraft(): void`
  - `DRAFT_KEY = "scrum-gantt:draft"`

- [ ] **Step 1: Write the failing tests**

Create `src/storage/localDraft.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { saveDraft, loadDraft, clearDraft, DRAFT_KEY } from "./localDraft";
import { emptyPlan } from "../core/schema";

beforeEach(() => localStorage.clear());

describe("localDraft", () => {
  it("returns null when no draft exists", () => {
    expect(loadDraft()).toBeNull();
  });

  it("round-trips a draft", () => {
    const draft = { doc: emptyPlan("p"), fileId: "abc123", savedAt: "2026-08-22T10:00:00Z" };
    saveDraft(draft);
    expect(loadDraft()).toEqual(draft);
  });

  it("preserves a null fileId for an unsaved plan", () => {
    saveDraft({ doc: emptyPlan("p"), fileId: null, savedAt: "2026-08-22T10:00:00Z" });
    expect(loadDraft()?.fileId).toBeNull();
  });

  it("returns null rather than throwing on malformed JSON", () => {
    localStorage.setItem(DRAFT_KEY, "{not json");
    expect(loadDraft()).toBeNull();
  });

  it("returns null when the stored document fails validation", () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ doc: { schemaVersion: 99 }, fileId: null, savedAt: "x" }));
    expect(loadDraft()).toBeNull();
  });

  it("clears a draft", () => {
    saveDraft({ doc: emptyPlan("p"), fileId: null, savedAt: "x" });
    clearDraft();
    expect(loadDraft()).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/storage/localDraft.test.ts
```

Expected: FAIL — cannot resolve `./localDraft`.

- [ ] **Step 3: Write the implementation**

Create `src/storage/localDraft.ts`:

```ts
import type { PlanDocument } from "../core/types";
import { validate } from "../core/schema";

export const DRAFT_KEY = "scrum-gantt:draft";

export interface Draft {
  doc: PlanDocument;
  fileId: string | null;
  savedAt: string;
}

export function saveDraft(draft: Draft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Quota exceeded or storage disabled. The draft is a convenience, never
    // the system of record, so failing to write it must not break editing.
  }
}

export function loadDraft(): Draft | null {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return {
      doc: validate(parsed.doc),
      fileId: parsed.fileId ?? null,
      savedAt: String(parsed.savedAt),
    };
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  localStorage.removeItem(DRAFT_KEY);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/storage/localDraft.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/storage/localDraft.ts src/storage/localDraft.test.ts
git commit -m "feat: add localStorage draft mirror with validation on load"
```

---

### Task 12: Google authentication

**Files:**
- Create: `src/storage/googleAuth.ts`, `src/vite-env.d.ts` (modify if it exists)
- Modify: `index.html`
- Test: `src/storage/googleAuth.test.ts`

**Interfaces:**
- Consumes: `import.meta.env.VITE_GOOGLE_CLIENT_ID`
- Produces:
  - `DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file"`
  - `class PopupBlockedError extends Error`
  - `class NotSignedInError extends Error`
  - `interface GoogleAuth { getToken(): string | null; requestToken(opts?: { silent?: boolean }): Promise<string>; signOut(): void }`
  - `createAuth(deps: { clientId: string; tokenClientFactory: TokenClientFactory }): GoogleAuth`
  - `type TokenClientFactory = (cfg: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback: (e: { type: string }) => void }) => { requestAccessToken(o: { prompt: string }): void }`
  - `interface TokenResponse { access_token?: string; expires_in?: number; error?: string }`
  - `defaultTokenClientFactory: TokenClientFactory` — reads `window.google.accounts.oauth2`

The factory is injected so tests never load Google's script.

- [ ] **Step 1: Load the GIS script**

Add to `index.html` inside `<head>`:

```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

- [ ] **Step 2: Write the failing tests**

Create `src/storage/googleAuth.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { createAuth, PopupBlockedError, DRIVE_SCOPE, type TokenClientFactory } from "./googleAuth";

/** Builds a factory whose requestAccessToken resolves or fails on demand. */
function factoryThat(behaviour: (cb: any, errCb: any, prompt: string) => void) {
  const calls: string[] = [];
  const factory: TokenClientFactory = (cfg) => ({
    requestAccessToken({ prompt }) {
      calls.push(prompt);
      behaviour(cfg.callback, cfg.error_callback, prompt);
    },
  });
  return { factory, calls };
}

const ok = (token: string) =>
  factoryThat((cb) => cb({ access_token: token, expires_in: 3600 }));

describe("createAuth", () => {
  it("requests the drive.file scope", async () => {
    const seen: string[] = [];
    const factory: TokenClientFactory = (cfg) => {
      seen.push(cfg.scope);
      return { requestAccessToken: () => cfg.callback({ access_token: "t", expires_in: 3600 }) };
    };
    const auth = createAuth({ clientId: "cid", tokenClientFactory: factory });
    await auth.requestToken();
    expect(seen).toEqual([DRIVE_SCOPE]);
  });

  it("returns null before any token is granted", () => {
    const auth = createAuth({ clientId: "cid", tokenClientFactory: ok("t").factory });
    expect(auth.getToken()).toBeNull();
  });

  it("caches the token after a successful request", async () => {
    const auth = createAuth({ clientId: "cid", tokenClientFactory: ok("tok-1").factory });
    expect(await auth.requestToken()).toBe("tok-1");
    expect(auth.getToken()).toBe("tok-1");
  });

  it("uses an empty prompt when silent", async () => {
    const { factory, calls } = ok("t");
    const auth = createAuth({ clientId: "cid", tokenClientFactory: factory });
    await auth.requestToken({ silent: true });
    expect(calls).toEqual([""]);
  });

  it("uses consent prompt when not silent", async () => {
    const { factory, calls } = ok("t");
    const auth = createAuth({ clientId: "cid", tokenClientFactory: factory });
    await auth.requestToken();
    expect(calls).toEqual(["consent"]);
  });

  it("rejects with PopupBlockedError when the popup fails to open", async () => {
    const { factory } = factoryThat((_cb, errCb) => errCb({ type: "popup_failed_to_open" }));
    const auth = createAuth({ clientId: "cid", tokenClientFactory: factory });
    await expect(auth.requestToken()).rejects.toBeInstanceOf(PopupBlockedError);
  });

  it("rejects when the token response carries an error", async () => {
    const { factory } = factoryThat((cb) => cb({ error: "access_denied" }));
    const auth = createAuth({ clientId: "cid", tokenClientFactory: factory });
    await expect(auth.requestToken({ silent: true })).rejects.toThrow(/access_denied/);
  });

  it("signOut discards the cached token", async () => {
    const auth = createAuth({ clientId: "cid", tokenClientFactory: ok("t").factory });
    await auth.requestToken();
    auth.signOut();
    expect(auth.getToken()).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run src/storage/googleAuth.test.ts
```

Expected: FAIL — cannot resolve `./googleAuth`.

- [ ] **Step 4: Write the implementation**

Create `src/storage/googleAuth.ts`:

```ts
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export class PopupBlockedError extends Error {
  constructor() {
    super("The sign-in popup was blocked by the browser.");
    this.name = "PopupBlockedError";
  }
}

export class NotSignedInError extends Error {
  constructor() {
    super("Not signed in to Google.");
    this.name = "NotSignedInError";
  }
}

export interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

export type TokenClientFactory = (cfg: {
  client_id: string;
  scope: string;
  callback: (r: TokenResponse) => void;
  error_callback: (e: { type: string }) => void;
}) => { requestAccessToken(o: { prompt: string }): void };

export interface GoogleAuth {
  getToken(): string | null;
  requestToken(opts?: { silent?: boolean }): Promise<string>;
  signOut(): void;
}

export const defaultTokenClientFactory: TokenClientFactory = (cfg) =>
  (window as any).google.accounts.oauth2.initTokenClient(cfg);

export function createAuth(deps: { clientId: string; tokenClientFactory: TokenClientFactory }): GoogleAuth {
  let token: string | null = null;
  let pending: Promise<string> | null = null;

  const request = (silent: boolean) =>
    new Promise<string>((resolve, reject) => {
      const client = deps.tokenClientFactory({
        client_id: deps.clientId,
        scope: DRIVE_SCOPE,
        callback: (r) => {
          if (r.error || !r.access_token) {
            reject(new Error(r.error ?? "No access token returned."));
            return;
          }
          token = r.access_token;
          resolve(token);
        },
        error_callback: (e) => {
          reject(
            e.type === "popup_failed_to_open" || e.type === "popup_closed"
              ? new PopupBlockedError()
              : new Error(e.type),
          );
        },
      });
      client.requestAccessToken({ prompt: silent ? "" : "consent" });
    });

  return {
    getToken: () => token,

    requestToken(opts) {
      // Collapse concurrent refreshes so one 401 storm yields one popup.
      if (pending) return pending;
      pending = request(opts?.silent ?? false).finally(() => {
        pending = null;
      });
      return pending;
    },

    signOut() {
      token = null;
    },
  };
}
```

- [ ] **Step 5: Declare the env vars**

Create or extend `src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_GOOGLE_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run src/storage/googleAuth.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 7: Commit**

```bash
git add src/storage/googleAuth.ts src/storage/googleAuth.test.ts src/vite-env.d.ts index.html
git commit -m "feat: add google identity services token client"
```

---

### Task 13: Drive client

**Files:**
- Create: `src/storage/driveClient.ts`
- Test: `src/storage/driveClient.test.ts`

**Interfaces:**
- Consumes: `PlanDocument`, `validate`; `GoogleAuth`
- Produces:
  - `FOLDER_NAME = "Scrum Gantt"`, `MAX_PINNED_REVISIONS = 50`
  - `interface PlanFile { id: string; name: string; modifiedTime: string }`
  - `interface RevisionInfo { id: string; modifiedTime: string }`
  - `class ConflictError extends Error { remoteHeadRevisionId: string }`
  - `interface DriveClient { ensureFolder(): Promise<string>; listPlans(): Promise<PlanFile[]>; read(fileId): Promise<{ doc: PlanDocument; headRevisionId: string }>; create(name, doc): Promise<{ fileId: string; headRevisionId: string }>; update(fileId, doc, expectedHeadRevisionId): Promise<{ headRevisionId: string }>; listRevisions(fileId): Promise<RevisionInfo[]>; readRevision(fileId, revisionId): Promise<PlanDocument> }`
  - `createDriveClient(deps: { fetch: typeof fetch; auth: GoogleAuth }): DriveClient`

`fetch` and `auth` are injected so tests need no network.

This is the highest-risk module in the plan. The three behaviours below are exactly the ones the spec calls out.

- [ ] **Step 1: Write the failing tests**

Create `src/storage/driveClient.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { createDriveClient, ConflictError, MAX_PINNED_REVISIONS } from "./driveClient";
import { emptyPlan } from "../core/schema";
import type { GoogleAuth } from "./googleAuth";

interface Stub { url: string; init?: RequestInit }

/** Queue of responses matched in call order; records every request. */
function harness(responses: Array<{ status?: number; body?: unknown }>) {
  const calls: Stub[] = [];
  let i = 0;
  const fetchStub = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = responses[i++] ?? { status: 200, body: {} };
    return {
      ok: (r.status ?? 200) < 400,
      status: r.status ?? 200,
      json: async () => r.body ?? {},
      text: async () => JSON.stringify(r.body ?? {}),
    } as unknown as Response;
  });
  return { fetchStub, calls };
}

function authStub(): GoogleAuth & { refreshes: number } {
  let token: string | null = "tok";
  const a = {
    refreshes: 0,
    getToken: () => token,
    async requestToken() {
      a.refreshes++;
      token = "tok-refreshed";
      return token;
    },
    signOut() { token = null; },
  };
  return a as GoogleAuth & { refreshes: number };
}

describe("token refresh", () => {
  it("refreshes once on 401 and retries the request", async () => {
    const { fetchStub, calls } = harness([
      { status: 401 },
      { status: 200, body: { files: [] } },
    ]);
    const auth = authStub();
    const client = createDriveClient({ fetch: fetchStub as any, auth });
    await client.listPlans();
    expect(auth.refreshes).toBe(1);
    expect(calls).toHaveLength(2);
    expect((calls[1].init!.headers as any).Authorization).toBe("Bearer tok-refreshed");
  });

  it("does not retry more than once", async () => {
    const { fetchStub } = harness([{ status: 401 }, { status: 401 }]);
    const auth = authStub();
    const client = createDriveClient({ fetch: fetchStub as any, auth });
    await expect(client.listPlans()).rejects.toThrow();
    expect(auth.refreshes).toBe(1);
  });
});

describe("read", () => {
  it("validates content and returns the head revision id", async () => {
    const doc = emptyPlan("p");
    const { fetchStub } = harness([
      { body: doc },
      { body: { headRevisionId: "rev-7" } },
    ]);
    const client = createDriveClient({ fetch: fetchStub as any, auth: authStub() });
    const result = await client.read("file-1");
    expect(result.doc).toEqual(doc);
    expect(result.headRevisionId).toBe("rev-7");
  });
});

describe("update", () => {
  it("raises ConflictError when the remote head moved", async () => {
    const { fetchStub } = harness([{ body: { headRevisionId: "rev-9" } }]);
    const client = createDriveClient({ fetch: fetchStub as any, auth: authStub() });
    await expect(client.update("file-1", emptyPlan("p"), "rev-7")).rejects.toBeInstanceOf(ConflictError);
  });

  it("writes, then pins the new revision with keepForever", async () => {
    const { fetchStub, calls } = harness([
      { body: { headRevisionId: "rev-7" } },              // precondition check
      { body: { id: "file-1", headRevisionId: "rev-8" } }, // content upload
      { body: {} },                                        // pin
      { body: { revisions: [] } },                         // prune listing
    ]);
    const client = createDriveClient({ fetch: fetchStub as any, auth: authStub() });
    const out = await client.update("file-1", emptyPlan("p"), "rev-7");
    expect(out.headRevisionId).toBe("rev-8");

    const pin = calls.find((c) => c.url.includes("/revisions/rev-8"))!;
    expect(pin.init!.method).toBe("PATCH");
    expect(JSON.parse(pin.init!.body as string)).toEqual({ keepForever: true });
  });

  it("unpins revisions beyond the newest MAX_PINNED_REVISIONS", async () => {
    const revisions = Array.from({ length: MAX_PINNED_REVISIONS + 3 }, (_, i) => ({
      id: `rev-${i}`,
      modifiedTime: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      keepForever: true,
    }));
    const { fetchStub, calls } = harness([
      { body: { headRevisionId: "rev-7" } },
      { body: { headRevisionId: "rev-new" } },
      { body: {} },
      { body: { revisions } },
      { body: {} }, { body: {} }, { body: {} },
    ]);
    const client = createDriveClient({ fetch: fetchStub as any, auth: authStub() });
    await client.update("file-1", emptyPlan("p"), "rev-7");

    const unpins = calls.filter(
      (c) => c.init?.method === "PATCH" && c.init.body === JSON.stringify({ keepForever: false }),
    );
    expect(unpins).toHaveLength(3);
    // Oldest first: rev-0, rev-1, rev-2
    expect(unpins[0].url).toContain("/revisions/rev-0");
  });
});

describe("create", () => {
  it("uploads multipart with the folder as parent", async () => {
    const { fetchStub, calls } = harness([
      { body: { id: "new-file", headRevisionId: "rev-1" } },
      { body: {} },
      { body: { revisions: [] } },
    ]);
    const client = createDriveClient({ fetch: fetchStub as any, auth: authStub() });
    const out = await client.create("My Plan", emptyPlan("p"));
    expect(out.fileId).toBe("new-file");
    expect(calls[0].url).toContain("uploadType=multipart");
    expect(calls[0].init!.body as string).toContain("My Plan");
  });
});

describe("readRevision", () => {
  it("validates the fetched revision content", async () => {
    const { fetchStub, calls } = harness([{ body: emptyPlan("old") }]);
    const client = createDriveClient({ fetch: fetchStub as any, auth: authStub() });
    const doc = await client.readRevision("file-1", "rev-3");
    expect(doc.name).toBe("old");
    expect(calls[0].url).toContain("alt=media");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/storage/driveClient.test.ts
```

Expected: FAIL — cannot resolve `./driveClient`.

- [ ] **Step 3: Write the implementation**

Create `src/storage/driveClient.ts`:

```ts
import type { PlanDocument } from "../core/types";
import { validate } from "../core/schema";
import type { GoogleAuth } from "./googleAuth";

export const FOLDER_NAME = "Scrum Gantt";
export const MAX_PINNED_REVISIONS = 50;

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const MIME = "application/json";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export interface PlanFile { id: string; name: string; modifiedTime: string }
export interface RevisionInfo { id: string; modifiedTime: string }

export class ConflictError extends Error {
  readonly remoteHeadRevisionId: string;

  constructor(remoteHeadRevisionId: string) {
    super("This plan was changed elsewhere since you opened it.");
    this.name = "ConflictError";
    this.remoteHeadRevisionId = remoteHeadRevisionId;
  }
}

export interface DriveClient {
  ensureFolder(): Promise<string>;
  listPlans(): Promise<PlanFile[]>;
  read(fileId: string): Promise<{ doc: PlanDocument; headRevisionId: string }>;
  create(name: string, doc: PlanDocument): Promise<{ fileId: string; headRevisionId: string }>;
  update(fileId: string, doc: PlanDocument, expectedHeadRevisionId: string): Promise<{ headRevisionId: string }>;
  listRevisions(fileId: string): Promise<RevisionInfo[]>;
  readRevision(fileId: string, revisionId: string): Promise<PlanDocument>;
}

export function createDriveClient(deps: { fetch: typeof fetch; auth: GoogleAuth }): DriveClient {
  /** Every request goes through here: 401 is routine, refresh once and retry. */
  async function call(url: string, init: RequestInit = {}, retried = false): Promise<any> {
    const token = deps.auth.getToken();
    const res = await deps.fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    });
    if (res.status === 401 && !retried) {
      await deps.auth.requestToken({ silent: true });
      return call(url, init, true);
    }
    if (!res.ok) throw new Error(`Drive request failed (${res.status}): ${await res.text()}`);
    return res.json();
  }

  async function headRevisionId(fileId: string): Promise<string> {
    const meta = await call(`${API}/files/${fileId}?fields=headRevisionId`);
    return meta.headRevisionId;
  }

  async function pinAndPrune(fileId: string, revisionId: string): Promise<void> {
    await call(`${API}/files/${fileId}/revisions/${revisionId}`, {
      method: "PATCH",
      headers: { "Content-Type": MIME },
      body: JSON.stringify({ keepForever: true }),
    });

    const listed = await call(
      `${API}/files/${fileId}/revisions?fields=revisions(id,modifiedTime,keepForever)&pageSize=1000`,
    );
    const pinned: Array<{ id: string; modifiedTime: string; keepForever?: boolean }> =
      (listed.revisions ?? []).filter((r: any) => r.keepForever);
    pinned.sort((a, b) => a.modifiedTime.localeCompare(b.modifiedTime));

    const excess = pinned.slice(0, Math.max(0, pinned.length - MAX_PINNED_REVISIONS));
    for (const rev of excess) {
      await call(`${API}/files/${fileId}/revisions/${rev.id}`, {
        method: "PATCH",
        headers: { "Content-Type": MIME },
        body: JSON.stringify({ keepForever: false }),
      });
    }
  }

  let folderId: string | null = null;

  return {
    async ensureFolder() {
      if (folderId) return folderId;
      const q = encodeURIComponent(
        `name='${FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false`,
      );
      const found = await call(`${API}/files?q=${q}&fields=files(id)`);
      if (found.files?.length) {
        folderId = found.files[0].id;
        return folderId!;
      }
      const created = await call(`${API}/files?fields=id`, {
        method: "POST",
        headers: { "Content-Type": MIME },
        body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
      });
      folderId = created.id;
      return folderId!;
    },

    async listPlans() {
      const parent = await this.ensureFolder();
      const q = encodeURIComponent(`'${parent}' in parents and trashed=false`);
      const res = await call(
        `${API}/files?q=${q}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`,
      );
      return (res.files ?? []) as PlanFile[];
    },

    async read(fileId) {
      const content = await call(`${API}/files/${fileId}?alt=media`);
      const head = await headRevisionId(fileId);
      return { doc: validate(content), headRevisionId: head };
    },

    async create(name, doc) {
      const parent = await this.ensureFolder();
      const boundary = `b${Math.random().toString(36).slice(2)}`;
      const metadata = { name, mimeType: MIME, parents: [parent] };
      const body =
        `--${boundary}\r\nContent-Type: ${MIME}\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: ${MIME}\r\n\r\n${JSON.stringify(doc)}\r\n` +
        `--${boundary}--`;

      const created = await call(`${UPLOAD}/files?uploadType=multipart&fields=id,headRevisionId`, {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      });
      await pinAndPrune(created.id, created.headRevisionId);
      return { fileId: created.id, headRevisionId: created.headRevisionId };
    },

    async update(fileId, doc, expectedHeadRevisionId) {
      const remote = await headRevisionId(fileId);
      if (remote !== expectedHeadRevisionId) throw new ConflictError(remote);

      const written = await call(`${UPLOAD}/files/${fileId}?uploadType=media&fields=headRevisionId`, {
        method: "PATCH",
        headers: { "Content-Type": MIME },
        body: JSON.stringify(doc),
      });
      await pinAndPrune(fileId, written.headRevisionId);
      return { headRevisionId: written.headRevisionId };
    },

    async listRevisions(fileId) {
      const res = await call(
        `${API}/files/${fileId}/revisions?fields=revisions(id,modifiedTime,keepForever)&pageSize=1000`,
      );
      // Only pinned revisions are downloadable for binary files, so only those
      // are offered as restore points.
      return (res.revisions ?? [])
        .filter((r: any) => r.keepForever)
        .map((r: any) => ({ id: r.id, modifiedTime: r.modifiedTime }))
        .reverse() as RevisionInfo[];
    },

    async readRevision(fileId, revisionId) {
      const content = await call(`${API}/files/${fileId}/revisions/${revisionId}?alt=media`);
      return validate(content);
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/storage/driveClient.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/storage/driveClient.ts src/storage/driveClient.test.ts
git commit -m "feat: add drive client with pinned revisions and conflict detection"
```

---

### Task 14: Google Picker

**Files:**
- Create: `src/storage/picker.ts`
- Test: `src/storage/picker.test.ts`

**Interfaces:**
- Consumes: `GoogleAuth`
- Produces:
  - `interface PickedFile { id: string; name: string }`
  - `loadPickerApi(loader?: () => Promise<void>): Promise<void>`
  - `openPicker(deps: { apiKey: string; token: string; buildPicker?: PickerBuilder }): Promise<PickedFile | null>` — resolves `null` when cancelled
  - `type PickerBuilder = (cfg: { apiKey: string; token: string; onPicked(f: PickedFile | null): void }) => { setVisible(v: boolean): void }`

The builder is injected so tests never load Google's script.

- [ ] **Step 1: Write the failing tests**

Create `src/storage/picker.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { openPicker, type PickerBuilder } from "./picker";

describe("openPicker", () => {
  it("resolves with the picked file", async () => {
    const build: PickerBuilder = (cfg) => ({
      setVisible: () => cfg.onPicked({ id: "f1", name: "Shared plan" }),
    });
    await expect(openPicker({ apiKey: "k", token: "t", buildPicker: build })).resolves.toEqual({
      id: "f1",
      name: "Shared plan",
    });
  });

  it("resolves null when the user cancels", async () => {
    const build: PickerBuilder = (cfg) => ({ setVisible: () => cfg.onPicked(null) });
    await expect(openPicker({ apiKey: "k", token: "t", buildPicker: build })).resolves.toBeNull();
  });

  it("passes the api key and token through to the builder", async () => {
    const seen: Array<{ apiKey: string; token: string }> = [];
    const build: PickerBuilder = (cfg) => {
      seen.push({ apiKey: cfg.apiKey, token: cfg.token });
      return { setVisible: () => cfg.onPicked(null) };
    };
    await openPicker({ apiKey: "key-1", token: "tok-1", buildPicker: build });
    expect(seen).toEqual([{ apiKey: "key-1", token: "tok-1" }]);
  });

  it("makes the picker visible exactly once", async () => {
    const setVisible = vi.fn();
    const build: PickerBuilder = (cfg) => {
      queueMicrotask(() => cfg.onPicked(null));
      return { setVisible };
    };
    await openPicker({ apiKey: "k", token: "t", buildPicker: build });
    expect(setVisible).toHaveBeenCalledExactlyOnceWith(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/storage/picker.test.ts
```

Expected: FAIL — cannot resolve `./picker`.

- [ ] **Step 3: Write the implementation**

Create `src/storage/picker.ts`:

```ts
export interface PickedFile {
  id: string;
  name: string;
}

export type PickerBuilder = (cfg: {
  apiKey: string;
  token: string;
  onPicked(f: PickedFile | null): void;
}) => { setVisible(v: boolean): void };

/** Loads Google's picker module. Idempotent. */
export function loadPickerApi(loader?: () => Promise<void>): Promise<void> {
  if (loader) return loader();
  return new Promise((resolve, reject) => {
    const g = (window as any).gapi;
    if (!g) {
      const script = document.createElement("script");
      script.src = "https://apis.google.com/js/api.js";
      script.onload = () => (window as any).gapi.load("picker", () => resolve());
      script.onerror = () => reject(new Error("Could not load the Google Picker."));
      document.head.appendChild(script);
      return;
    }
    g.load("picker", () => resolve());
  });
}

const defaultBuilder: PickerBuilder = ({ apiKey, token, onPicked }) => {
  const google = (window as any).google;
  const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
    .setMimeTypes("application/json")
    .setIncludeFolders(true);

  return new google.picker.PickerBuilder()
    .setDeveloperKey(apiKey)
    .setOAuthToken(token)
    .addView(view)
    .setCallback((data: any) => {
      const action = data[google.picker.Response.ACTION];
      if (action === google.picker.Action.PICKED) {
        const doc = data[google.picker.Response.DOCUMENTS][0];
        onPicked({ id: doc.id, name: doc.name });
      } else if (action === google.picker.Action.CANCEL) {
        onPicked(null);
      }
    })
    .build();
};

export function openPicker(deps: {
  apiKey: string;
  token: string;
  buildPicker?: PickerBuilder;
}): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    let settled = false;
    const picker = (deps.buildPicker ?? defaultBuilder)({
      apiKey: deps.apiKey,
      token: deps.token,
      onPicked: (f) => {
        if (settled) return;
        settled = true;
        resolve(f);
      },
    });
    picker.setVisible(true);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/storage/picker.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/storage/picker.ts src/storage/picker.test.ts
git commit -m "feat: add google picker for opening shared plans"
```

---

### Task 15: Save controller

**Files:**
- Create: `src/ui/saveController.ts`
- Test: `src/ui/saveController.test.ts`

**Interfaces:**
- Consumes: `Store`, `DriveClient`, `ConflictError`, `saveDraft`/`clearDraft`
- Produces:
  - `interface SaveStatus { saving: boolean; error: string | null; conflict: { remoteHeadRevisionId: string } | null; fileId: string | null }`
  - `type ConflictChoice = "reload" | "copy" | "overwrite"`
  - `interface SaveController { getStatus(): SaveStatus; subscribe(fn: () => void): () => void; save(): Promise<void>; saveAs(name: string): Promise<void>; openFile(fileId: string): Promise<void>; restore(revisionId: string): Promise<void>; resolveConflict(c: ConflictChoice): Promise<void>; dismissError(): void }`
  - `createSaveController(deps: { store: Store; drive: DriveClient }): SaveController`

This holds all Drive orchestration so `App.tsx` stays a wiring file. It is plain TypeScript with no React, so it is fully unit-testable.

- [ ] **Step 1: Write the failing tests**

Create `src/ui/saveController.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSaveController } from "./saveController";
import { createStore } from "../core/store";
import { emptyPlan } from "../core/schema";
import { addTeam } from "../core/mutations";
import { ConflictError } from "../storage/driveClient";
import type { DriveClient } from "../storage/driveClient";

beforeEach(() => localStorage.clear());

function driveStub(over: Partial<DriveClient> = {}): DriveClient {
  return {
    ensureFolder: vi.fn(async () => "folder"),
    listPlans: vi.fn(async () => []),
    read: vi.fn(async () => ({ doc: emptyPlan("remote"), headRevisionId: "rev-1" })),
    create: vi.fn(async () => ({ fileId: "file-1", headRevisionId: "rev-1" })),
    update: vi.fn(async () => ({ headRevisionId: "rev-2" })),
    listRevisions: vi.fn(async () => []),
    readRevision: vi.fn(async () => emptyPlan("old")),
    ...over,
  };
}

describe("save", () => {
  it("creates the file on first save and remembers the id", async () => {
    const store = createStore(emptyPlan("New Plan"));
    const drive = driveStub();
    const c = createSaveController({ store, drive });
    await c.save();
    expect(drive.create).toHaveBeenCalledWith("New Plan", expect.anything());
    expect(c.getStatus().fileId).toBe("file-1");
  });

  it("updates in place on subsequent saves", async () => {
    const store = createStore(emptyPlan("p"));
    const drive = driveStub();
    const c = createSaveController({ store, drive });
    await c.save();
    await c.save();
    expect(drive.create).toHaveBeenCalledTimes(1);
    expect(drive.update).toHaveBeenCalledWith("file-1", expect.anything(), "rev-1");
  });

  it("clears the dirty flag after a successful save", async () => {
    const store = createStore(emptyPlan("p"));
    store.apply(addTeam("Falcon"));
    const c = createSaveController({ store, drive: driveStub() });
    await c.save();
    expect(store.isDirty()).toBe(false);
  });

  it("records an error and leaves the store dirty when the write fails", async () => {
    const store = createStore(emptyPlan("p"));
    store.apply(addTeam("Falcon"));
    const drive = driveStub({ create: vi.fn(async () => { throw new Error("offline"); }) });
    const c = createSaveController({ store, drive });
    await c.save();
    expect(c.getStatus().error).toMatch(/offline/);
    expect(store.isDirty()).toBe(true);
  });

  it("notifies subscribers as saving starts and finishes", async () => {
    const listener = vi.fn();
    const c = createSaveController({ store: createStore(emptyPlan("p")), drive: driveStub() });
    c.subscribe(listener);
    await c.save();
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(c.getStatus().saving).toBe(false);
  });
});

describe("conflict", () => {
  it("surfaces a conflict instead of overwriting", async () => {
    const store = createStore(emptyPlan("p"));
    const drive = driveStub({
      update: vi.fn(async () => { throw new ConflictError("rev-9"); }),
    });
    const c = createSaveController({ store, drive });
    await c.save();          // create
    await c.save();          // update -> conflict
    expect(c.getStatus().conflict).toEqual({ remoteHeadRevisionId: "rev-9" });
  });

  it("reload replaces the document from Drive and clears the conflict", async () => {
    const store = createStore(emptyPlan("p"));
    const drive = driveStub({
      update: vi.fn(async () => { throw new ConflictError("rev-9"); }),
    });
    const c = createSaveController({ store, drive });
    await c.save();
    await c.save();
    await c.resolveConflict("reload");
    expect(store.get().name).toBe("remote");
    expect(c.getStatus().conflict).toBeNull();
  });

  it("copy saves under a new file", async () => {
    const store = createStore(emptyPlan("p"));
    const drive = driveStub({
      update: vi.fn(async () => { throw new ConflictError("rev-9"); }),
      create: vi.fn(async () => ({ fileId: "copy-1", headRevisionId: "rev-1" })),
    });
    const c = createSaveController({ store, drive });
    await c.save();
    await c.save();
    await c.resolveConflict("copy");
    expect(c.getStatus().fileId).toBe("copy-1");
    expect(c.getStatus().conflict).toBeNull();
  });

  it("overwrite retries against the remote head revision", async () => {
    const store = createStore(emptyPlan("p"));
    const update = vi
      .fn()
      .mockRejectedValueOnce(new ConflictError("rev-9"))
      .mockResolvedValueOnce({ headRevisionId: "rev-10" });
    const c = createSaveController({ store, drive: driveStub({ update }) });
    await c.save();
    await c.save();
    await c.resolveConflict("overwrite");
    expect(update).toHaveBeenLastCalledWith("file-1", expect.anything(), "rev-9");
    expect(c.getStatus().conflict).toBeNull();
  });
});

describe("openFile and restore", () => {
  it("openFile replaces the document and records the file id", async () => {
    const store = createStore(emptyPlan("p"));
    const c = createSaveController({ store, drive: driveStub() });
    await c.openFile("file-7");
    expect(store.get().name).toBe("remote");
    expect(c.getStatus().fileId).toBe("file-7");
    expect(store.isDirty()).toBe(false);
  });

  it("restore loads a revision and marks the plan dirty so it can be saved forward", async () => {
    const store = createStore(emptyPlan("p"));
    const c = createSaveController({ store, drive: driveStub() });
    await c.openFile("file-7");
    await c.restore("rev-3");
    expect(store.get().name).toBe("old");
    expect(store.isDirty()).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/ui/saveController.test.ts
```

Expected: FAIL — cannot resolve `./saveController`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/saveController.ts`:

```ts
import type { Store } from "../core/store";
import { ConflictError, type DriveClient } from "../storage/driveClient";
import { saveDraft, clearDraft } from "../storage/localDraft";

export interface SaveStatus {
  saving: boolean;
  error: string | null;
  conflict: { remoteHeadRevisionId: string } | null;
  fileId: string | null;
}

export type ConflictChoice = "reload" | "copy" | "overwrite";

export interface SaveController {
  getStatus(): SaveStatus;
  subscribe(fn: () => void): () => void;
  save(): Promise<void>;
  saveAs(name: string): Promise<void>;
  openFile(fileId: string): Promise<void>;
  restore(revisionId: string): Promise<void>;
  resolveConflict(choice: ConflictChoice): Promise<void>;
  dismissError(): void;
}

export function createSaveController(deps: { store: Store; drive: DriveClient }): SaveController {
  const { store, drive } = deps;
  let status: SaveStatus = { saving: false, error: null, conflict: null, fileId: null };
  let headRevisionId: string | null = null;
  const listeners = new Set<() => void>();

  const set = (patch: Partial<SaveStatus>) => {
    status = { ...status, ...patch };
    listeners.forEach((fn) => fn());
  };

  /** Wraps a Drive operation with the saving flag and uniform error capture. */
  async function run(op: () => Promise<void>): Promise<void> {
    set({ saving: true, error: null });
    try {
      await op();
    } catch (e) {
      if (e instanceof ConflictError) {
        set({ conflict: { remoteHeadRevisionId: e.remoteHeadRevisionId } });
      } else {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    } finally {
      set({ saving: false });
    }
  }

  async function writeNew(name: string): Promise<void> {
    const result = await drive.create(name, store.get());
    headRevisionId = result.headRevisionId;
    set({ fileId: result.fileId, conflict: null });
    store.markSaved();
    clearDraft();
  }

  async function writeExisting(fileId: string, expected: string): Promise<void> {
    const result = await drive.update(fileId, store.get(), expected);
    headRevisionId = result.headRevisionId;
    set({ conflict: null });
    store.markSaved();
    clearDraft();
  }

  return {
    getStatus: () => status,

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    save() {
      return run(async () => {
        if (status.fileId && headRevisionId) {
          await writeExisting(status.fileId, headRevisionId);
        } else {
          await writeNew(store.get().name);
        }
      });
    },

    saveAs(name) {
      return run(async () => {
        store.apply((d) => ({ ...d, name }));
        await writeNew(name);
      });
    },

    openFile(fileId) {
      return run(async () => {
        const { doc, headRevisionId: head } = await drive.read(fileId);
        headRevisionId = head;
        store.replace(doc);
        set({ fileId, conflict: null });
        clearDraft();
      });
    },

    restore(revisionId) {
      return run(async () => {
        if (!status.fileId) throw new Error("Open a plan before restoring a revision.");
        const doc = await drive.readRevision(status.fileId, revisionId);
        store.replace(doc);
        // Restoring is an edit, not a save: the user must confirm it forward.
        store.apply((d) => ({ ...d, savedAt: new Date().toISOString() }));
        saveDraft({ doc: store.get(), fileId: status.fileId, savedAt: new Date().toISOString() });
      });
    },

    resolveConflict(choice) {
      const remote = status.conflict?.remoteHeadRevisionId;
      const fileId = status.fileId;
      return run(async () => {
        if (!remote || !fileId) return;
        if (choice === "reload") {
          const { doc, headRevisionId: head } = await drive.read(fileId);
          headRevisionId = head;
          store.replace(doc);
          set({ conflict: null });
        } else if (choice === "copy") {
          await writeNew(`${store.get().name} (copy)`);
        } else {
          await writeExisting(fileId, remote);
        }
      });
    },

    dismissError() {
      set({ error: null });
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/ui/saveController.test.ts
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/saveController.ts src/ui/saveController.test.ts
git commit -m "feat: add save controller with conflict resolution"
```

---

### Task 16: Open and History dialogs

**Files:**
- Create: `src/ui/OpenDialog.tsx`, `src/ui/HistoryDialog.tsx`
- Test: `src/ui/OpenDialog.test.tsx`, `src/ui/HistoryDialog.test.tsx`

**Interfaces:**
- Consumes: `PlanFile`, `RevisionInfo`, `MAX_PINNED_REVISIONS` from `driveClient`; `PickedFile` from `picker`
- Produces:
  - `interface OpenDialogProps { plans: PlanFile[]; loading: boolean; onOpen(fileId: string): void; onBrowseDrive(): void; onClose(): void }`
  - `function OpenDialog(props: OpenDialogProps): JSX.Element`
  - `interface HistoryDialogProps { revisions: RevisionInfo[]; loading: boolean; onRestore(revisionId: string): void; onClose(): void }`
  - `function HistoryDialog(props: HistoryDialogProps): JSX.Element`

Both are presentational: they receive data and raise callbacks. Fetching lives in `App.tsx`.

- [ ] **Step 1: Write the failing tests**

Create `src/ui/OpenDialog.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OpenDialog } from "./OpenDialog";

const plans = [
  { id: "f1", name: "FY26 Roadmap", modifiedTime: "2026-08-20T10:00:00Z" },
  { id: "f2", name: "Payments only", modifiedTime: "2026-08-18T09:00:00Z" },
];
const props = (over = {}) => ({
  plans, loading: false, onOpen: vi.fn(), onBrowseDrive: vi.fn(), onClose: vi.fn(), ...over,
});

describe("OpenDialog", () => {
  it("lists the user's plans", () => {
    render(<OpenDialog {...props()} />);
    expect(screen.getByText("FY26 Roadmap")).toBeInTheDocument();
    expect(screen.getByText("Payments only")).toBeInTheDocument();
  });

  it("opens the clicked plan", async () => {
    const onOpen = vi.fn();
    render(<OpenDialog {...props({ onOpen })} />);
    await userEvent.click(screen.getByText("FY26 Roadmap"));
    expect(onOpen).toHaveBeenCalledWith("f1");
  });

  it("shows a loading state instead of the list", () => {
    render(<OpenDialog {...props({ loading: true, plans: [] })} />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("explains the empty case", () => {
    render(<OpenDialog {...props({ plans: [] })} />);
    expect(screen.getByText(/no plans yet/i)).toBeInTheDocument();
  });

  it("offers Browse Drive for plans shared by colleagues", async () => {
    const onBrowseDrive = vi.fn();
    render(<OpenDialog {...props({ onBrowseDrive })} />);
    await userEvent.click(screen.getByRole("button", { name: /browse drive/i }));
    expect(onBrowseDrive).toHaveBeenCalledOnce();
  });
});
```

Create `src/ui/HistoryDialog.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HistoryDialog } from "./HistoryDialog";

const revisions = [
  { id: "rev-9", modifiedTime: "2026-08-22T14:30:00Z" },
  { id: "rev-8", modifiedTime: "2026-08-21T11:00:00Z" },
];
const props = (over = {}) => ({
  revisions, loading: false, onRestore: vi.fn(), onClose: vi.fn(), ...over,
});

describe("HistoryDialog", () => {
  it("lists the restorable saves", () => {
    render(<HistoryDialog {...props()} />);
    expect(screen.getAllByRole("button", { name: /restore/i })).toHaveLength(2);
  });

  it("restores the chosen revision", async () => {
    const onRestore = vi.fn();
    render(<HistoryDialog {...props({ onRestore })} />);
    await userEvent.click(screen.getAllByRole("button", { name: /restore/i })[0]);
    expect(onRestore).toHaveBeenCalledWith("rev-9");
  });

  it("states the retention limit so the cap is not a surprise", () => {
    render(<HistoryDialog {...props()} />);
    expect(screen.getByText(/last 50 saves are restorable/i)).toBeInTheDocument();
  });

  it("explains the empty case", () => {
    render(<HistoryDialog {...props({ revisions: [] })} />);
    expect(screen.getByText(/no saved history/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/ui/OpenDialog.test.tsx src/ui/HistoryDialog.test.tsx
```

Expected: FAIL — cannot resolve the dialog modules.

- [ ] **Step 3: Write OpenDialog**

Create `src/ui/OpenDialog.tsx`:

```tsx
import type { PlanFile } from "../storage/driveClient";

export interface OpenDialogProps {
  plans: PlanFile[];
  loading: boolean;
  onOpen(fileId: string): void;
  onBrowseDrive(): void;
  onClose(): void;
}

export function OpenDialog({ plans, loading, onOpen, onBrowseDrive, onClose }: OpenDialogProps) {
  return (
    <div className="dialog-backdrop" role="dialog" aria-label="Open plan">
      <div className="dialog">
        <h2>Open plan</h2>
        {loading ? (
          <p>Loading…</p>
        ) : plans.length === 0 ? (
          <p>No plans yet. Save one, or browse Drive for a plan someone shared with you.</p>
        ) : (
          <ul className="plan-list">
            {plans.map((p) => (
              <li key={p.id}>
                <button onClick={() => onOpen(p.id)}>
                  <span className="plan-list-name">{p.name}</span>
                  <time dateTime={p.modifiedTime}>{new Date(p.modifiedTime).toLocaleString()}</time>
                </button>
              </li>
            ))}
          </ul>
        )}
        <footer>
          <button onClick={onBrowseDrive}>Browse Drive…</button>
          <button onClick={onClose}>Cancel</button>
        </footer>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write HistoryDialog**

Create `src/ui/HistoryDialog.tsx`:

```tsx
import { MAX_PINNED_REVISIONS, type RevisionInfo } from "../storage/driveClient";

export interface HistoryDialogProps {
  revisions: RevisionInfo[];
  loading: boolean;
  onRestore(revisionId: string): void;
  onClose(): void;
}

export function HistoryDialog({ revisions, loading, onRestore, onClose }: HistoryDialogProps) {
  return (
    <div className="dialog-backdrop" role="dialog" aria-label="Save history">
      <div className="dialog">
        <h2>Save history</h2>
        <p className="hint">Last {MAX_PINNED_REVISIONS} saves are restorable.</p>
        {loading ? (
          <p>Loading…</p>
        ) : revisions.length === 0 ? (
          <p>No saved history yet.</p>
        ) : (
          <ul className="revision-list">
            {revisions.map((r) => (
              <li key={r.id}>
                <time dateTime={r.modifiedTime}>{new Date(r.modifiedTime).toLocaleString()}</time>
                <button onClick={() => onRestore(r.id)}>Restore</button>
              </li>
            ))}
          </ul>
        )}
        <footer>
          <button onClick={onClose}>Close</button>
        </footer>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/ui/OpenDialog.test.tsx src/ui/HistoryDialog.test.tsx
```

Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add src/ui/OpenDialog.tsx src/ui/HistoryDialog.tsx src/ui/OpenDialog.test.tsx src/ui/HistoryDialog.test.tsx
git commit -m "feat: add open and history dialogs"
```

---

### Task 17: Wire the app together

**Files:**
- Modify: `src/ui/App.tsx`
- Create: `src/ui/useDraftAutosave.ts`, `src/ui/ConflictBanner.tsx`, `src/ui/app.css`
- Test: `src/ui/useDraftAutosave.test.tsx`

**Interfaces:**
- Consumes: everything built so far
- Produces:
  - `useDraftAutosave(store: Store, fileId: string | null, delayMs?: number): void`
  - `interface ConflictBannerProps { onChoose(c: ConflictChoice): void }`
  - `function ConflictBanner(props: ConflictBannerProps): JSX.Element`
  - `export default function App(): JSX.Element`

- [ ] **Step 1: Write the failing test for draft autosave**

Create `src/ui/useDraftAutosave.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDraftAutosave } from "./useDraftAutosave";
import { createStore } from "../core/store";
import { emptyPlan } from "../core/schema";
import { addTeam } from "../core/mutations";
import { loadDraft } from "../storage/localDraft";

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("useDraftAutosave", () => {
  it("writes a draft after the debounce elapses", () => {
    const store = createStore(emptyPlan("p"));
    renderHook(() => useDraftAutosave(store, "file-1", 1000));
    act(() => { store.apply(addTeam("Falcon")); });
    expect(loadDraft()).toBeNull();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(loadDraft()?.doc.rows).toHaveLength(1);
    expect(loadDraft()?.fileId).toBe("file-1");
  });

  it("writes only once for a burst of edits", () => {
    const store = createStore(emptyPlan("p"));
    renderHook(() => useDraftAutosave(store, null, 1000));
    act(() => {
      store.apply(addTeam("A"));
      store.apply(addTeam("B"));
      store.apply(addTeam("C"));
      vi.advanceTimersByTime(1000);
    });
    expect(loadDraft()?.doc.rows).toHaveLength(3);
  });

  it("does not write a draft when nothing changed", () => {
    const store = createStore(emptyPlan("p"));
    renderHook(() => useDraftAutosave(store, null, 1000));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(loadDraft()).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/ui/useDraftAutosave.test.tsx
```

Expected: FAIL — cannot resolve `./useDraftAutosave`.

- [ ] **Step 3: Write the autosave hook**

Create `src/ui/useDraftAutosave.ts`:

```ts
import { useEffect, useRef } from "react";
import type { Store } from "../core/store";
import { saveDraft } from "../storage/localDraft";

/**
 * Mirrors every edit to localStorage. This is the safety net that lets every
 * Drive failure degrade to "try again later" rather than data loss.
 */
export function useDraftAutosave(store: Store, fileId: string | null, delayMs = 1000): void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = store.subscribe(() => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        saveDraft({ doc: store.get(), fileId, savedAt: new Date().toISOString() });
      }, delayMs);
    });
    return () => {
      if (timer.current) clearTimeout(timer.current);
      unsubscribe();
    };
  }, [store, fileId, delayMs]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/ui/useDraftAutosave.test.tsx
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Write the conflict banner**

Create `src/ui/ConflictBanner.tsx`:

```tsx
import type { ConflictChoice } from "./saveController";

export interface ConflictBannerProps {
  onChoose(choice: ConflictChoice): void;
}

export function ConflictBanner({ onChoose }: ConflictBannerProps) {
  return (
    <div className="banner banner-conflict" role="alert">
      <span>This plan was changed elsewhere since you opened it.</span>
      <button onClick={() => onChoose("reload")}>Reload theirs</button>
      <button onClick={() => onChoose("copy")}>Save as a copy</button>
      <button onClick={() => onChoose("overwrite")}>Overwrite</button>
    </div>
  );
}
```

- [ ] **Step 6: Wire App**

Replace `src/ui/App.tsx`:

```tsx
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import "./app.css";
import { createStore } from "../core/store";
import { emptyPlan } from "../core/schema";
import { GanttView } from "../chart/GanttView";
import { Toolbar } from "./Toolbar";
import { StructurePanel } from "./StructurePanel";
import { OpenDialog } from "./OpenDialog";
import { HistoryDialog } from "./HistoryDialog";
import { ConflictBanner } from "./ConflictBanner";
import { useDraftAutosave } from "./useDraftAutosave";
import { useDirty } from "./useStore";
import { createSaveController } from "./saveController";
import { createAuth, defaultTokenClientFactory, PopupBlockedError } from "../storage/googleAuth";
import { createDriveClient, type PlanFile, type RevisionInfo } from "../storage/driveClient";
import { loadPickerApi, openPicker } from "../storage/picker";
import { loadDraft } from "../storage/localDraft";

export default function App() {
  const store = useMemo(() => createStore(loadDraft()?.doc ?? emptyPlan("Untitled plan")), []);
  const auth = useMemo(
    () => createAuth({
      clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      tokenClientFactory: defaultTokenClientFactory,
    }),
    [],
  );
  const drive = useMemo(() => createDriveClient({ fetch: window.fetch.bind(window), auth }), [auth]);
  const controller = useMemo(() => createSaveController({ store, drive }), [store, drive]);

  const status = useSyncExternalStore(controller.subscribe, controller.getStatus);
  const dirty = useDirty(store);
  useDraftAutosave(store, status.fileId);

  const [dialog, setDialog] = useState<"none" | "open" | "history">("none");
  const [plans, setPlans] = useState<PlanFile[]>([]);
  const [revisions, setRevisions] = useState<RevisionInfo[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void ensureAuthThen(() => controller.save());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // A blocked popup can only be reopened from a fresh user gesture, so it gets
  // its own banner with a button rather than the generic error path.
  async function ensureAuthThen(fn: () => Promise<void>) {
    try {
      if (!auth.getToken()) await auth.requestToken();
    } catch (e) {
      setPopupBlocked(e instanceof PopupBlockedError);
      if (!(e instanceof PopupBlockedError)) throw e;
      return;
    }
    setPopupBlocked(false);
    await fn();
  }

  async function openDialog() {
    await ensureAuthThen(async () => {
      setDialog("open");
      setListLoading(true);
      setPlans(await drive.listPlans());
      setListLoading(false);
    });
  }

  async function historyDialog() {
    if (!status.fileId) return;
    await ensureAuthThen(async () => {
      setDialog("history");
      setListLoading(true);
      setRevisions(await drive.listRevisions(status.fileId!));
      setListLoading(false);
    });
  }

  async function browseDrive() {
    await loadPickerApi();
    const picked = await openPicker({
      apiKey: import.meta.env.VITE_GOOGLE_API_KEY,
      token: auth.getToken()!,
    });
    if (picked) {
      await controller.openFile(picked.id);
      setDialog("none");
    }
  }

  return (
    <div className="app">
      <Toolbar
        store={store}
        saving={status.saving}
        onOpen={() => void openDialog()}
        onSave={() => void ensureAuthThen(() => controller.save())}
        onSaveAs={() => {
          const name = window.prompt("Save plan as", store.get().name);
          if (name) void ensureAuthThen(() => controller.saveAs(name));
        }}
        onHistory={() => void historyDialog()}
      />

      {status.conflict && <ConflictBanner onChoose={(c) => void controller.resolveConflict(c)} />}
      {popupBlocked && (
        <div className="banner banner-error" role="alert">
          <span>Your browser blocked the Google sign-in popup. Allow popups for this site, then:</span>
          <button onClick={() => void ensureAuthThen(async () => {})}>Sign in</button>
        </div>
      )}
      {status.error && (
        <div className="banner banner-error" role="alert">
          <span>{status.error} Your work is saved locally.</span>
          <button onClick={() => void ensureAuthThen(() => controller.save())}>Retry</button>
          <button onClick={controller.dismissError}>Dismiss</button>
        </div>
      )}

      <div className="workspace">
        <StructurePanel store={store} />
        <main className="chart-area">
          <GanttView store={store} />
        </main>
      </div>

      {dialog === "open" && (
        <OpenDialog
          plans={plans}
          loading={listLoading}
          onOpen={(id) => { void controller.openFile(id); setDialog("none"); }}
          onBrowseDrive={() => void browseDrive()}
          onClose={() => setDialog("none")}
        />
      )}
      {dialog === "history" && (
        <HistoryDialog
          revisions={revisions}
          loading={listLoading}
          onRestore={(id) => { void controller.restore(id); setDialog("none"); }}
          onClose={() => setDialog("none")}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 7: Add the stylesheet**

Create `src/ui/app.css`:

```css
* { box-sizing: border-box; }
body { margin: 0; font: 14px/1.4 system-ui, sans-serif; }

.app { display: flex; flex-direction: column; height: 100vh; }
.toolbar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid #ddd; }
.plan-name { font-weight: 600; }
.dirty-dot { color: #e08b00; }
.spacer { flex: 1; }

.workspace { display: flex; flex: 1; min-height: 0; }
.structure-panel { width: 280px; overflow-y: auto; border-right: 1px solid #ddd; padding: 8px; }
.chart-area { flex: 1; min-width: 0; }

.structure-row { display: flex; align-items: center; gap: 4px; padding: 2px 0; }
.row-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.add-child { font-size: 12px; opacity: .7; margin: 0 0 4px 32px; }

.banner { display: flex; align-items: center; gap: 8px; padding: 8px 12px; }
.banner-error { background: #fde8e8; }
.banner-conflict { background: #fff4d6; }

.dialog-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.35); display: grid; place-items: center; }
.dialog { background: #fff; padding: 16px; border-radius: 8px; min-width: 420px; max-height: 70vh; overflow: auto; }
.dialog footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.plan-list, .revision-list { list-style: none; margin: 0; padding: 0; }
.plan-list button { display: flex; justify-content: space-between; width: 100%; padding: 8px; }
.revision-list li { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; }
.hint { color: #666; font-size: 12px; }
```

- [ ] **Step 8: Verify the whole suite and the app**

```bash
npm test
npm run lint
npm run build
npm run dev
```

Expected: all tests pass, lint clean, build succeeds. In the browser: sign in, add a team/stream/item, save, reload the page and reopen the plan from Drive.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: wire toolbar panel chart and drive into the app shell"
```

---

### Task 18: Deploy to GitHub Pages

**Files:**
- Create: `.github/workflows/deploy.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: `npm run build`, repository variables `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_API_KEY`
- Produces: a published site at `https://ahmad2x4.github.io/scrum-gantt/`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
        env:
          VITE_GOOGLE_CLIENT_ID: ${{ vars.VITE_GOOGLE_CLIENT_ID }}
          VITE_GOOGLE_API_KEY: ${{ vars.VITE_GOOGLE_API_KEY }}
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Note `vars.` not `secrets.` — these are public browser credentials and Vite inlines them into the bundle regardless, so storing them as secrets would imply a protection that does not exist.

- [ ] **Step 2: Configure the repository**

Manual steps in GitHub:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. **Settings → Secrets and variables → Actions → Variables tab → New repository variable** for each of `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_API_KEY`.

- [ ] **Step 3: Write the README**

Replace `README.md`:

````markdown
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

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server on port 5173 |
| `npm test` | Unit tests |
| `npm run lint` | Lint, including layer-boundary rules |
| `npm run build` | Production build into `dist/` |
| `npm run test:e2e` | Playwright smoke test |

## Google Cloud setup

The app is a static SPA with no backend, so it holds no secrets. Access is
controlled by origin and referrer restrictions, not by hiding credentials.

- **OAuth client** — add `https://ahmad2x4.github.io` and
  `http://localhost:5173` as Authorized JavaScript origins. Leave redirect URIs
  empty; the token client uses a popup.
- **API key** (Picker only) — restrict to HTTP referrer
  `https://ahmad2x4.github.io/scrum-gantt/*` and to the Google Picker API.
- **Enable** the Google Drive API and Google Picker API.
- **Publish** the OAuth consent screen. In Testing status it is limited to 100
  users and authorizations expire after 7 days.

## Architecture

See `docs/superpowers/specs/2026-08-22-scrum-gantt-design.md`.

Layer boundaries are enforced by lint: only `src/chart/` may import amCharts;
`src/ui/` and `src/storage/` must not import `src/chart/`; `src/core/` imports
nothing from other layers.

## Licence note

Charts are rendered with amCharts 5, which is free to use with a small amCharts
branding link that must not be hidden or altered.
````

- [ ] **Step 4: Commit and verify the deploy**

```bash
git add .github/workflows/deploy.yml README.md
git commit -m "chore: deploy to github pages via actions"
git push origin main
```

Then watch the run:

```bash
gh run watch
```

Expected: the workflow succeeds and the site loads at `https://ahmad2x4.github.io/scrum-gantt/`. Sign-in works, which confirms the JavaScript origin is registered correctly.

---

### Task 19: Playwright smoke test

**Files:**
- Create: `playwright.config.ts`, `e2e/smoke.spec.ts`
- Modify: `package.json`, `.gitignore`

**Interfaces:**
- Consumes: `npm run dev`
- Produces: `npm run test:e2e`

This is the only coverage for `GanttView.tsx`, which cannot be unit-tested because amCharts renders to canvas and jsdom does not implement it. The test deliberately avoids Google sign-in — it exercises the chart and structure panel only.

- [ ] **Step 1: Install Playwright**

```bash
npm install --save-dev @playwright/test
npx playwright install chromium
```

Add to `package.json` scripts:

```json
{ "test:e2e": "playwright test" }
```

Append to `.gitignore`:

```
playwright-report/
test-results/
```

- [ ] **Step 2: Configure Playwright**

Create `playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:5173/scrum-gantt/" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173/scrum-gantt/",
    reuseExistingServer: !process.env.CI,
  },
});
```

- [ ] **Step 3: Write the smoke test**

Create `e2e/smoke.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("the chart mounts and the console stays clean", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");

  // amCharts renders into a canvas; its presence proves the root mounted.
  await expect(page.locator(".chart-area canvas").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("adding a team through the panel reaches the chart without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await page.getByRole("button", { name: /add team/i }).click();
  await expect(page.getByText("New team")).toBeVisible();

  await page.getByRole("button", { name: /add stream to new team/i }).click();
  await expect(page.getByText("New stream")).toBeVisible();

  await page.getByRole("button", { name: /add item to new stream/i }).click();
  await expect(page.getByText("New item")).toBeVisible();

  expect(errors).toEqual([]);
});

test("the unsaved marker appears after an edit", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("dirty-dot")).toBeHidden();
  await page.getByRole("button", { name: /add team/i }).click();
  await expect(page.getByTestId("dirty-dot")).toBeVisible();
});
```

- [ ] **Step 4: Run it**

```bash
npm run test:e2e
```

Expected: 3 tests pass. If the canvas assertion fails, the chart did not mount — check the browser console for amCharts errors before changing the test.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts e2e package.json package-lock.json .gitignore
git commit -m "test: add playwright smoke test covering the chart mount"
```

---

## Done

At this point the app: renders a Team → Stream → Item Gantt with milestones,
dependency links and progress; edits structure through a side panel and bars
through the chart; saves to a visible Drive folder with pinned revision history;
opens your own plans and colleagues' shared plans; recovers from crashes via a
local draft; and deploys to GitHub Pages on every push to `main`.

Deferred by decision, not oversight: the **sprint ruler** (calendar dates only
for now), recorded in the spec as the most likely next addition.
