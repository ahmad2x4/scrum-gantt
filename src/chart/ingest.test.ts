import { describe, it, expect } from "vitest";
import { ingestTasks, isEcho } from "./ingest";
import { emptyPlan } from "../core/schema";
import type { PlanDocument } from "../core/types";

function seeded(): PlanDocument {
  return {
    ...emptyPlan("p"),
    rows: [
      { id: "t1", name: "F", kind: "team" },
      { id: "s1", name: "S", kind: "stream", parentId: "t1" },
      { id: "a", name: "A", kind: "item", parentId: "s1" },
    ],
    tasks: [{ id: "a", start: 1000, duration: 5, progress: 0 }],
  };
}

describe("isEcho", () => {
  it("is true when snapshots match the document exactly", () => {
    expect(isEcho(seeded(), [{ id: "a", start: 1000, duration: 5, progress: 0 }])).toBe(true);
  });

  it("is false when a value differs", () => {
    expect(isEcho(seeded(), [{ id: "a", start: 2000, duration: 5, progress: 0 }])).toBe(false);
  });

  it("is false when a task is missing", () => {
    expect(isEcho(seeded(), [])).toBe(false);
  });
});

describe("ingestTasks", () => {
  it("applies a drag that changed start and duration", () => {
    const next = ingestTasks([{ id: "a", start: 9000, duration: 12, progress: 0 }])(seeded());
    expect(next.tasks[0]).toMatchObject({ id: "a", start: 9000, duration: 12 });
  });

  it("applies a progress change", () => {
    // The chart reports a fraction; the document stores a percentage.
    const next = ingestTasks([{ id: "a", start: 1000, duration: 5, progress: 0.75 }])(seeded());
    expect(next.tasks[0].progress).toBe(75);
  });

  it("applies a new dependency link", () => {
    const next = ingestTasks([{ id: "a", start: 1000, duration: 5, progress: 0, linkTo: [] }])(seeded());
    expect(next.tasks[0].linkTo).toEqual([]);
  });

  it("ignores snapshots for ids not in the document", () => {
    const next = ingestTasks([{ id: "ghost", start: 1, duration: 1 }])(seeded());
    expect(next.tasks).toHaveLength(1);
    expect(next.tasks[0]).toMatchObject({ id: "a", start: 1000 });
  });

  it("rejects an edit that would violate invariants, returning the document unchanged", () => {
    const doc = seeded();
    const next = ingestTasks([{ id: "a", start: 1000, duration: -5, progress: 0 }])(doc);
    expect(next).toBe(doc);
  });

  it("rejects an edit introducing a link cycle", () => {
    const base = seeded();
    const doc: PlanDocument = {
      ...base,
      rows: [...base.rows, { id: "b", name: "B", kind: "item", parentId: "s1" }],
      tasks: [
        { id: "a", start: 1000, duration: 5, linkTo: ["b"] },
        { id: "b", start: 2000, duration: 5 },
      ],
    };
    const next = ingestTasks([
      { id: "a", start: 1000, duration: 5, linkTo: ["b"] },
      { id: "b", start: 2000, duration: 5, linkTo: ["a"] },
    ])(doc);
    expect(next).toBe(doc);
  });

  it("does not mutate the input document", () => {
    const doc = seeded();
    ingestTasks([{ id: "a", start: 9999, duration: 1 }])(doc);
    expect(doc.tasks[0].start).toBe(1000);
  });
});

describe("progress scale", () => {
  it("converts the chart's 0-1 fraction back to a document percentage", () => {
    const next = ingestTasks([{ id: "a", start: 1000, duration: 5, progress: 0.75 }])(seeded());
    expect(next.tasks[0].progress).toBe(75);
  });

  it("rounds away floating point noise from dragging", () => {
    const next = ingestTasks([{ id: "a", start: 1000, duration: 5, progress: 0.7000000001 }])(seeded());
    expect(next.tasks[0].progress).toBe(70);
  });

  it("treats a matching fraction as an echo despite the differing scale", () => {
    const doc = { ...seeded(), tasks: [{ id: "a", start: 1000, duration: 5, progress: 70 }] };
    expect(isEcho(doc, [{ id: "a", start: 1000, duration: 5, progress: 0.7 }])).toBe(true);
  });
});

describe("group roll-up snapshots", () => {
  it("ignores rolled-up group bars rather than treating them as edits", () => {
    const doc = seeded();
    const next = ingestTasks([
      { id: "t1", start: 1000, duration: 5, progress: 0 },
      { id: "s1", start: 1000, duration: 5, progress: 0 },
      { id: "a", start: 1000, duration: 5, progress: 0 },
    ])(doc);
    expect(next.tasks).toHaveLength(1);
    expect(next.tasks[0].id).toBe("a");
  });

  it("still detects an echo when the chart also carries group bars", () => {
    const doc = seeded();
    expect(
      isEcho(doc, [
        { id: "t1", start: 1000, duration: 5, progress: 0 },
        { id: "s1", start: 1000, duration: 5, progress: 0 },
        { id: "a", start: 1000, duration: 5, progress: 0 },
      ]),
    ).toBe(true);
  });

  it("still detects a real edit when group bars are present", () => {
    const doc = seeded();
    expect(
      isEcho(doc, [
        { id: "t1", start: 1000, duration: 5, progress: 0 },
        { id: "a", start: 9999, duration: 5, progress: 0 },
      ]),
    ).toBe(false);
  });

  it("is not an echo when a tracked task is missing from the chart", () => {
    expect(isEcho(seeded(), [{ id: "t1", start: 1000, duration: 5 }])).toBe(false);
  });
});
