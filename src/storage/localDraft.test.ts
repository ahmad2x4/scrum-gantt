import { describe, it, expect, beforeEach } from "vitest";
import { saveDraft, loadDraft, clearDraft, DRAFT_KEY } from "./localDraft";
import { emptyPlan } from "../core/schema";

beforeEach(() => localStorage.clear());

describe("localDraft", () => {
  it("returns null when no draft exists", () => {
    expect(loadDraft()).toBeNull();
  });

  it("round-trips a draft", () => {
    const draft = { doc: emptyPlan("p"), fileId: "abc123", savedAt: "2026-08-22T10:00:00Z" };
    saveDraft(draft);
    expect(loadDraft()).toEqual(draft);
  });

  it("preserves a null fileId for an unsaved plan", () => {
    saveDraft({ doc: emptyPlan("p"), fileId: null, savedAt: "2026-08-22T10:00:00Z" });
    expect(loadDraft()?.fileId).toBeNull();
  });

  it("returns null rather than throwing on malformed JSON", () => {
    localStorage.setItem(DRAFT_KEY, "{not json");
    expect(loadDraft()).toBeNull();
  });

  it("returns null when the stored document fails validation", () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ doc: { schemaVersion: 99 }, fileId: null, savedAt: "x" }),
    );
    expect(loadDraft()).toBeNull();
  });

  it("returns null when the stored draft is not an object", () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify("nope"));
    expect(loadDraft()).toBeNull();
  });

  it("clears a draft", () => {
    saveDraft({ doc: emptyPlan("p"), fileId: null, savedAt: "x" });
    clearDraft();
    expect(loadDraft()).toBeNull();
  });
});
