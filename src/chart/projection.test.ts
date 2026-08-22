import { describe, it, expect } from "vitest";
import { project, hexToNumber } from "./projection";
import { emptyPlan } from "../core/schema";
import type { PlanDocument } from "../core/types";

const doc = (over: Partial<PlanDocument>): PlanDocument => ({ ...emptyPlan("p"), ...over });

describe("hexToNumber", () => {
  it("converts a six-digit hex string", () => {
    expect(hexToNumber("#ff0000")).toBe(0xff0000);
    expect(hexToNumber("#000000")).toBe(0x000000);
    expect(hexToNumber("#1a2b3c")).toBe(0x1a2b3c);
  });

  it("tolerates a missing leading hash", () => {
    expect(hexToNumber("00ff00")).toBe(0x00ff00);
  });

  it("throws on a malformed value rather than silently yielding NaN", () => {
    expect(() => hexToNumber("#xyz")).toThrow();
  });
});

describe("project", () => {
  it("passes rows through in order with hierarchy intact", () => {
    const { categories } = project(
      doc({
        rows: [
          { id: "t1", name: "Falcon", kind: "team", color: "#ff0000" },
          { id: "s1", name: "Payments", kind: "stream", parentId: "t1" },
        ],
      }),
    );
    expect(categories).toEqual([
      { id: "t1", name: "Falcon", color: 0xff0000 },
      { id: "s1", name: "Payments", parentId: "t1" },
    ]);
  });

  it("carries collapsed state through", () => {
    const { categories } = project(doc({ rows: [{ id: "t1", name: "F", kind: "team", collapsed: true }] }));
    expect(categories[0].collapsed).toBe(true);
  });

  it("emits tasks with epoch-ms starts untouched", () => {
    const { tasks } = project(doc({ tasks: [{ id: "a", start: 1700000000000, duration: 5, progress: 40 }] }));
    // start and duration pass through; progress is rescaled to the chart's 0-1.
    expect(tasks).toEqual([{ id: "a", start: 1700000000000, duration: 5, progress: 0.4 }]);
  });

  it("preserves zero duration so milestones render", () => {
    const { tasks } = project(doc({ tasks: [{ id: "m", start: 1, duration: 0 }] }));
    expect(tasks[0].duration).toBe(0);
  });

  it("keeps linkTo arrays for dependency arrows", () => {
    const { tasks } = project(doc({ tasks: [{ id: "a", start: 1, duration: 2, linkTo: ["b"] }] }));
    expect(tasks[0].linkTo).toEqual(["b"]);
  });

  it("omits undefined optional fields rather than emitting nulls", () => {
    const { categories } = project(doc({ rows: [{ id: "t1", name: "F", kind: "team" }] }));
    expect(Object.keys(categories[0])).toEqual(["id", "name"]);
  });
});

describe("progress scale", () => {
  it("converts document percentage to the chart's 0-1 fraction", () => {
    const { tasks } = project(doc({ tasks: [{ id: "a", start: 1, duration: 2, progress: 70 }] }));
    expect(tasks[0].progress).toBe(0.7);
  });

  it("maps 100 percent to 1, which is what stops the bar being hatched", () => {
    const { tasks } = project(doc({ tasks: [{ id: "a", start: 1, duration: 2, progress: 100 }] }));
    expect(tasks[0].progress).toBe(1);
  });

  it("maps zero to zero", () => {
    const { tasks } = project(doc({ tasks: [{ id: "a", start: 1, duration: 2, progress: 0 }] }));
    expect(tasks[0].progress).toBe(0);
  });
});

describe("group roll-up", () => {
  // Anchored to a real Monday: epoch 0 lands on a different weekday depending
  // on the runner's timezone, which would make working-day maths untestable.
  const MON = new Date(2026, 7, 17).getTime();
  const DAY = 86_400_000;

  const tree = (): PlanDocument =>
    doc({
      rows: [
        { id: "t1", name: "Falcon", kind: "team" },
        { id: "s1", name: "Payments", kind: "stream", parentId: "t1" },
        { id: "a", name: "A", kind: "item", parentId: "s1" },
        { id: "b", name: "B", kind: "item", parentId: "s1" },
      ],
      tasks: [
        { id: "a", start: MON, duration: 10, progress: 100 },
        { id: "b", start: MON + 14 * DAY, duration: 10, progress: 0 },
      ],
    });

  it("spans a group bar from the earliest start to the latest end", () => {
    const { tasks } = project(tree());
    const team = tasks.find((t) => t.id === "t1")!;
    expect(team.start).toBe(MON);
    // Two consecutive 10-working-day tasks: four full working weeks, measured
    // the way the chart measures them rather than as 28 calendar days.
    expect(team.duration).toBe(20);
  });

  it("weights group progress by duration", () => {
    const { tasks } = project(tree());
    // 10 days at 100% and 10 days at 0% average to 50%, i.e. 0.5 on the chart.
    expect(tasks.find((t) => t.id === "t1")!.progress).toBe(0.5);
    expect(tasks.find((t) => t.id === "s1")!.progress).toBe(0.5);
  });

  it("rolls up through intermediate levels, not just direct children", () => {
    const { tasks } = project(tree());
    expect(tasks.find((t) => t.id === "t1")!.duration).toBe(
      tasks.find((t) => t.id === "s1")!.duration,
    );
  });

  it("emits no bar for a group with no items beneath it", () => {
    const { tasks } = project(doc({ rows: [{ id: "t1", name: "Empty", kind: "team" }] }));
    expect(tasks.find((t) => t.id === "t1")).toBeUndefined();
  });

  it("respects the week duration unit when spanning", () => {
    const base = tree();
    const weekly: PlanDocument = {
      ...base,
      calendar: { ...base.calendar, durationUnit: "week" },
      tasks: [
        { id: "a", start: MON, duration: 1, progress: 0 },
        { id: "b", start: MON + 7 * DAY, duration: 1, progress: 0 },
      ],
    };
    expect(project(weekly).tasks.find((t) => t.id === "t1")!.duration).toBe(2);
  });

  it("leaves item tasks untouched", () => {
    const { tasks } = project(tree());
    expect(tasks.find((t) => t.id === "a")).toEqual({ id: "a", start: MON, duration: 10, progress: 1 });
  });
});
