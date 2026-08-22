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

  return { categories, tasks };
}
