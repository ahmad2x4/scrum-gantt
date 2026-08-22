import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnitSelect } from "./UnitSelect";
import { createStore } from "../core/store";
import { emptyPlan } from "../core/schema";

const planWithTask = (duration: number) => ({
  ...emptyPlan("p"),
  rows: [{ id: "a", name: "Item", kind: "item" as const }],
  tasks: [{ id: "a", start: 0, duration }],
});

describe("UnitSelect", () => {
  it("marks the plan's current unit", () => {
    render(<UnitSelect store={createStore(emptyPlan("p"))} />);
    expect(screen.getByRole("button", { name: "1d" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("switches the unit", async () => {
    const store = createStore(emptyPlan("p"));
    render(<UnitSelect store={store} />);
    await userEvent.click(screen.getByRole("button", { name: "1w" }));
    expect(store.get().calendar.durationUnit).toBe("week");
  });

  it("converts durations so the plan keeps its real span", async () => {
    // Ten working days, which is two working weeks — a fortnightly sprint.
    const store = createStore(planWithTask(10));
    render(<UnitSelect store={store} />);
    await userEvent.click(screen.getByRole("button", { name: "1w" }));
    expect(store.get().tasks[0].duration).toBe(2);
  });

  it("reflects the change back in the control", async () => {
    const store = createStore(emptyPlan("p"));
    render(<UnitSelect store={store} />);
    await userEvent.click(screen.getByRole("button", { name: "1w" }));
    expect(screen.getByRole("button", { name: "1w" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("does not mark the plan dirty when the unit is already selected", async () => {
    const store = createStore(emptyPlan("p"));
    render(<UnitSelect store={store} />);
    await userEvent.click(screen.getByRole("button", { name: "1d" }));
    expect(store.isDirty()).toBe(false);
  });
});
