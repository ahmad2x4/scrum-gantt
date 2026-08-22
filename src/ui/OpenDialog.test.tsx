import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OpenDialog } from "./OpenDialog";

const plans = [
  { id: "f1", name: "FY26 Roadmap", modifiedTime: "2026-08-20T10:00:00Z" },
  { id: "f2", name: "Payments only", modifiedTime: "2026-08-18T09:00:00Z" },
];
const props = (over = {}) => ({
  plans,
  loading: false,
  onOpen: vi.fn(),
  onBrowseDrive: vi.fn(),
  onClose: vi.fn(),
  ...over,
});

describe("OpenDialog", () => {
  it("lists the user's plans", () => {
    render(<OpenDialog {...props()} />);
    expect(screen.getByText("FY26 Roadmap")).toBeInTheDocument();
    expect(screen.getByText("Payments only")).toBeInTheDocument();
  });

  it("opens the clicked plan", async () => {
    const onOpen = vi.fn();
    render(<OpenDialog {...props({ onOpen })} />);
    await userEvent.click(screen.getByText("FY26 Roadmap"));
    expect(onOpen).toHaveBeenCalledWith("f1");
  });

  it("shows a loading state instead of the list", () => {
    render(<OpenDialog {...props({ loading: true, plans: [] })} />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("explains the empty case", () => {
    render(<OpenDialog {...props({ plans: [] })} />);
    expect(screen.getByText(/no plans yet/i)).toBeInTheDocument();
  });

  it("offers Browse Drive for plans shared by colleagues", async () => {
    const onBrowseDrive = vi.fn();
    render(<OpenDialog {...props({ onBrowseDrive })} />);
    await userEvent.click(
      screen.getByRole("button", { name: /browse drive/i }),
    );
    expect(onBrowseDrive).toHaveBeenCalledOnce();
  });

  it("keeps Browse Drive available while loading", () => {
    render(<OpenDialog {...props({ loading: true, plans: [] })} />);
    expect(screen.getByRole("button", { name: /browse drive/i })).toBeEnabled();
  });

  it("cancels without opening anything", async () => {
    const onClose = vi.fn();
    const onOpen = vi.fn();
    render(<OpenDialog {...props({ onClose, onOpen })} />);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
  });
});
