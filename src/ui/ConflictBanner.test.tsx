import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConflictBanner } from "./ConflictBanner";

describe("ConflictBanner", () => {
  it("announces the conflict assertively", () => {
    render(<ConflictBanner onChoose={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/changed elsewhere/i);
  });

  it.each([
    [/reload/i, "reload"],
    [/copy/i, "copy"],
    [/overwrite/i, "overwrite"],
  ])("offers %s", async (label, choice) => {
    const onChoose = vi.fn();
    render(<ConflictBanner onChoose={onChoose} />);
    await userEvent.click(screen.getByRole("button", { name: label }));
    expect(onChoose).toHaveBeenCalledWith(choice);
  });
});
