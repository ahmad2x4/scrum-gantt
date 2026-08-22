import { useCallback, useState } from "react";

export const PANEL_KEY = "scrum-gantt:panel-collapsed";

/**
 * Per-viewer preference, deliberately not part of PlanDocument: collapsing a
 * panel must not mark the plan unsaved, nor follow the file to a colleague.
 * Storage access is guarded because private windows and blocked site data can
 * throw rather than return null.
 */
export function usePanelCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(PANEL_KEY) === "true";
    } catch {
      return false;
    }
  });

  const toggle = useCallback(() => {
    setCollapsed((previous) => {
      const next = !previous;
      try {
        localStorage.setItem(PANEL_KEY, String(next));
      } catch {
        // Preference is a convenience; failing to persist must not break the UI.
      }
      return next;
    });
  }, []);

  return [collapsed, toggle];
}
