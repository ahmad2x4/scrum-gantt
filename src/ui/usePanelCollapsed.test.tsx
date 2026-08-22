import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePanelCollapsed, PANEL_KEY } from "./usePanelCollapsed";

beforeEach(() => localStorage.clear());

describe("usePanelCollapsed", () => {
  it("starts expanded", () => {
    const { result } = renderHook(() => usePanelCollapsed());
    expect(result.current[0]).toBe(false);
  });

  it("toggles and persists", () => {
    const { result } = renderHook(() => usePanelCollapsed());
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem(PANEL_KEY)).toBe("true");
  });

  it("restores a persisted collapse", () => {
    localStorage.setItem(PANEL_KEY, "true");
    expect(renderHook(() => usePanelCollapsed()).result.current[0]).toBe(true);
  });

  it("falls back to expanded when storage holds junk", () => {
    localStorage.setItem(PANEL_KEY, "not-a-bool");
    expect(renderHook(() => usePanelCollapsed()).result.current[0]).toBe(false);
  });
});
