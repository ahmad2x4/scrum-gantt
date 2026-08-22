import type { PlanDocument } from "./types";
import type { Mutation } from "./mutations";

export interface Store {
  get(): PlanDocument;
  apply(m: Mutation): void;
  replace(doc: PlanDocument): void;
  subscribe(fn: () => void): () => void;
  isDirty(): boolean;
  markSaved(): void;
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

    apply(m) {
      const next = m(doc);
      if (equal(doc, next)) return;
      doc = next;
      dirty = true;
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
  };
}
