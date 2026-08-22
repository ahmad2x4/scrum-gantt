import type { Calendar, PlanDocument, Task } from "../core/types";

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
  /** Fraction 0-1. The Gantt treats progress as a fraction, not a percentage. */
  progress?: number;
  linkTo?: string[];
}

/** PlanDocument stores 0-100; the chart wants 0-1. */
export const toChartProgress = (percent: number): number => percent / 100;
export const fromChartProgress = (fraction: number): number => Math.round(fraction * 100);

export function hexToNumber(hex: string): number {
  const cleaned = hex.replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    throw new Error(`Invalid hex colour: ${hex}`);
  }
  return parseInt(cleaned, 16);
}

const MS_PER_UNIT: Record<Calendar["durationUnit"], number> = {
  day: 86_400_000,
  week: 604_800_000,
};

/**
 * Group rows carry no task of their own, but the Gantt draws no bar for them
 * either, so a team row would read as 0% forever. Synthesise a bar spanning the
 * earliest start to the latest end of every item beneath it, with progress
 * weighted by duration.
 */
function rollUpGroups(doc: PlanDocument, msPerUnit: number): GanttTask[] {
  const taskById = new Map(doc.tasks.map((t) => [t.id, t]));
  const childrenOf = new Map<string, string[]>();
  for (const row of doc.rows) {
    if (row.parentId === undefined) continue;
    const siblings = childrenOf.get(row.parentId);
    if (siblings) siblings.push(row.id);
    else childrenOf.set(row.parentId, [row.id]);
  }

  const descendantTasks = (rootId: string): Task[] => {
    const found: Task[] = [];
    const stack = [rootId];
    while (stack.length > 0) {
      const id = stack.pop()!;
      for (const childId of childrenOf.get(id) ?? []) {
        const task = taskById.get(childId);
        if (task) found.push(task);
        stack.push(childId);
      }
    }
    return found;
  };

  const out: GanttTask[] = [];
  for (const row of doc.rows) {
    if (row.kind === "item") continue;
    const children = descendantTasks(row.id);
    if (children.length === 0) continue;

    const start = Math.min(...children.map((t) => t.start));
    const end = Math.max(...children.map((t) => t.start + t.duration * msPerUnit));
    const weight = children.reduce((sum, t) => sum + t.duration, 0);
    const weighted = children.reduce((sum, t) => sum + t.duration * (t.progress ?? 0), 0);

    out.push({
      id: row.id,
      start,
      duration: (end - start) / msPerUnit,
      progress: toChartProgress(weight > 0 ? weighted / weight : 0),
    });
  }
  return out;
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
    if (task.progress !== undefined) t.progress = toChartProgress(task.progress);
    if (task.linkTo !== undefined) t.linkTo = task.linkTo;
    return t;
  });

  return { categories, tasks: [...rollUpGroups(doc, MS_PER_UNIT[doc.calendar.durationUnit]), ...tasks] };
}
