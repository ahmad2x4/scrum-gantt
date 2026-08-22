import { useEffect, useRef, type ReactNode, type RefObject } from "react";

export interface DialogProps {
  title: string;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  /** Element to focus on open instead of the panel — a text field, never an action. */
  initialFocus?: RefObject<HTMLElement | null>;
}

/**
 * Modal shell shared by the Open and History dialogs: Escape and a backdrop
 * click both close, and focus moves inside on open so the keyboard is not
 * left behind the overlay.
 */
export function Dialog({
  title,
  onClose,
  children,
  footer,
  initialFocus,
}: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    // The panel itself, never a control by default: focusing a button means a
    // stray Enter — from the keystroke that dismissed a sign-in popup, say —
    // fires an action the user never chose. A caller may name a text field,
    // where typing is the expected next move and Enter is safe.
    (initialFocus?.current ?? panel.current)?.focus();
    // Callers pass a stable ref, so this runs once per open.
  }, [initialFocus]);

  return (
    <div
      className="dialog-backdrop"
      // The backdrop closes only on a click that both starts and ends on it,
      // so a drag out of the panel does not dismiss the dialog.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panel}
      >
        <h2>{title}</h2>
        {children}
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}
