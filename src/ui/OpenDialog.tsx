import type { PlanFile } from "../storage/driveClient";
import { Dialog } from "./Dialog";

export interface OpenDialogProps {
  plans: PlanFile[];
  loading: boolean;
  onOpen(fileId: string): void;
  onBrowseDrive(): void;
  onClose(): void;
}

export function OpenDialog({
  plans,
  loading,
  onOpen,
  onBrowseDrive,
  onClose,
}: OpenDialogProps) {
  return (
    <Dialog
      title="Open plan"
      onClose={onClose}
      footer={
        <>
          {/* drive.file cannot see files this app did not create, so a plan a
              colleague shared is only reachable through the Picker. */}
          <button onClick={onBrowseDrive}>Browse Drive…</button>
          <button onClick={onClose}>Cancel</button>
        </>
      }
    >
      {loading ? (
        <p>Loading…</p>
      ) : plans.length === 0 ? (
        <p>
          No plans yet. Save one, or browse Drive for a plan someone shared with
          you.
        </p>
      ) : (
        <ul className="plan-list">
          {plans.map((p) => (
            <li key={p.id}>
              <button onClick={() => onOpen(p.id)}>
                <span className="plan-list-name">{p.name}</span>
                <time dateTime={p.modifiedTime}>
                  {new Date(p.modifiedTime).toLocaleString()}
                </time>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
