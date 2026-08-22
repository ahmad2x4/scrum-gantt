import { useState } from "react";
import type { Row } from "../core/types";

export interface StructureRowProps {
  row: Row;
  depth: number;
  onRename(name: string): void;
  onColor(hex: string): void;
  onDelete(): void;
  onMoveUp(): void;
}

export function StructureRow({ row, depth, onRename, onColor, onDelete, onMoveUp }: StructureRowProps) {
  const [editing, setEditing] = useState(false);

  const commit = (value: string) => {
    const trimmed = value.trim();
    if (trimmed) onRename(trimmed);
    setEditing(false);
  };

  return (
    <div className="structure-row" data-depth={depth} style={{ paddingLeft: 8 + depth * 16 }}>
      {editing ? (
        <input
          autoFocus
          defaultValue={row.name}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
            // Escape must discard, so blur must not then commit the draft.
            if (e.key === "Escape") {
              e.currentTarget.value = row.name;
              setEditing(false);
            }
          }}
        />
      ) : (
        <span className="row-name" title={row.name}>{row.name}</span>
      )}
      <span className="spacer" />
      <input
        type="color"
        aria-label={`Colour for ${row.name}`}
        value={row.color ?? "#888888"}
        onChange={(e) => onColor(e.target.value)}
      />
      <button aria-label={`Move ${row.name} up`} onClick={onMoveUp}>↑</button>
      <button aria-label={`Rename ${row.name}`} onClick={() => setEditing(true)}>✎</button>
      <button aria-label={`Delete ${row.name}`} onClick={onDelete}>✕</button>
    </div>
  );
}
