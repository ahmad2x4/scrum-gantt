import type { PlanDocument } from "./types";
import type { Mutation } from "./mutations";

export interface ApplyOptions {
  /** Whether the change counts as an unsaved user edit. Defaults to true. */
  dirty?: boolean;
}

export interface Store {
  get(): PlanDocument;
  apply(m: Mutation, options?: ApplyOptions): void;
  replace(doc: PlanDocument): void;
  subscribe(fn: () => void): () => void;
  isDirty(): boolean;
  markSaved(): void;
  /** Flags the current document as an unsaved edit without changing it. */
  markDirty(): void;
}

/**
 * Structural equality via canonical JSON. Documents are small (tens of KB) and
 * this runs only on edits, so the simplicity is worth more than the speed.
 */
function equal(a: PlanDocument, b: PlanDocument): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function createStore(initial: PlanDocument): Store {
  let doc = initial;
  let dirty = false;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((fn) => fn());

  return {
    get: () => doc,

    apply(m, options) {
      const next = m(doc);
      if (equal(doc, next)) return;
      doc = next;
      // Reconciliation (the chart normalising values we just gave it) changes
      // the document without being a user edit, so it must not mark it dirty.
      if (options?.dirty !== false) dirty = true;
      notify();
    },

    replace(next) {
      doc = next;
      dirty = false;
      notify();
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },

    isDirty: () => dirty,

    markSaved() {
      dirty = false;
      notify();
    },

    markDirty() {
      if (dirty) return;
      dirty = true;
      notify();
    },
  };
}
