import { describe, it, expect } from "vitest";
import { zoomRange, dragZoomFactor, MIN_SPAN } from "./zoom";

const span = (r: { start: number; end: number }) => r.end - r.start;

describe("zoomRange", () => {
  it("widens the window when zooming out", () => {
    expect(span(zoomRange({ start: 0.4, end: 0.6 }, 2))).toBeCloseTo(0.4);
  });

  it("narrows the window when zooming in", () => {
    expect(span(zoomRange({ start: 0.4, end: 0.6 }, 0.5))).toBeCloseTo(0.1);
  });

  it("keeps the centre fixed by default", () => {
    const r = zoomRange({ start: 0.4, end: 0.6 }, 2);
    expect((r.start + r.end) / 2).toBeCloseTo(0.5);
  });

  it("holds the anchor point still", () => {
    // Anchor at the left edge: the left edge should not move.
    const r = zoomRange({ start: 0.4, end: 0.6 }, 0.5, 0);
    expect(r.start).toBeCloseTo(0.4);
  });

  it("never exceeds the full range", () => {
    const r = zoomRange({ start: 0.2, end: 0.8 }, 10);
    expect(r).toEqual({ start: 0, end: 1 });
  });

  it("slides rather than shrinks when it hits the start edge", () => {
    const r = zoomRange({ start: 0.05, end: 0.15 }, 4);
    expect(r.start).toBe(0);
    expect(span(r)).toBeCloseTo(0.4);
  });

  it("slides rather than shrinks when it hits the end edge", () => {
    const r = zoomRange({ start: 0.85, end: 0.95 }, 4);
    expect(r.end).toBeCloseTo(1);
    expect(span(r)).toBeCloseTo(0.4);
  });

  it("refuses to zoom past the minimum span", () => {
    const r = zoomRange({ start: 0.5, end: 0.5 + MIN_SPAN }, 0.001);
    expect(span(r)).toBeCloseTo(MIN_SPAN);
  });

  it("clamps an anchor outside the window", () => {
    const r = zoomRange({ start: 0.4, end: 0.6 }, 0.5, 5);
    expect(r.start).toBeGreaterThanOrEqual(0);
    expect(r.end).toBeLessThanOrEqual(1);
  });

  it("leaves the window where it is at factor 1", () => {
    const r = zoomRange({ start: 0.3, end: 0.7 }, 1);
    expect(r.start).toBeCloseTo(0.3);
    expect(r.end).toBeCloseTo(0.7);
  });
});

describe("dragZoomFactor", () => {
  it("zooms in when the ruler is dragged right", () => {
    expect(dragZoomFactor(100)).toBeLessThan(1);
  });

  it("zooms out when the ruler is dragged left", () => {
    expect(dragZoomFactor(-100)).toBeGreaterThan(1);
  });

  it("does nothing without movement", () => {
    expect(dragZoomFactor(0)).toBe(1);
  });

  it("is symmetric, so a drag and its reverse cancel out", () => {
    expect(dragZoomFactor(80) * dragZoomFactor(-80)).toBeCloseTo(1);
  });

  it("grows with the size of the drag", () => {
    expect(dragZoomFactor(200)).toBeLessThan(dragZoomFactor(100));
  });
});
