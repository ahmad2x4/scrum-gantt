import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StructurePanel } from "./StructurePanel";
import { createStore } from "../core/store";
import { emptyPlan } from "../core/schema";
import { addTeam, addStream, addItem } from "../core/mutations";
import { checkInvariants } from "../core/invariants";

function seededStore() {
  let doc = addTeam("Falcon")(emptyPlan("p"));
  const teamId = doc.rows[0].id;
  doc = addStream(teamId, "Payments")(doc);
  doc = addItem(doc.rows[1].id, "Tokenisation", 1000, 5)(doc);
  return createStore(doc);
}

describe("StructurePanel", () => {
  it("renders every row", () => {
    render(<StructurePanel store={seededStore()} />);
    expect(screen.getByText("Falcon")).toBeInTheDocument();
    expect(screen.getByText("Payments")).toBeInTheDocument();
    expect(screen.getByText("Tokenisation")).toBeInTheDocument();
  });

  it("adds a team", async () => {
    const store = createStore(emptyPlan("p"));
    render(<StructurePanel store={store} />);
    await userEvent.click(screen.getByRole("button", { name: /add team/i }));
    expect(store.get().rows).toHaveLength(1);
    expect(store.get().rows[0].kind).toBe("team");
  });

  it("renames a row through the inline editor", async () => {
    const store = seededStore();
    render(<StructurePanel store={store} />);
    await userEvent.click(screen.getByRole("button", { name: /rename falcon/i }));
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed{Enter}");
    expect(store.get().rows[0].name).toBe("Renamed");
  });

  it("keeps the old name when a rename is cancelled with Escape", async () => {
    const store = seededStore();
    render(<StructurePanel store={store} />);
    await userEvent.click(screen.getByRole("button", { name: /rename falcon/i }));
    await userEvent.type(screen.getByRole("textbox"), "Discarded{Escape}");
    expect(store.get().rows[0].name).toBe("Falcon");
  });

  it("cascade-deletes a team with its descendants", async () => {
    const store = seededStore();
    render(<StructurePanel store={store} />);
    await userEvent.click(screen.getByRole("button", { name: /delete falcon/i }));
    expect(store.get().rows).toHaveLength(0);
    expect(store.get().tasks).toHaveLength(0);
  });

  it("adds a stream under its team and keeps the document valid", async () => {
    const store = seededStore();
    render(<StructurePanel store={store} />);
    await userEvent.click(screen.getByRole("button", { name: /add stream to falcon/i }));
    expect(checkInvariants(store.get())).toEqual([]);
    expect(store.get().rows.filter((r) => r.kind === "stream")).toHaveLength(2);
  });

  it("adds an item under its stream with a task, keeping the document valid", async () => {
    const store = seededStore();
    render(<StructurePanel store={store} />);
    await userEvent.click(screen.getByRole("button", { name: /add item to payments/i }));
    expect(checkInvariants(store.get())).toEqual([]);
    expect(store.get().tasks).toHaveLength(2);
  });

  it("indents children below their parent", () => {
    render(<StructurePanel store={seededStore()} />);
    expect(screen.getByText("Tokenisation").closest("[data-depth]")).toHaveAttribute("data-depth", "2");
  });

  it("offers no add-stream control on an item row", () => {
    render(<StructurePanel store={seededStore()} />);
    expect(screen.queryByRole("button", { name: /add stream to tokenisation/i })).not.toBeInTheDocument();
  });

  it("moves a row up and keeps the document valid", async () => {
    const store = seededStore();
    store.apply(addTeam("Otter"));
    render(<StructurePanel store={store} />);
    await userEvent.click(screen.getByRole("button", { name: /move otter up/i }));
    expect(checkInvariants(store.get())).toEqual([]);
  });
});
