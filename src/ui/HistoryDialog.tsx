import {
  MAX_PINNED_REVISIONS,
  type RevisionInfo,
} from "../storage/driveClient";
import { Dialog } from "./Dialog";

export interface HistoryDialogProps {
  revisions: RevisionInfo[];
  loading: boolean;
  onRestore(revisionId: string): void;
  onClose(): void;
}

export function HistoryDialog({
  revisions,
  loading,
  onRestore,
  onClose,
}: HistoryDialogProps) {
  return (
    <Dialog
      title="Save history"
      onClose={onClose}
      footer={<button onClick={onClose}>Close</button>}
    >
      <p className="hint">Last {MAX_PINNED_REVISIONS} saves are restorable.</p>
      {loading ? (
        <p>Loading…</p>
      ) : revisions.length === 0 ? (
        <p>No saved history yet.</p>
      ) : (
        <ul className="revision-list">
          {revisions.map((r, i) => (
            <li key={r.id}>
              <time dateTime={r.modifiedTime}>
                {new Date(r.modifiedTime).toLocaleString()}
              </time>
              {i === 0 && <span className="hint">current</span>}
              <button onClick={() => onRestore(r.id)}>Restore</button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
