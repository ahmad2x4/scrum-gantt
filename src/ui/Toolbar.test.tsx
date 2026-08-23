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
  it("wires Fit", async () => {
    const spy = vi.fn();
    render(<Toolbar {...props(createStore(emptyPlan("p")), { onFit: spy })} />);
    await userEvent.click(screen.getByRole("button", { name: /fit/i }));
    expect(spy).toHaveBeenCalledOnce();
  });

  it("offers no zoom step buttons, since the ruler drag and pinch cover that", () => {
    render(<Toolbar {...props(createStore(emptyPlan("p")))} />);
    expect(
      screen.queryByRole("button", { name: /zoom in/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /zoom out/i }),
    ).not.toBeInTheDocument();
  });
});

describe("lock", () => {
  const lockedStore = () =>
    createStore({ ...emptyPlan("Baseline"), locked: true });

  it("offers to lock an unlocked plan", () => {
    render(<Toolbar {...props(createStore(emptyPlan("p")))} />);
    expect(screen.getByRole("button", { name: /lock plan/i })).toBeEnabled();
  });

  it("locks the plan on click, with no confirmation to get in the way", async () => {
    const store = createStore(emptyPlan("p"));
    render(<Toolbar {...props(store)} />);
    await userEvent.click(screen.getByRole("button", { name: /lock plan/i }));
    expect(store.get().locked).toBe(true);
  });

  it("shows the plan as locked once it is", () => {
    render(<Toolbar {...props(lockedStore())} />);
    expect(
      screen.getByRole("button", { name: /unlock plan/i }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("asks the caller to unlock rather than doing it directly", async () => {
    const onUnlock = vi.fn();
    const store = lockedStore();
    render(<Toolbar {...props(store, { onUnlock })} />);
    await userEvent.click(screen.getByRole("button", { name: /unlock plan/i }));
    expect(onUnlock).toHaveBeenCalled();
    expect(store.get().locked).toBe(true);
  });

  it("disables the duration unit buttons while locked", () => {
    render(<Toolbar {...props(lockedStore())} />);
    expect(screen.getByRole("button", { name: "1d" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "1w" })).toBeDisabled();
  });

  it("leaves saving, opening and framing available while locked", () => {
    render(<Toolbar {...props(lockedStore())} />);
    for (const name of [/^open$/i, /^save$/i, /save as/i, /history/i, /fit/i]) {
      expect(screen.getByRole("button", { name })).toBeEnabled();
    }
  });
});
