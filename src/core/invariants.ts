import type { PlanDocument, Row } from "./types";

export interface Violation {
  code: string;
  message: string;
  rowId?: string;
}

export class InvariantError extends Error {
  constructor(public violations: Violation[]) {
    super(violations.map((v) => v.message).join("; "));
    this.name = "InvariantError";
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
