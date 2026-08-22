import { useEffect, useRef, useState } from "react";
import { Dialog } from "./Dialog";

export interface SaveAsDialogProps {
  initialName: string;
  onConfirm(name: string): void;
  onClose(): void;
}

export function SaveAsDialog({
  initialName,
  onConfirm,
  onClose,
}: SaveAsDialogProps) {
  const [name, setName] = useState(initialName);
  const input = useRef<HTMLInputElement>(null);
  const trimmed = name.trim();

  useEffect(() => {
    // Selected, not just focused: Save as… usually means naming a variant of
    // the plan, so typing should replace the old name rather than append.
    input.current?.select();
  }, []);

  return (
    <Dialog
      title="Save plan as"
      onClose={onClose}
      initialFocus={input}
      footer={
        <>
          <button type="submit" form="save-as-form" disabled={!trimmed}>
            Save
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <form
        id="save-as-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed) onConfirm(trimmed);
        }}
      >
        <label className="field">
          <span>Plan name</span>
          <input
            ref={input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
        </label>
      </form>
    </Dialog>
  );
}
