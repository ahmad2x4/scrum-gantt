import { useEffect, useRef } from "react";
import type { Store } from "../core/store";
import { saveDraft } from "../storage/localDraft";

/**
 * Mirrors every edit to localStorage. This is the safety net that lets every
 * Drive failure degrade to "try again later" rather than data loss.
 */
export function useDraftAutosave(
  store: Store,
  fileId: string | null,
  delayMs = 1000,
): void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read at write time so a re-subscribe is not needed when the plan gains a
  // Drive file id mid-session.
  const currentFileId = useRef(fileId);
  useEffect(() => {
    currentFileId.current = fileId;
  }, [fileId]);

  useEffect(() => {
    const unsubscribe = store.subscribe(() => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        // The draft exists to protect unsaved work. Saving notifies
        // subscribers too, so without this the save's own clearDraft is undone
        // a debounce later and the app always boots from a stale draft.
        if (!store.isDirty()) return;
        saveDraft({
          doc: store.get(),
          fileId: currentFileId.current,
          savedAt: new Date().toISOString(),
        });
      }, delayMs);
    });
    return () => {
      if (timer.current) clearTimeout(timer.current);
      unsubscribe();
    };
  }, [store, delayMs]);
}
