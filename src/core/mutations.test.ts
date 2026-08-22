import { describe, it, expect } from "vitest";
import { emptyPlan } from "./schema";
import { checkInvariants } from "./invariants";
import {
  addTeam,
  addStream,
  addItem,
  renameRow,
  setRowColor,
  removeRow,
  updateTask,
  moveRow,
  setDurationUnit,
} from "./mutations";
import type { PlanDocument } from "./types";

function seeded(): {
  doc: PlanDocument;
  teamId: string;
  streamId: string;
  itemId: string;
} {
  let doc = addTeam("Falcon")(emptyPlan("p"));
  const teamId = doc.rows[0].id;
  doc = addStream(teamId, "Payments")(doc);
  const streamId = doc.rows[1].id;
  doc = addItem(streamId, "Tokenisation", 1000, 5)(doc);
  const itemId = doc.rows[2].id;
  return { doc, teamId, streamId, itemId };
}

describe("add mutations", () => {
  it("appends a team with no parent", () => {
    const doc = addTeam("Falcon")(emptyPlan("p"));
    expect(doc.rows).toHaveLength(1);
    expect(doc.rows[0]).toMatchObject({ name: "Falcon", kind: "team" });
    expect(doc.rows[0].parentId).toBeUndefined();
  });

  it("does not mutate the input document", () => {
    const before = emptyPlan("p");
    addTeam("Falcon")(before);
    expect(before.rows).toHaveLength(0);
  });

  it("inserts a stream directly after its team", () => {
    const { doc, teamId } = seeded();
    expect(doc.rows[1]).toMatchObject({ kind: "stream", parentId: teamId });
  });

  it("creates a task alongside an item row", () => {
    const { doc, itemId } = seeded();
    expect(doc.tasks).toEqual([
      { id: itemId, start: 1000, duration: 5, progress: 0 },
    ]);
  });

  it("produces a document satisfying all invariants", () => {
    expect(checkInvariants(seeded().doc)).toEqual([]);
  });

  it("inserts a second stream after the first team's subtree, not at the end", () => {
    const { doc: seed, teamId } = seeded();
    let doc = addTeam("Otter")(seed);
    doc = addStream(teamId, "Mobile")(doc);
    const names = doc.rows.map((r) => r.name);
    expect(names.indexOf("Mobile")).toBeLessThan(names.indexOf("Otter"));
    expect(checkInvariants(doc)).toEqual([]);
  });
});

describe("edit mutations", () => {
  it("renames a row", () => {
    const { doc, teamId } = seeded();
    expect(renameRow(teamId, "Renamed")(doc).rows[0].name).toBe("Renamed");
  });

  it("sets a colour as a hex string", () => {
    const { doc, teamId } = seeded();
    expect(setRowColor(teamId, "#ff0000")(doc).rows[0].color).toBe("#ff0000");
  });

  it("patches a task without touching its id", () => {
    const { doc, itemId } = seeded();
    const next = updateTask(itemId, { progress: 60, duration: 9 })(doc);
    expect(next.tasks[0]).toMatchObject({
      id: itemId,
      progress: 60,
      duration: 9,
      start: 1000,
    });
  });
});

describe("removeRow", () => {
  it("cascades to descendants and their tasks", () => {
    const { doc, teamId } = seeded();
    const next = removeRow(teamId)(doc);
    expect(next.rows).toHaveLength(0);
    expect(next.tasks).toHaveLength(0);
  });

  it("removes only the targeted subtree", () => {
    const { doc: seed, streamId } = seeded();
    const doc = addItem(streamId, "Second", 2000, 3)(seed);
    const next = removeRow(doc.rows[2].id)(doc);
    expect(next.rows.map((r) => r.name)).toEqual([
      "Falcon",
      "Payments",
      "Second",
    ]);
  });

  it("strips links pointing at removed tasks", () => {
    const { doc: seed, streamId, itemId } = seeded();
    let doc = addItem(streamId, "Second", 2000, 3)(seed);
    const secondId = doc.rows[3].id;
    doc = updateTask(secondId, { linkTo: [itemId] })(doc);
    const next = removeRow(itemId)(doc);
    expect(next.tasks.find((t) => t.id === secondId)?.linkTo).toEqual([]);
    expect(checkInvariants(next)).toEqual([]);
  });
});

describe("moveRow", () => {
  it("reorders siblings and keeps invariants", () => {
    const { doc: seed, teamId } = seeded();
    const doc = addStream(teamId, "Mobile")(seed);
    const mobileId = doc.rows[3].id;
    const next = moveRow(mobileId, 1)(doc);
    expect(next.rows[1].name).toBe("Mobile");
    expect(checkInvariants(next)).toEqual([]);
  });
});

describe("setDurationUnit", () => {
  const withTask = (duration: number, excludeWeekends = true) => {
    const base = emptyPlan("p");
    return {
      ...base,
      calendar: { ...base.calendar, excludeWeekends },
      rows: [{ id: "a", name: "Item", kind: "item" as const }],
      tasks: [{ id: "a", start: 0, duration }],
    };
  };

  it("records the new unit", () => {
    expect(setDurationUnit("week")(emptyPlan("p")).calendar.durationUnit).toBe(
      "week",
    );
  });

  it("counts a week as five days while weekends are excluded", () => {
    // A duration in days means working days, so a two-week sprint reads as 10,
    // not 14. Dividing by seven is what made a ten-day task show as 1.43.
    expect(setDurationUnit("week")(withTask(10)).tasks[0].duration).toBe(2);
    expect(setDurationUnit("week")(withTask(5)).tasks[0].duration).toBe(1);
  });

  it("counts a week as seven days when the calendar includes weekends", () => {
    expect(setDurationUnit("week")(withTask(14, false)).tasks[0].duration).toBe(
      2,
    );
  });

  it("converts back without losing the span", () => {
    const weeks = setDurationUnit("week")(withTask(10));
    expect(setDurationUnit("day")(weeks).tasks[0].duration).toBe(10);
  });

  it("keeps a fractional result rather than rounding the plan out of shape", () => {
    // Seven working days is a week and two days over.
    expect(setDurationUnit("week")(withTask(7)).tasks[0].duration).toBe(1.4);
  });

  it("survives a round trip without eroding the duration", () => {
    const weeks = setDurationUnit("week")(withTask(7));
    expect(setDurationUnit("day")(weeks).tasks[0].duration).toBe(7);
  });

  it("snaps to a whole number when the conversion lands on one", () => {
    expect(
      setDurationUnit("day")(setDurationUnit("week")(withTask(21))).tasks[0]
        .duration,
    ).toBe(21);
  });

  it("leaves a milestone at zero", () => {
    expect(setDurationUnit("week")(withTask(0)).tasks[0].duration).toBe(0);
  });

  it("is a no-op when the unit is unchanged, so durations never drift", () => {
    const doc = withTask(5);
    expect(setDurationUnit("day")(doc)).toBe(doc);
  });
});
