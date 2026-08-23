import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnlockDialog } from "./UnlockDialog";

const setup = (onUnlock = vi.fn(), onClose = vi.fn()) => {
  render(
    <UnlockDialog
      planName="Q3 Baseline"
      onUnlock={onUnlock}
      onClose={onClose}
    />,
  );
  return { onUnlock, onClose };
};

const field = () => screen.getByRole("textbox", { name: /plan name/i });
const unlockButton = () => screen.getByRole("button", { name: /^unlock$/i });

describe("UnlockDialog", () => {
  it("starts with unlocking disabled", () => {
    setup();
    expect(unlockButton()).toBeDisabled();
  });

  it("keeps it disabled while the name is wrong", async () => {
    setup();
    await userEvent.type(field(), "Q3 Baselin");
    expect(unlockButton()).toBeDisabled();
  });

  it("is case sensitive, so the name has to be read not guessed", async () => {
    setup();
    await userEvent.type(field(), "q3 baseline");
    expect(unlockButton()).toBeDisabled();
  });

  it("enables unlocking once the exact name is typed", async () => {
    setup();
    await userEvent.type(field(), "Q3 Baseline");
    expect(unlockButton()).toBeEnabled();
  });

  it("ignores surrounding whitespace, which is a typing artefact", async () => {
    setup();
    await userEvent.type(field(), "  Q3 Baseline  ");
    expect(unlockButton()).toBeEnabled();
  });

  it("does not unlock on the first step alone", async () => {
    const { onUnlock } = setup();
    await userEvent.type(field(), "Q3 Baseline");
    await userEvent.click(unlockButton());
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it("asks a second time before unlocking", async () => {
    const { onUnlock } = setup();
    await userEvent.type(field(), "Q3 Baseline");
    await userEvent.click(unlockButton());
    await userEvent.click(screen.getByRole("button", { name: /yes, unlock/i }));
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it("leaves the plan locked if the second step is declined", async () => {
    const { onUnlock, onClose } = setup();
    await userEvent.type(field(), "Q3 Baseline");
    await userEvent.click(unlockButton());
    await userEvent.click(screen.getByRole("button", { name: /keep locked/i }));
    expect(onUnlock).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("names the plan being unlocked, so the wrong one is noticeable", async () => {
    setup();
    await userEvent.type(field(), "Q3 Baseline");
    await userEvent.click(unlockButton());
    expect(screen.getByText(/Q3 Baseline/)).toBeInTheDocument();
  });
});
