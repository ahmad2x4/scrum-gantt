import type { PlanDocument, Row, Task } from "./types";
import { teamColor } from "./palette";

export type Mutation = (doc: PlanDocument) => PlanDocument;

const newId = () => crypto.randomUUID();

/** Index just past the end of a row's subtree, so inserts land inside the parent. */
function subtreeEnd(rows: Row[], parentId: string): number {
  const start = rows.findIndex((r) => r.id === parentId);
  if (start < 0) return rows.length;
  const descendants = new Set([parentId]);
  let i = start + 1;
  for (; i < rows.length; i++) {
    const p = rows[i].parentId;
    if (p !== undefined && descendants.has(p)) {
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

export const addTeam =
  (name: string): Mutation =>
  (doc) => {
    // Colour is assigned here, not left to the chart: an uncoloured row is
    // given whatever colour the chart's rotating set is on, so it changes on
    // every edit.
    const teams = doc.rows.filter((r) => r.kind === "team").length;
    return {
      ...doc,
      rows: [
        ...doc.rows,
        { id: newId(), name, kind: "team", color: teamColor(teams) },
      ],
    };
  };

export const addStream =
  (teamId: string, name: string): Mutation =>
  (doc) => ({
    ...doc,
    rows: insertAt(doc.rows, subtreeEnd(doc.rows, teamId), {
      id: newId(),
      name,
      kind: "stream",
      parentId: teamId,
    }),
  });

export const addItem =
  (streamId: string, name: string, start: number, duration: number): Mutation =>
  (doc) => {
    const id = newId();
    return {
      ...doc,
      rows: insertAt(doc.rows, subtreeEnd(doc.rows, streamId), {
        id,
        name,
        kind: "item",
        parentId: streamId,
      }),
      tasks: [...doc.tasks, { id, start, duration, progress: 0 }],
    };
  };

const patchRow =
  (id: string, patch: Partial<Row>): Mutation =>
  (doc) => ({
    ...doc,
    rows: doc.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
  });

export const renameRow = (id: string, name: string): Mutation =>
  patchRow(id, { name });
export const setRowColor = (id: string, color: string): Mutation =>
  patchRow(id, { color });
export const setCollapsed = (id: string, collapsed: boolean): Mutation =>
  patchRow(id, { collapsed });

export const updateTask =
  (id: string, patch: Partial<Omit<Task, "id">>): Mutation =>
  (doc) => ({
    ...doc,
    tasks: doc.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  });

export const removeRow =
  (id: string): Mutation =>
  (doc) => {
    const doomed = new Set([id]);
    for (const row of doc.rows) {
      if (row.parentId !== undefined && doomed.has(row.parentId))
        doomed.add(row.id);
    }
    return {
      ...doc,
      rows: doc.rows.filter((r) => !doomed.has(r.id)),
      tasks: doc.tasks
        .filter((t) => !doomed.has(t.id))
        .map((t) =>
          t.linkTo
            ? { ...t, linkTo: t.linkTo.filter((x) => !doomed.has(x)) }
            : t,
        ),
    };
  };

export const moveRow =
  (id: string, toIndex: number): Mutation =>
  (doc) => {
    const from = doc.rows.findIndex((r) => r.id === id);
    if (from < 0) return doc;
    const end = subtreeEnd(doc.rows, id);
    const block = doc.rows.slice(from, end);
    const rest = [...doc.rows.slice(0, from), ...doc.rows.slice(end)];
    const clamped = Math.max(0, Math.min(toIndex, rest.length));
    return {
      ...doc,
      rows: [...rest.slice(0, clamped), ...block, ...rest.slice(clamped)],
    };
  };
