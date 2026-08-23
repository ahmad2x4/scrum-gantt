import { useRef, useState } from "react";
import { Dialog } from "./Dialog";

export interface UnlockDialogProps {
  planName: string;
  onUnlock(): void;
  onClose(): void;
}

/**
 * Unlocking in two steps.
 *
 * Repeated identical confirmations do not work: people learn to click through
 * them without reading, so three clicks end up weaker than one deliberate act.
 * Typing the plan's own name cannot be done reflexively, and it forces the user
 * to notice which plan they are about to reopen.
 */
export function UnlockDialog({
  planName,
  onUnlock,
  onClose,
}: UnlockDialogProps) {
  const [typed, setTyped] = useState("");
  const [confirming, setConfirming] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Case sensitive: matching loosely would let the name be guessed at rather
  // than read. Trimmed, because leading and trailing spaces are a typing
  // artefact and never what the user meant.
  const matches = typed.trim() === planName;

  if (confirming) {
    return (
      <Dialog
        title="Unlock this plan?"
        onClose={onClose}
        footer={
          <>
            <button type="button" className="danger" onClick={onUnlock}>
              Yes, unlock
            </button>
            <button type="button" onClick={onClose}>
              Keep locked
            </button>
          </>
        }
      >
        <p>
          <strong>{planName}</strong> will become editable again, and its agreed
          dates can be changed by anything that touches the plan.
        </p>
      </Dialog>
    );
  }

  return (
    <Dialog
      title="Unlock plan"
      onClose={onClose}
      initialFocus={input}
      footer={
        <>
          <button type="submit" form="unlock-form" disabled={!matches}>
            Unlock
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <p>
        This plan is locked as an agreed baseline. To unlock it, type its name
        exactly: <strong>{planName}</strong>
      </p>
      <form
        id="unlock-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (matches) setConfirming(true);
        }}
      >
        <label className="field">
          <span>Plan name</span>
          <input
            ref={input}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
          />
        </label>
      </form>
    </Dialog>
  );
}
