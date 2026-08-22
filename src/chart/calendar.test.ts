import { describe, it, expect } from "vitest";
import { chartCalendar } from "./calendar";
import type { Calendar } from "../core/types";

const cal = (over: Partial<Calendar> = {}): Calendar => ({
  durationUnit: "day",
  weekends: [0, 6],
  excludeWeekends: true,
  holidays: [],
  ...over,
});

describe("chartCalendar", () => {
  it("passes a day calendar straight through", () => {
    const out = chartCalendar(cal());
    expect(out.durationUnit).toBe("day");
    expect(out.excludeWeekends).toBe(true);
    expect(out.weekends).toEqual([0, 6]);
  });

  it("turns weekend exclusion off in week mode", () => {
    // Left on, amCharts walks a weekend start forward a whole week at a time,
    // lands on the same weekday every step, and never terminates.
    expect(chartCalendar(cal({ durationUnit: "week" })).excludeWeekends).toBe(
      false,
    );
  });

  it("leaves an inclusive day calendar alone", () => {
    expect(chartCalendar(cal({ excludeWeekends: false })).excludeWeekends).toBe(
      false,
    );
  });

  it("converts holiday strings to dates the chart can read", () => {
    const out = chartCalendar(cal({ holidays: ["2026-12-25"] }));
    expect(out.holidays[0]).toBeInstanceOf(Date);
    expect(out.holidays[0].getTime()).toBe(new Date("2026-12-25").getTime());
  });
});
