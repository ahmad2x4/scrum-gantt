import { describe, it, expect } from "vitest";
import { emptyPlan } from "./schema";
import { checkInvariants, assertValid, InvariantError } from "./invariants";
import type { PlanDocument } from "./types";

function plan(rows: PlanDocument["rows"], tasks: PlanDocument["tasks"] = []): PlanDocument {
  return { ...emptyPlan("t"), rows, tasks };
}

const codes = (doc: PlanDocument) => checkInvariants(doc).map((v) => v.code).sort();

describe("checkInvariants", () => {
  it("accepts a well-formed team/stream/item tree", () => {
    const doc = plan(
      [
        { id: "t1", name: "Falcon", kind: "team" },
        { id: "s1", name: "Payments", kind: "stream", parentId: "t1" },
        { id: "i1", name: "Tokenisation", kind: "item", parentId: "s1" },
      ],
      [{ id: "i1", start: 0, duration: 5 }],
    );
    expect(checkInvariants(doc)).toEqual([]);
  });

  it("rejects a team with a parent", () => {
    const doc = plan([
      { id: "t1", name: "Falcon", kind: "team" },
      { id: "t2", name: "Otter", kind: "team", parentId: "t1" },
    ]);
    expect(codes(doc)).toContain("team-has-parent");
  });

  it("rejects a stream whose parent is not a team", () => {
    const doc = plan([
      { id: "t1", name: "Falcon", kind: "team" },
      { id: "s1", name: "A", kind: "stream", parentId: "t1" },
      { id: "s2", name: "B", kind: "stream", parentId: "s1" },
    ]);
    expect(codes(doc)).toContain("bad-parent-kind");
  });

  it("rejects an item whose parent is not a stream", () => {
    const doc = plan(
      [
        { id: "t1", name: "Falcon", kind: "team" },
        { id: "i1", name: "Orphaned", kind: "item", parentId: "t1" },
      ],
      [{ id: "i1", start: 0, duration: 1 }],
    );
    expect(codes(doc)).toContain("bad-parent-kind");
  });

  it("rejects a missing parent reference", () => {
    const doc = plan([{ id: "s1", name: "A", kind: "stream", parentId: "ghost" }]);
    expect(codes(doc)).toContain("missing-parent");
  });

  it("rejects a child appearing before its parent", () => {
    const doc = plan([
      { id: "s1", name: "A", kind: "stream", parentId: "t1" },
      { id: "t1", name: "Falcon", kind: "team" },
    ]);
    expect(codes(doc)).toContain("child-before-parent");
  });

  it("rejects a task with no matching item row", () => {
    const doc = plan([{ id: "t1", name: "Falcon", kind: "team" }], [{ id: "ghost", start: 0, duration: 1 }]);
    expect(codes(doc)).toContain("orphan-task");
  });

  it("rejects an item row with no task", () => {
    const doc = plan([
      { id: "t1", name: "Falcon", kind: "team" },
      { id: "s1", name: "A", kind: "stream", parentId: "t1" },
      { id: "i1", name: "X", kind: "item", parentId: "s1" },
    ]);
    expect(codes(doc)).toContain("item-without-task");
  });

  it("rejects a task attached to a group row", () => {
    const doc = plan([{ id: "t1", name: "Falcon", kind: "team" }], [{ id: "t1", start: 0, duration: 1 }]);
    expect(codes(doc)).toContain("task-on-group");
  });

  it("rejects a cycle in linkTo", () => {
    const doc = plan(
      [
        { id: "t1", name: "F", kind: "team" },
        { id: "s1", name: "S", kind: "stream", parentId: "t1" },
        { id: "a", name: "A", kind: "item", parentId: "s1" },
        { id: "b", name: "B", kind: "item", parentId: "s1" },
      ],
      [
        { id: "a", start: 0, duration: 1, linkTo: ["b"] },
        { id: "b", start: 0, duration: 1, linkTo: ["a"] },
      ],
    );
    expect(codes(doc)).toContain("link-cycle");
  });

  it("rejects progress out of range and negative duration", () => {
    const doc = plan(
      [
        { id: "t1", name: "F", kind: "team" },
        { id: "s1", name: "S", kind: "stream", parentId: "t1" },
        { id: "a", name: "A", kind: "item", parentId: "s1" },
      ],
      [{ id: "a", start: 0, duration: -1, progress: 150 }],
    );
    expect(codes(doc)).toContain("bad-duration");
    expect(codes(doc)).toContain("bad-progress");
  });
});

describe("assertValid", () => {
  it("throws InvariantError carrying the violations", () => {
    const doc = plan([{ id: "s1", name: "A", kind: "stream", parentId: "ghost" }]);
    try {
      assertValid(doc);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(InvariantError);
      expect((e as InvariantError).violations.length).toBeGreaterThan(0);
    }
  });
});
