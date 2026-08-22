import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HistoryDialog } from "./HistoryDialog";

const revisions = [
  { id: "rev-9", modifiedTime: "2026-08-22T14:30:00Z" },
  { id: "rev-8", modifiedTime: "2026-08-21T11:00:00Z" },
];
const props = (over = {}) => ({
  revisions,
  loading: false,
  onRestore: vi.fn(),
  onClose: vi.fn(),
  ...over,
});

describe("HistoryDialog", () => {
  it("lists the restorable saves", () => {
    render(<HistoryDialog {...props()} />);
    expect(screen.getAllByRole("button", { name: /restore/i })).toHaveLength(2);
  });

  it("restores the chosen revision", async () => {
    const onRestore = vi.fn();
    render(<HistoryDialog {...props({ onRestore })} />);
    await userEvent.click(
      screen.getAllByRole("button", { name: /restore/i })[0],
    );
    expect(onRestore).toHaveBeenCalledWith("rev-9");
  });

  it("marks the newest save as current so it is not mistaken for a rollback", () => {
    render(<HistoryDialog {...props()} />);
    expect(screen.getByText(/current/i)).toBeInTheDocument();
  });

  it("states the retention limit so the cap is not a surprise", () => {
    render(<HistoryDialog {...props()} />);
    expect(
      screen.getByText(/last 50 saves are restorable/i),
    ).toBeInTheDocument();
  });

  it("explains the empty case", () => {
    render(<HistoryDialog {...props({ revisions: [] })} />);
    expect(screen.getByText(/no saved history/i)).toBeInTheDocument();
  });

  it("shows a loading state instead of the list", () => {
    render(<HistoryDialog {...props({ loading: true, revisions: [] })} />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});
