import type { Store } from "../core/store";
import type { Row } from "../core/types";
import { usePlan } from "./useStore";
import { StructureRow } from "./StructureRow";
import {
  addTeam,
  addStream,
  addItem,
  renameRow,
  setRowColor,
  removeRow,
  moveRow,
} from "../core/mutations";

const DEPTH: Record<Row["kind"], number> = { team: 0, stream: 1, item: 2 };
const DEFAULT_ITEM_DAYS = 5;

export function StructurePanel({ store }: { store: Store }) {
  const plan = usePlan(store);
  const locked = plan.locked === true;

  return (
    <aside className="structure-panel">
      <h2>Structure</h2>
      {locked && (
        <p className="locked-note">
          🔒 Locked baseline — unlock in the toolbar to edit.
        </p>
      )}
      <div className="rows">
        {plan.rows.map((row, index) => (
          <div key={row.id} className="structure-group">
            <StructureRow
              row={row}
              depth={DEPTH[row.kind]}
              locked={locked}
              onRename={(name) => store.apply(renameRow(row.id, name))}
              onColor={(hex) => store.apply(setRowColor(row.id, hex))}
              onDelete={() => store.apply(removeRow(row.id))}
              onMoveUp={() =>
                store.apply(moveRow(row.id, Math.max(0, index - 1)))
              }
            />
            {row.kind === "team" && (
              <button
                className="add-child"
                aria-label={`Add stream to ${row.name}`}
                disabled={locked}
                onClick={() => store.apply(addStream(row.id, "New stream"))}
              >
                + stream
              </button>
            )}
            {row.kind === "stream" && (
              <button
                className="add-child"
                aria-label={`Add item to ${row.name}`}
                disabled={locked}
                onClick={() =>
                  store.apply(
                    addItem(row.id, "New item", Date.now(), DEFAULT_ITEM_DAYS),
                  )
                }
              >
                + item
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        className="add-team"
        disabled={locked}
        onClick={() => store.apply(addTeam("New team"))}
      >
        + Add team
      </button>
    </aside>
  );
}
