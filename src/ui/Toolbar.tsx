import type { Store } from "../core/store";
import { usePlan, useDirty } from "./useStore";

export interface ToolbarProps {
  store: Store;
  onOpen(): void;
  onSave(): void;
  onSaveAs(): void;
  onHistory(): void;
  onTogglePanel(): void;
  onFit(): void;
  panelCollapsed: boolean;
  saving: boolean;
}

export function Toolbar({
  store, onOpen, onSave, onSaveAs, onHistory, onTogglePanel, onFit, panelCollapsed, saving,
}: ToolbarProps) {
  const plan = usePlan(store);
  const dirty = useDirty(store);

  return (
    <header className="toolbar">
      <button
        className="panel-toggle"
        onClick={onTogglePanel}
        aria-expanded={!panelCollapsed}
        aria-label={panelCollapsed ? "Show structure panel" : "Hide structure panel"}
        title={panelCollapsed ? "Show structure panel" : "Hide structure panel"}
      >
        {panelCollapsed ? "»" : "«"}
      </button>
      <span className="plan-name">{plan.name}</span>
      {dirty && (
        <span data-testid="dirty-dot" className="dirty-dot" title="Unsaved changes" aria-label="Unsaved changes">
          ●
        </span>
      )}
      <span className="spacer" />
      <button onClick={onFit} title="Zoom so the whole plan fits">Fit plan</button>
      <button onClick={onOpen}>Open</button>
      <button onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      <button onClick={onSaveAs} disabled={saving}>Save as…</button>
      <button onClick={onHistory}>History</button>
    </header>
  );
}
