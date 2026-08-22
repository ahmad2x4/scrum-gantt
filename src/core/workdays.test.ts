import { describe, it, expect } from "vitest";
import { isWorkingDay, endOfWork, workingUnitsBetween } from "./workdays";
import type { Calendar } from "./types";

const cal = (over: Partial<Calendar> = {}): Calendar => ({
  durationUnit: "day",
  weekends: [0, 6],
  excludeWeekends: true,
  holidays: [],
  ...over,
});

// 2026-08-17 is a Monday.
const MON = new Date(2026, 7, 17).getTime();
const SAT = new Date(2026, 7, 22).getTime();
const DAY = 86_400_000;

describe("isWorkingDay", () => {
  it("accepts a weekday", () => {
    expect(isWorkingDay(MON, cal())).toBe(true);
  });

  it("rejects a weekend day", () => {
    expect(isWorkingDay(SAT, cal())).toBe(false);
  });

  it("rejects a configured holiday", () => {
    expect(isWorkingDay(MON, cal({ holidays: ["2026-08-17"] }))).toBe(false);
  });

  it("honours a non-default weekend configuration", () => {
    expect(isWorkingDay(MON, cal({ weekends: [1] }))).toBe(false);
  });

  it("treats every day as working when weekends are not excluded", () => {
    expect(isWorkingDay(SAT, cal({ excludeWeekends: false }))).toBe(true);
  });
});

describe("endOfWork", () => {
  it("spans Monday plus five working days to the following Saturday", () => {
    expect(endOfWork(MON, 5, cal())).toBe(MON + 5 * DAY);
  });

  it("skips the weekend when work runs past Friday", () => {
    // Two working days from Friday land on the following Tuesday.
    const FRI = MON + 4 * DAY;
    expect(endOfWork(FRI, 2, cal())).toBe(FRI + 4 * DAY);
  });

  it("returns the start for a zero-duration milestone", () => {
    expect(endOfWork(MON, 0, cal())).toBe(MON);
  });

  it("uses plain calendar arithmetic when weekends are not excluded", () => {
    expect(endOfWork(MON, 5, cal({ excludeWeekends: false }))).toBe(MON + 5 * DAY);
  });

  it("uses plain arithmetic for the week unit", () => {
    expect(endOfWork(MON, 2, cal({ durationUnit: "week" }))).toBe(MON + 14 * DAY);
  });
});

describe("workingUnitsBetween", () => {
  it("counts only working days", () => {
    expect(workingUnitsBetween(MON, MON + 7 * DAY, cal())).toBe(5);
  });

  it("is zero for an empty span", () => {
    expect(workingUnitsBetween(MON, MON, cal())).toBe(0);
  });

  it("round-trips with endOfWork", () => {
    const end = endOfWork(MON, 8, cal());
    expect(workingUnitsBetween(MON, end, cal())).toBe(8);
  });

  it("counts calendar days when weekends are not excluded", () => {
    expect(workingUnitsBetween(MON, MON + 7 * DAY, cal({ excludeWeekends: false }))).toBe(7);
  });
});
