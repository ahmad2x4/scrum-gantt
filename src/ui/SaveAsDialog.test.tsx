import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SaveAsDialog } from "./SaveAsDialog";

const props = (over = {}) => ({
  initialName: "FY26 Roadmap",
  onConfirm: vi.fn(),
  onClose: vi.fn(),
  ...over,
});

describe("SaveAsDialog", () => {
  it("prefills the current plan name", () => {
    render(<SaveAsDialog {...props()} />);
    expect(screen.getByRole("textbox", { name: /plan name/i })).toHaveValue(
      "FY26 Roadmap",
    );
  });

  it("focuses the name field so typing works immediately", () => {
    render(<SaveAsDialog {...props()} />);
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: /plan name/i }),
    );
  });

  it("selects the existing name so typing replaces it", () => {
    render(<SaveAsDialog {...props()} />);
    const input = screen.getByRole("textbox", {
      name: /plan name/i,
    }) as HTMLInputElement;
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("FY26 Roadmap".length);
  });

  it("confirms the typed name", async () => {
    const onConfirm = vi.fn();
    render(<SaveAsDialog {...props({ onConfirm })} />);
    await userEvent.clear(screen.getByRole("textbox", { name: /plan name/i }));
    await userEvent.type(
      screen.getByRole("textbox", { name: /plan name/i }),
      "Payments only",
    );
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onConfirm).toHaveBeenCalledWith("Payments only");
  });

  it("submits on Enter", async () => {
    const onConfirm = vi.fn();
    render(<SaveAsDialog {...props({ onConfirm })} />);
    await userEvent.keyboard("{Enter}");
    expect(onConfirm).toHaveBeenCalledWith("FY26 Roadmap");
  });

  it("trims surrounding whitespace", async () => {
    const onConfirm = vi.fn();
    render(
      <SaveAsDialog {...props({ initialName: "  Spaced  ", onConfirm })} />,
    );
    await userEvent.keyboard("{Enter}");
    expect(onConfirm).toHaveBeenCalledWith("Spaced");
  });

  it("refuses an empty name rather than creating an unnamed file", async () => {
    const onConfirm = vi.fn();
    render(<SaveAsDialog {...props({ onConfirm })} />);
    await userEvent.clear(screen.getByRole("textbox", { name: /plan name/i }));
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
    await userEvent.keyboard("{Enter}");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("treats a whitespace-only name as empty", async () => {
    const onConfirm = vi.fn();
    render(<SaveAsDialog {...props({ initialName: "   ", onConfirm })} />);
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
    await userEvent.keyboard("{Enter}");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("cancels without confirming", async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(<SaveAsDialog {...props({ onClose, onConfirm })} />);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
