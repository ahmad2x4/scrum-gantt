import type { PlanDocument } from "./types";

export const CURRENT_SCHEMA_VERSION = 1 as const;

export class SchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaError";
  }
}

export function emptyPlan(name: string): PlanDocument {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    name,
    savedAt: new Date().toISOString(),
    calendar: {
      durationUnit: "day",
      weekends: [0, 6],
      excludeWeekends: true,
      holidays: [],
    },
    view: { sidebarWidth: "30%" },
    rows: [],
    tasks: [],
  };
}

/** No migrations exist yet; version 1 is the first schema. */
export function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  return raw;
}

const UNITS = ["day", "week"];

export function validate(raw: unknown): PlanDocument {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new SchemaError("File is not a plan object.");
  }
  const o = raw as Record<string, unknown>;

  if (typeof o.schemaVersion !== "number") {
    throw new SchemaError("Missing or invalid field: schemaVersion.");
  }
  if (o.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new SchemaError(
      "This plan was saved by a newer version of this app.",
    );
  }
  const doc = migrate(o) as Record<string, any>;

  if (typeof doc.name !== "string")
    throw new SchemaError("Missing or invalid field: name.");
  if (!Array.isArray(doc.rows))
    throw new SchemaError("Missing or invalid field: rows.");
  if (!Array.isArray(doc.tasks))
    throw new SchemaError("Missing or invalid field: tasks.");
  if (typeof doc.calendar !== "object" || doc.calendar === null) {
    throw new SchemaError("Missing or invalid field: calendar.");
  }
  if (!UNITS.includes(doc.calendar.durationUnit)) {
    throw new SchemaError(
      `Invalid calendar.durationUnit: expected one of ${UNITS.join(", ")}.`,
    );
  }
  if (doc.locked !== undefined && typeof doc.locked !== "boolean") {
    throw new SchemaError("Invalid field: locked must be true or false.");
  }
  if (typeof doc.view !== "object" || doc.view === null) {
    throw new SchemaError("Missing or invalid field: view.");
  }
  return doc as unknown as PlanDocument;
}
