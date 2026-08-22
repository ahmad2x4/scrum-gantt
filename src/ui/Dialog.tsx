import { useEffect, useRef, type ReactNode } from "react";

export interface DialogProps {
  title: string;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Modal shell shared by the Open and History dialogs: Escape and a backdrop
 * click both close, and focus moves inside on open so the keyboard is not
 * left behind the overlay.
 */
export function Dialog({ title, onClose, children, footer }: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    // Prefer the first control; fall back to the panel so focus never stays
    // on whatever was behind the backdrop.
    const first = panel.current?.querySelector<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
    );
    (first ?? panel.current)?.focus();
  }, []);

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
