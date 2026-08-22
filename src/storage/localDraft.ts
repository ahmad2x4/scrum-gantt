import type { PlanDocument } from "../core/types";
import { validate } from "../core/schema";

export const DRAFT_KEY = "scrum-gantt:draft";

export interface Draft {
  doc: PlanDocument;
  /** Drive file id, or null while the plan has never been saved. */
  fileId: string | null;
  savedAt: string;
}

export function saveDraft(draft: Draft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Quota exceeded or storage disabled. The draft is a convenience, never
    // the system of record, so failing to write it must not break editing.
  }
}

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft> | null;
    if (typeof parsed !== "object" || parsed === null) return null;
    return {
      doc: validate(parsed.doc),
      fileId: parsed.fileId ?? null,
      savedAt: String(parsed.savedAt),
    };
  } catch {
    // Unreadable storage, malformed JSON, or a document that no longer
    // validates. A bad draft is discarded rather than surfaced.
    return null;
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // See saveDraft.
  }
}
