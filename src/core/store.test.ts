import { describe, it, expect, vi } from "vitest";
import { createStore } from "./store";
import { emptyPlan } from "./schema";
import { addTeam, renameRow } from "./mutations";

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
