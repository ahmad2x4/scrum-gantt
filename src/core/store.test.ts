import { describe, it, expect, vi } from "vitest";
import { createStore } from "./store";
import { emptyPlan } from "./schema";
import { addTeam, renameRow } from "./mutations";
import type { Mutation } from "./mutations";
import type { PlanDocument } from "./types";

describe("createStore", () => {
  it("exposes the initial document and starts clean", () => {
    const doc = emptyPlan("p");
    const store = createStore(doc);
    expect(store.get()).toEqual(doc);
    expect(store.isDirty()).toBe(false);
  });

  it("applies a mutation, notifies subscribers and becomes dirty", () => {
    const store = createStore(emptyPlan("p"));
    const listener = vi.fn();
    store.subscribe(listener);
    store.apply(addTeam("Falcon"));
    expect(store.get().rows).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.isDirty()).toBe(true);
  });

  it("ignores a mutation that produces an equal document", () => {
    const store = createStore(addTeam("Falcon")(emptyPlan("p")));
    const id = store.get().rows[0].id;
    const listener = vi.fn();
    store.subscribe(listener);
    store.apply(renameRow(id, "Falcon"));
    expect(listener).not.toHaveBeenCalled();
    expect(store.isDirty()).toBe(false);
  });

  it("returns a stable reference when nothing changed", () => {
    const store = createStore(emptyPlan("p"));
    const before = store.get();
    store.apply((d) => ({ ...d }));
    expect(store.get()).toBe(before);
  });

  it("stops notifying after unsubscribe", () => {
    const store = createStore(emptyPlan("p"));
    const listener = vi.fn();
    store.subscribe(listener)();
    store.apply(addTeam("Falcon"));
    expect(listener).not.toHaveBeenCalled();
  });

  it("replace swaps the document and clears dirty", () => {
    const store = createStore(emptyPlan("p"));
    store.apply(addTeam("Falcon"));
    const loaded = emptyPlan("loaded");
    store.replace(loaded);
    expect(store.get()).toEqual(loaded);
    expect(store.isDirty()).toBe(false);
  });

  it("markSaved clears dirty without changing the document", () => {
    const store = createStore(emptyPlan("p"));
    store.apply(addTeam("Falcon"));
    const doc = store.get();
    store.markSaved();
    expect(store.isDirty()).toBe(false);
    expect(store.get()).toBe(doc);
  });
});

describe("non-dirtying apply", () => {
  it("updates the document without marking it dirty", () => {
    const store = createStore(emptyPlan("p"));
    store.apply(addTeam("Falcon"), { dirty: false });
    expect(store.get().rows).toHaveLength(1);
    expect(store.isDirty()).toBe(false);
  });

  it("still notifies subscribers", () => {
    const store = createStore(emptyPlan("p"));
    const listener = vi.fn();
    store.subscribe(listener);
    store.apply(addTeam("Falcon"), { dirty: false });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not clear a dirty flag set earlier", () => {
    const store = createStore(emptyPlan("p"));
    store.apply(addTeam("Falcon"));
    store.apply(addTeam("Otter"), { dirty: false });
    expect(store.isDirty()).toBe(true);
  });
});

describe("markDirty", () => {
  it("flags an unsaved edit without changing the document", () => {
    const store = createStore(emptyPlan("p"));
    const before = store.get();
    store.markDirty();
    expect(store.isDirty()).toBe(true);
    expect(store.get()).toBe(before);
  });

  it("notifies subscribers", () => {
    const store = createStore(emptyPlan("p"));
    const seen = vi.fn();
    store.subscribe(seen);
    store.markDirty();
    expect(seen).toHaveBeenCalledOnce();
  });

  it("does not notify when the document is already dirty", () => {
    const store = createStore(emptyPlan("p"));
    store.markDirty();
    const seen = vi.fn();
    store.subscribe(seen);
    store.markDirty();
    expect(seen).not.toHaveBeenCalled();
  });
});

describe("lock gate", () => {
  const locked = (): PlanDocument => ({ ...emptyPlan("p"), locked: true });
  const rename =
    (name: string): Mutation =>
    (doc) => ({ ...doc, name });

  it("refuses an edit while the plan is locked", () => {
    const store = createStore(locked());
    store.apply(rename("changed"));
    expect(store.get().name).toBe("p");
  });

  it("does not notify subscribers when it refuses", () => {
    // A refusal that notified would re-render and re-project for nothing, and
    // the chart would be handed the same data it already has.
    const store = createStore(locked());
    let calls = 0;
    store.subscribe(() => calls++);
    store.apply(rename("changed"));
    expect(calls).toBe(0);
  });

  it("does not mark the plan dirty when it refuses", () => {
    const store = createStore(locked());
    store.apply(rename("changed"));
    expect(store.isDirty()).toBe(false);
  });

  it("lets a caller opt out, which is how the plan gets unlocked", () => {
    const store = createStore(locked());
    store.apply((doc) => ({ ...doc, locked: false }), { allowLocked: true });
    expect(store.get().locked).toBe(false);
  });

  it("applies normally once unlocked", () => {
    const store = createStore(locked());
    store.apply((doc) => ({ ...doc, locked: false }), { allowLocked: true });
    store.apply(rename("changed"));
    expect(store.get().name).toBe("changed");
  });

  it("still allows replace, so opening and restoring keep working", () => {
    const store = createStore(locked());
    store.replace({ ...emptyPlan("other"), locked: true });
    expect(store.get().name).toBe("other");
  });

  it("leaves an unlocked plan entirely alone", () => {
    const store = createStore(emptyPlan("p"));
    store.apply(rename("changed"));
    expect(store.get().name).toBe("changed");
  });
});
