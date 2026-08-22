import { useSyncExternalStore } from "react";
import type { Store } from "../core/store";
import type { PlanDocument } from "../core/types";

export function usePlan(store: Store): PlanDocument {
  return useSyncExternalStore(store.subscribe, store.get);
}

export function useDirty(store: Store): boolean {
  return useSyncExternalStore(store.subscribe, store.isDirty);
}
