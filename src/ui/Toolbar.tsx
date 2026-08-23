import type { Store } from "../core/store";
import { usePlan, useDirty } from "./useStore";
import { setLocked } from "../core/mutations";
import { UnitSelect } from "./UnitSelect";

export interface ToolbarProps {
  store: Store;
  onOpen(): void;
  onSave(): void;
  onSaveAs(): void;
  onHistory(): void;
  onFit(): void;
  /** Locking is immediate; unlocking is the caller's two-step flow. */
  onUnlock?(): void;
  onTogglePanel(): void;
  panelCollapsed: boolean;
  saving: boolean;
}

export function Toolbar({
  store,
  onOpen,
  onSave,
  onSaveAs,
  onHistory,
  onFit,
  onUnlock,
  onTogglePanel,
  panelCollapsed,
  saving,
}: ToolbarProps) {
  const plan = usePlan(store);
  const dirty = useDirty(store);
  const locked = plan.locked === true;

  return (
    <header className="toolbar">
      <button
        className="panel-toggle"
        onClick={onTogglePanel}
        aria-expanded={!panelCollapsed}
        aria-label={
          panelCollapsed ? "Show structure panel" : "Hide structure panel"
        }
        title={panelCollapsed ? "Show structure panel" : "Hide structure panel"}
      >
        {panelCollapsed ? "»" : "«"}
      </button>
      <span className="plan-name">{plan.name}</span>
      <button
        className={locked ? "lock on" : "lock"}
        aria-pressed={locked}
        aria-label={locked ? "Unlock plan" : "Lock plan"}
        title={
          locked
            ? "This plan is locked as a baseline"
            : "Lock this plan as an agreed baseline"
        }
        onClick={() =>
          locked
            ? onUnlock?.()
            : // Locking needs no confirmation: it is safe and reversible, and
              // gating it would only be friction. allowLocked is not needed
              // here because the plan is unlocked at this point.
              store.apply(setLocked(true))
        }
      >
        {locked ? "🔒" : "🔓"}
      </button>
      {dirty && (
        <span
          data-testid="dirty-dot"
          className="dirty-dot"
          title="Unsaved changes"
          aria-label="Unsaved changes"
        >
          ●
        </span>
      )}
      <span className="spacer" />
      <UnitSelect store={store} />
      <div className="zoom-group" role="group" aria-label="Zoom">
        <button onClick={onFit} title="Show the whole plan">
          Fit
        </button>
      </div>
      <button onClick={onOpen}>Open</button>
      <button onClick={onSave} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
      <button onClick={onSaveAs} disabled={saving}>
        Save as…
      </button>
      <button onClick={onHistory}>History</button>
    </header>
  );
}
