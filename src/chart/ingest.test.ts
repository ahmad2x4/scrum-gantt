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
    const next = ingestTasks([{ id: "a", start: 1000, duration: 5, progress: 75 }])(seeded());
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
