import type { PlanDocument, Task } from "../core/types";
import type { Mutation } from "../core/mutations";
import { checkInvariants } from "../core/invariants";
import { fromChartProgress, type GanttTask } from "./projection";

function merge(existing: Task, snapshot: GanttTask): Task {
  const next: Task = { ...existing, start: snapshot.start, duration: snapshot.duration };
  if (snapshot.progress !== undefined) next.progress = fromChartProgress(snapshot.progress);
  if (snapshot.linkTo !== undefined) next.linkTo = snapshot.linkTo;
  return next;
}

function same(a: Task, b: GanttTask): boolean {
  return (
    a.start === b.start &&
    a.duration === b.duration &&
    (a.progress ?? 0) === fromChartProgress(b.progress ?? 0) &&
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
