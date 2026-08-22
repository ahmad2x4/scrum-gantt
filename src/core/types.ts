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
