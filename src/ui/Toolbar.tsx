import type { Store } from "../core/store";
import { usePlan, useDirty } from "./useStore";

export interface ToolbarProps {
  store: Store;
  onOpen(): void;
  onSave(): void;
  onSaveAs(): void;
  onHistory(): void;
  saving: boolean;
}

export function Toolbar({ store, onOpen, onSave, onSaveAs, onHistory, saving }: ToolbarProps) {
  const plan = usePlan(store);
  const dirty = useDirty(store);

  return (
    <header className="toolbar">
      <span className="plan-name">{plan.name}</span>
      {dirty && (
        <span data-testid="dirty-dot" className="dirty-dot" title="Unsaved changes" aria-label="Unsaved changes">
          ●
        </span>
      )}
      <span className="spacer" />
      <button onClick={onOpen}>Open</button>
      <button onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      <button onClick={onSaveAs} disabled={saving}>Save as…</button>
      <button onClick={onHistory}>History</button>
    </header>
  );
}
