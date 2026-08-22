import { describe, it, expect } from "vitest";
import { emptyPlan, validate, SchemaError, CURRENT_SCHEMA_VERSION } from "./schema";

describe("emptyPlan", () => {
  it("produces a valid document at the current schema version", () => {
    const doc = emptyPlan("My Plan");
    expect(doc.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(doc.name).toBe("My Plan");
    expect(doc.rows).toEqual([]);
    expect(doc.tasks).toEqual([]);
    expect(doc.calendar.durationUnit).toBe("day");
    expect(doc.calendar.weekends).toEqual([0, 6]);
  });
});

describe("validate", () => {
  it("accepts a round-tripped document", () => {
    const doc = emptyPlan("Round Trip");
    expect(validate(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });

  it("rejects a non-object", () => {
    expect(() => validate("nope")).toThrow(SchemaError);
  });

  it("rejects a missing schemaVersion", () => {
    expect(() => validate({ name: "x", rows: [], tasks: [] })).toThrow(/schemaVersion/);
  });

  it("refuses a newer schemaVersion by name", () => {
    const doc = { ...emptyPlan("Future"), schemaVersion: 99 };
    expect(() => validate(doc)).toThrow(/newer version/);
  });

  it("rejects an unknown durationUnit", () => {
    const doc = emptyPlan("Bad Unit");
    // @ts-expect-error deliberately invalid
    doc.calendar.durationUnit = "fortnight";
    expect(() => validate(doc)).toThrow(/durationUnit/);
  });

  it("names the offending field so the UI can report it", () => {
    const doc = emptyPlan("Bad Rows");
    // @ts-expect-error deliberately invalid
    doc.rows = "not an array";
    expect(() => validate(doc)).toThrow(/rows/);
  });
});
