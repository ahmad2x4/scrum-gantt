import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "./Dialog";

const renderDialog = (over: { onClose?: () => void } = {}) =>
  render(
    <Dialog title="Open plan" onClose={over.onClose ?? vi.fn()}>
      <button>Inside</button>
    </Dialog>,
  );

describe("Dialog", () => {
  it("is announced as a modal labelled by its heading", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog", { name: "Open plan" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes when the backdrop is clicked", async () => {
    const onClose = vi.fn();
    const { container } = renderDialog({ onClose });
    await userEvent.click(container.querySelector(".dialog-backdrop")!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not close when the panel itself is clicked", async () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    await userEvent.click(screen.getByText("Inside"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("moves focus into the dialog on open", () => {
    renderDialog();
    expect(screen.getByRole("dialog")).toContainElement(
      document.activeElement as HTMLElement,
    );
  });
});
