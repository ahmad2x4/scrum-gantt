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
