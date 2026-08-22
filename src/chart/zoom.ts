/** Never zoom the time axis tighter than this fraction of the plan. */
export const MIN_SPAN = 0.002;

export interface Range {
  start: number;
  end: number;
}

/**
 * Zooms a relative axis range (0..1) about `anchor`, a fraction across the
 * visible window. `factor` > 1 widens the window (zooms out).
 *
 * Kept pure and free of amCharts so the arithmetic — which is where the
 * off-by-one errors live — can be tested without a canvas.
 */
export function zoomRange(current: Range, factor: number, anchor = 0.5): Range {
  const span = current.end - current.start;
  const nextSpan = Math.min(1, Math.max(MIN_SPAN, span * factor));
  const clampedAnchor = Math.min(1, Math.max(0, anchor));

  const focus = current.start + span * clampedAnchor;
  let start = focus - nextSpan * clampedAnchor;

  // Clamp into 0..1 without shrinking the window: pushing against either edge
  // slides the view rather than narrowing it.
  if (start < 0) start = 0;
  if (start + nextSpan > 1) start = 1 - nextSpan;

  return { start, end: start + nextSpan };
}
