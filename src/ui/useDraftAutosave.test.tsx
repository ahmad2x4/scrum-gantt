import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDraftAutosave } from "./useDraftAutosave";
import { createStore } from "../core/store";
import { emptyPlan } from "../core/schema";
import { addTeam } from "../core/mutations";
import { loadDraft } from "../storage/localDraft";

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("useDraftAutosave", () => {
  it("writes a draft after the debounce elapses", () => {
    const store = createStore(emptyPlan("p"));
    renderHook(() => useDraftAutosave(store, "file-1", 1000));
    act(() => {
      store.apply(addTeam("Falcon"));
    });
    expect(loadDraft()).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(loadDraft()?.doc.rows).toHaveLength(1);
    expect(loadDraft()?.fileId).toBe("file-1");
  });

  it("writes only once for a burst of edits", () => {
    const store = createStore(emptyPlan("p"));
    renderHook(() => useDraftAutosave(store, null, 1000));
    act(() => {
      store.apply(addTeam("A"));
      store.apply(addTeam("B"));
      store.apply(addTeam("C"));
      vi.advanceTimersByTime(1000);
    });
    expect(loadDraft()?.doc.rows).toHaveLength(3);
  });

  it("does not write a draft when nothing changed", () => {
    const store = createStore(emptyPlan("p"));
    renderHook(() => useDraftAutosave(store, null, 1000));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(loadDraft()).toBeNull();
  });

  it("records the file id the plan was last associated with", () => {
    const store = createStore(emptyPlan("p"));
    const { rerender } = renderHook(
      ({ id }) => useDraftAutosave(store, id, 1000),
      {
        initialProps: { id: null as string | null },
      },
    );
    rerender({ id: "file-9" });
    act(() => {
      store.apply(addTeam("Falcon"));
      vi.advanceTimersByTime(1000);
    });
    expect(loadDraft()?.fileId).toBe("file-9");
  });

  it("does not rewrite the draft after the plan is saved", () => {
    const store = createStore(emptyPlan("p"));
    renderHook(() => useDraftAutosave(store, "file-1", 1000));
    act(() => {
      store.apply(addTeam("Falcon"));
      vi.advanceTimersByTime(1000);
    });
    expect(loadDraft()).not.toBeNull();
    localStorage.clear();
    // markSaved notifies subscribers; the draft must not come back.
    act(() => {
      store.markSaved();
      vi.advanceTimersByTime(1000);
    });
    expect(loadDraft()).toBeNull();
  });

  it("does not write a draft for a change the user did not make", () => {
    const store = createStore(emptyPlan("p"));
    renderHook(() => useDraftAutosave(store, null, 1000));
    act(() => {
      // The chart normalising values it was given is not an unsaved edit.
      store.apply(addTeam("Falcon"), { dirty: false });
      vi.advanceTimersByTime(1000);
    });
    expect(loadDraft()).toBeNull();
  });

  it("does not write after unmount", () => {
    const store = createStore(emptyPlan("p"));
    const { unmount } = renderHook(() => useDraftAutosave(store, null, 1000));
    act(() => {
      store.apply(addTeam("Falcon"));
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(loadDraft()).toBeNull();
  });
});
