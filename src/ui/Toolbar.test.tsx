import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toolbar } from "./Toolbar";
import { createStore } from "../core/store";
import { emptyPlan } from "../core/schema";
import { addTeam } from "../core/mutations";

const noop = () => {};
const props = (store: ReturnType<typeof createStore>, over = {}) => ({
  store,
  onOpen: noop,
  onSave: noop,
  onSaveAs: noop,
  onHistory: noop,
  onFit: noop,
  onZoomIn: noop,
  onZoomOut: noop,
  onTogglePanel: noop,
  panelCollapsed: false,
  saving: false,
  ...over,
});

describe("Toolbar", () => {
  it("shows the plan name", () => {
    render(<Toolbar {...props(createStore(emptyPlan("FY26 Roadmap")))} />);
    expect(screen.getByText("FY26 Roadmap")).toBeInTheDocument();
  });

  it("hides the unsaved marker when the store is clean", () => {
    render(<Toolbar {...props(createStore(emptyPlan("p")))} />);
    expect(screen.queryByTestId("dirty-dot")).not.toBeInTheDocument();
  });

  it("shows the unsaved marker after an edit", async () => {
    const store = createStore(emptyPlan("p"));
    render(<Toolbar {...props(store)} />);
    act(() => {
      store.apply(addTeam("Falcon"));
    });
    expect(await screen.findByTestId("dirty-dot")).toBeInTheDocument();
  });

  it("calls onSave when Save is clicked", async () => {
    const onSave = vi.fn();
    render(<Toolbar {...props(createStore(emptyPlan("p")), { onSave })} />);
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("disables Save while a save is in flight", () => {
    render(
      <Toolbar {...props(createStore(emptyPlan("p")), { saving: true })} />,
    );
    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
  });

  it("calls onOpen and onHistory", async () => {
    const onOpen = vi.fn();
    const onHistory = vi.fn();
    render(
      <Toolbar
        {...props(createStore(emptyPlan("p")), { onOpen, onHistory })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /open/i }));
    await userEvent.click(screen.getByRole("button", { name: /history/i }));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onHistory).toHaveBeenCalledOnce();
  });

  it("toggles the structure panel", async () => {
    const onTogglePanel = vi.fn();
    render(
      <Toolbar {...props(createStore(emptyPlan("p")), { onTogglePanel })} />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /hide structure panel/i }),
    );
    expect(onTogglePanel).toHaveBeenCalledOnce();
  });

  it("offers to show the panel again once collapsed", () => {
    render(
      <Toolbar
        {...props(createStore(emptyPlan("p")), { panelCollapsed: true })}
      />,
    );
    expect(
      screen.getByRole("button", { name: /show structure panel/i }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("reflects a later plan rename without a remount", async () => {
    const store = createStore(emptyPlan("Before"));
    render(<Toolbar {...props(store)} />);
    act(() => {
      store.apply((d) => ({ ...d, name: "After" }));
    });
    expect(await screen.findByText("After")).toBeInTheDocument();
  });
});

describe("zoom controls", () => {
  it.each([
    [/fit/i, "onFit"],
    [/zoom out/i, "onZoomOut"],
    [/zoom in/i, "onZoomIn"],
  ])("wires %s", async (label, prop) => {
    const spy = vi.fn();
    render(
      <Toolbar {...props(createStore(emptyPlan("p")), { [prop]: spy })} />,
    );
    await userEvent.click(screen.getByRole("button", { name: label }));
    expect(spy).toHaveBeenCalledOnce();
  });

  it("groups them so they read as one control", () => {
    render(<Toolbar {...props(createStore(emptyPlan("p")))} />);
    const group = screen.getByRole("group", { name: /zoom/i });
    expect(group).toContainElement(
      screen.getByRole("button", { name: /fit/i }),
    );
  });
});
