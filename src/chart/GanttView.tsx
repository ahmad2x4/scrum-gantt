import { useEffect, useRef, type RefObject } from "react";
import * as am5 from "@amcharts/amcharts5";
import * as am5gantt from "@amcharts/amcharts5/gantt";
import am5themes_Animated from "@amcharts/amcharts5/themes/Animated";
import am5themes_Dark from "@amcharts/amcharts5/themes/Dark";
import type { Store } from "../core/store";
import { project, planExtent, type GanttTask } from "./projection";
import { ingestTasks, isEcho } from "./ingest";
import { zoomRange, dragZoomFactor } from "./zoom";
import { chartCalendar } from "./calendar";

/** Window after mount in which chart writebacks count as reconciliation. */
const SETTLE_MS = 2000;

/** Breathing room either side of the plan when fitting, as a fraction. */
const FIT_PAD = 0.04;

/**
 * How far past the plan the axis reaches, so there is somewhere to zoom out
 * to. A fraction of the plan's span, with a floor so a short plan still gets
 * a recognisable amount of calendar around it.
 */
const AXIS_CONTEXT = 0.6;
const MIN_AXIS_CONTEXT_MS = 30 * 86_400_000;

/**
 * Framing the plan is the one thing the gestures cannot do, so it is the only
 * control the toolbar drives. Zooming by degree is the ruler drag and pinch.
 */
export interface GanttHandle {
  fit(): void;
}

/** Gantt wants number | Percent; the document stores a string like "30%". */
function toWidth(value: string): number | am5.Percent {
  return value.trim().endsWith("%")
    ? am5.percent(parseFloat(value))
    : parseFloat(value);
}

export function GanttView({
  store,
  handleRef,
}: {
  store: Store;
  handleRef?: RefObject<GanttHandle | null>;
}) {
  const divRef = useRef<HTMLDivElement>(null);

  // Empty deps: the chart is created once and fed through the store
  // subscription. React must never re-render it.
  useEffect(() => {
    if (!divRef.current) return;

    const root = am5.Root.new(divRef.current);

    // amCharts renders to canvas, so CSS cannot restyle chart internals: a dark
    // page without the Dark theme leaves labels and grid nearly invisible.
    // Follow the system preference, which is what the page CSS does too.
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    root.setThemes(
      prefersDark
        ? [am5themes_Animated.new(root), am5themes_Dark.new(root)]
        : [am5themes_Animated.new(root)],
    );

    const doc0 = store.get();
    const chart = root.container.children.push(
      am5gantt.Gantt.new(root, {
        editable: doc0.locked !== true,
        ...chartCalendar(doc0.calendar),
        sidebarWidth: toWidth(doc0.view.sidebarWidth),
      }),
    );

    // Tighter rows: the default 70px cell fits only about seven rows on a
    // laptop, and real plans have many more.
    chart.yAxis.setAll({ minCellHeight: 38, childCellSize: 1, childShift: 18 });

    // Structural edits belong to the structure panel, which enforces the
    // Team -> Stream -> Item rules. The chart's own add/clear controls create
    // rows the store never sees, which the next re-projection then wipes out.
    // clearButton is a ConfirmButton, which does not stay hidden via the
    // visible setting; hide(0) is what the amCharts reference documents.
    chart.addButton.hide(0);
    chart.clearButton.hide(0);

    // The same reason covers the per-row delete button, which selecting a row
    // reveals. GanttCategoryAxis.deleteDataItem removes the row and cascades to
    // its children, but ingest only reads back series data, so the resulting
    // document fails its invariants and is discarded — leaving the chart
    // showing a row the store still has, until the next edit makes it reappear.
    chart.yAxis.xButton.hide(0);

    // Echo guard #1: ignore valueschanged fired by our own writes.
    let applying = false;

    // The chart normalises data it is given - a task starting on a weekend is
    // snapped to working days - and reports it back. That is reconciliation,
    // not a user edit, so it must not mark a freshly opened plan as unsaved.
    // Bounded by time because the chart reports nothing when no normalising is
    // needed, and a permanent flag would then swallow the first real edit.
    const mountedAt = Date.now();
    const isSettling = () => Date.now() - mountedAt < SETTLE_MS;

    const div = divRef.current;

    /**
     * Pointer geometry, cached.
     *
     * Pointer events carry viewport coordinates but globalBounds() is in the
     * chart's own space, so every hit test needs both. Measuring them per event
     * forces a layout on every mouse move across the chart, which is enough to
     * make the whole UI feel sluggish. They only change when the window or the
     * chart does, so they are measured then instead.
     */
    let rect = div.getBoundingClientRect();
    let plot = chart.xyChart.plotContainer.globalBounds();
    const remeasure = () => {
      rect = div.getBoundingClientRect();
      plot = chart.xyChart.plotContainer.globalBounds();
    };
    window.addEventListener("resize", remeasure);

    // The calendar the chart currently holds. Pushing it on every render would
    // hand amCharts a fresh holidays array each time and invalidate the chart
    // for nothing, so it is compared first.
    let appliedCalendar = JSON.stringify(doc0.calendar);

    const apply = () => {
      const doc = store.get();
      const { categories, tasks } = project(doc);

      applying = true;
      try {
        // Before the data, so the durations about to arrive are read in the
        // unit they were written in. Without this the chart keeps counting in
        // whatever unit it was built with: switching to weeks rewrites every
        // duration and the bars stay the length they were in days.
        const signature = JSON.stringify(doc.calendar);
        if (signature !== appliedCalendar) {
          appliedCalendar = signature;
          chart.setAll(chartCalendar(doc.calendar));
        }

        // A locked plan loses the drag handles rather than letting a drag look
        // like it worked and be refused by the store. The store gate is still
        // the thing that guarantees it; this only keeps the affordance honest.
        const editable = doc.locked !== true;
        if (chart.get("editable") !== editable) chart.set("editable", editable);

        // Set data last, and category data before series data.
        chart.yAxis.data.setAll(
          categories.map((c) => ({
            ...c,
            color: c.color !== undefined ? am5.color(c.color) : undefined,
          })),
        );
        chart.series.data.setAll(tasks);
      } finally {
        applying = false;
      }

      // Widen the axis past the plan so zooming out reaches calendar context
      // instead of stopping dead at the first and last task. After the data,
      // because setting data recalculates the range; setPrivate rather than
      // set, because the Gantt drives the range through the private values
      // (Gantt.js:298, 420).
      const extent = planExtent(doc);
      if (extent) {
        const pad = Math.max(
          (extent.end - extent.start) * AXIS_CONTEXT,
          MIN_AXIS_CONTEXT_MS,
        );
        chart.xAxis.setAll({
          min: extent.start - pad,
          max: extent.end + pad,
          // Without this the axis re-derives its range from the data whenever
          // the chart is zoomed, and the widening lasts exactly one render.
          strictMinMax: true,
        });
      }

      // The chart has just relaid out, so this is the cheap moment to refresh
      // the cached pointer geometry — once per edit rather than per mouse move.
      remeasure();
    };

    chart.events.onDebounced(
      "valueschanged",
      () => {
        if (applying) return;
        const snapshots = chart.series.data.values as unknown as GanttTask[];
        if (isEcho(store.get(), snapshots)) return;
        store.apply(ingestTasks(snapshots), { dirty: !isSettling() });
      },
      300,
    );

    // Fit the whole plan into view. Computed from stored data rather than the
    // chart's internal selection state, so it is correct immediately after
    // setAll without waiting for the chart to settle its own selection.
    const fit = () => {
      const extent = planExtent(store.get());
      if (!extent) return;
      const pad = (extent.end - extent.start) * FIT_PAD;
      chart.xAxis.zoomToValues(extent.start - pad, extent.end + pad);
    };

    /**
     * Zooms the time axis about `anchor`, a fraction across the visible
     * window. Working in the axis's own 0..1 relative range keeps this correct
     * whatever dates the plan covers.
     */
    const zoomBy = (factor: number, anchor = 0.5) => {
      const axis = chart.xAxis;
      const next = zoomRange(
        { start: axis.get("start", 0), end: axis.get("end", 1) },
        factor,
        anchor,
      );
      axis.zoom(next.start, next.end);
    };

    /**
     * macOS sends a trackpad pinch as a wheel event with ctrlKey set, and
     * amCharts has no handling of its own for it. Plain scrolling is left
     * alone so two-finger panning and row scrolling still work.
     */
    const localPoint = (e: { clientX: number; clientY: number }) => ({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });

    /** Where a point sits across the plot, as a fraction, clamped to 0..1. */
    const anchorAt = (x: number) => {
      const width = plot.right - plot.left;
      if (width <= 0) return 0.5;
      return Math.min(1, Math.max(0, (x - plot.left) / width));
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomBy(Math.exp(e.deltaY * 0.01), anchorAt(localPoint(e).x));
    };
    // Not passive: the handler calls preventDefault to stop the browser
    // treating a pinch as a page zoom.
    div.addEventListener("wheel", onWheel, { passive: false });

    /**
     * Dragging the date ruler left and right zooms, the convention in most
     * planning tools. The ruler is the band above the plot; below belongs to
     * the bars and left of it to the sidebar.
     */
    const overRuler = (e: PointerEvent) => {
      const { x, y } = localPoint(e);
      return y < plot.top && x >= plot.left;
    };

    let dragX: number | null = null;
    let dragAnchor = 0.5;

    const onPointerDown = (e: PointerEvent) => {
      if (!overRuler(e)) return;
      dragAnchor = anchorAt(localPoint(e).x);
      dragX = e.clientX;
      try {
        div.setPointerCapture(e.pointerId);
      } catch {
        // Not every pointer id is capturable; the drag just ends early.
      }
    };

    let cursor = "";
    const onPointerMove = (e: PointerEvent) => {
      if (dragX === null) {
        // Assigning style on every move invalidates style even when the value
        // is unchanged, so only write when it actually differs.
        const wanted = overRuler(e) ? "ew-resize" : "";
        if (wanted !== cursor) {
          cursor = wanted;
          div.style.cursor = wanted;
        }
        return;
      }
      const dx = e.clientX - dragX;
      dragX = e.clientX;
      zoomBy(dragZoomFactor(dx), dragAnchor);
    };

    const endDrag = (e: PointerEvent) => {
      if (dragX === null) return;
      dragX = null;
      if (div.hasPointerCapture(e.pointerId))
        div.releasePointerCapture(e.pointerId);
      div.style.cursor = "";
    };

    // Capture phase: amCharts handles pointer events on its canvas and stops
    // them before they would reach this element.
    div.addEventListener("pointerdown", onPointerDown, true);
    div.addEventListener("pointermove", onPointerMove, true);
    div.addEventListener("pointerup", endDrag, true);
    div.addEventListener("pointercancel", endDrag, true);

    // Two-finger horizontal scrolling pans time, the conventional gesture.
    chart.xyChart.set("wheelX", "panX");

    if (handleRef) handleRef.current = { fit };

    apply();

    // Open showing the whole plan rather than an arbitrary window. The
    // toolbar's Fit button calls the same thing on demand.
    fit();

    // Today marker: the Gantt has a built-in date marking API, so use that
    // rather than hand-rolling an axis range.
    chart.markDate(Date.now());

    const unsubscribe = store.subscribe(apply);
    chart.appear(1000, 100);

    return () => {
      unsubscribe();
      window.removeEventListener("resize", remeasure);
      div.removeEventListener("wheel", onWheel);
      div.removeEventListener("pointerdown", onPointerDown, true);
      div.removeEventListener("pointermove", onPointerMove, true);
      div.removeEventListener("pointerup", endDrag, true);
      div.removeEventListener("pointercancel", endDrag, true);
      if (handleRef) handleRef.current = null;
      root.dispose(); // never chart.dispose()
    };
  }, [store, handleRef]);

  return <div ref={divRef} style={{ width: "100%", height: "100%" }} />;
}
