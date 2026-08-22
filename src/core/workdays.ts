import type { Calendar } from "./types";

const DAY_MS = 86_400_000;
const WEEK_MS = 604_800_000;

/** Guard against a calendar with no working days at all. */
const MAX_STEPS = 5000;

const msPerUnit = (cal: Calendar): number => (cal.durationUnit === "week" ? WEEK_MS : DAY_MS);

/**
 * Working-day arithmetic only applies to day durations with weekends excluded.
 * Week durations and inclusive calendars use plain arithmetic, so the two paths
 * stay explicit rather than silently approximating each other.
 */
const usesWorkdays = (cal: Calendar): boolean =>
  cal.durationUnit === "day" && cal.excludeWeekends;

function isoDate(ms: number): string {
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function isWorkingDay(ms: number, cal: Calendar): boolean {
  if (!cal.excludeWeekends) return true;
  if (cal.weekends.includes(new Date(ms).getDay())) return false;
  return !cal.holidays.includes(isoDate(ms));
}

/** Timestamp at which `units` of work beginning at `start` are complete. */
export function endOfWork(start: number, units: number, cal: Calendar): number {
  if (units <= 0) return start;
  if (!usesWorkdays(cal)) return start + units * msPerUnit(cal);

  let ms = start;
  let remaining = units;
  let steps = 0;
  while (remaining > 0 && steps < MAX_STEPS) {
    if (isWorkingDay(ms, cal)) remaining--;
    ms += DAY_MS;
    steps++;
  }
  return ms;
}

/** How many units of work fit in the half-open span [from, to). */
export function workingUnitsBetween(from: number, to: number, cal: Calendar): number {
  if (to <= from) return 0;
  if (!usesWorkdays(cal)) return (to - from) / msPerUnit(cal);

  let count = 0;
  let steps = 0;
  for (let ms = from; ms < to && steps < MAX_STEPS; ms += DAY_MS, steps++) {
    if (isWorkingDay(ms, cal)) count++;
  }
  return count;
}
