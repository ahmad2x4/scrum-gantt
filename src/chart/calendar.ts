import type { Calendar } from "../core/types";

/** The calendar settings the chart runs with, derived from the document's. */
export interface ChartCalendar {
  durationUnit: Calendar["durationUnit"];
  weekends: number[];
  excludeWeekends: boolean;
  holidays: Date[];
}

/**
 * excludeWeekends is forced off in week mode.
 *
 * GanttSeries.getOpenValue steps a task off a weekend by adding one unit at a
 * time, and a unit there is a bare week with no count (GanttSeries.js:1350) —
 * so a task starting on a Saturday steps Saturday to Saturday forever and hangs
 * the tab. Weekends sit inside a calendar week anyway, so there is nothing to
 * exclude: a two-week sprint is fourteen calendar days.
 */
export function chartCalendar(cal: Calendar): ChartCalendar {
  return {
    durationUnit: cal.durationUnit,
    weekends: cal.weekends,
    excludeWeekends: cal.durationUnit === "week" ? false : cal.excludeWeekends,
    holidays: cal.holidays.map((d) => new Date(d)),
  };
}
