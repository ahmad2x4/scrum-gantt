import { useEffect, useRef } from "react";
import * as am5 from "@amcharts/amcharts5";
import * as am5gantt from "@amcharts/amcharts5/gantt";
import am5themes_Animated from "@amcharts/amcharts5/themes/Animated";
import am5themes_Dark from "@amcharts/amcharts5/themes/Dark";
import type { Store } from "../core/store";
import { project, planExtent, type GanttTask } from "./projection";
import { ingestTasks, isEcho } from "./ingest";

/** Window after mount in which chart writebacks count as reconciliation. */
const SETTLE_MS = 2000;

/** Breathing room either side of the plan when fitting, as a fraction. */
const FIT_PAD = 0.04;

export interface GanttHandle {
  fit(): void;
}

/** Gantt wants number | Percent; the document stores a string like "30%". */
function toWidth(value: string): number | am5.Percent {
  return value.trim().endsWith("%") ? am5.percent(parseFloat(value)) : parseFloat(value);
}

export function GanttView({
  store,
  handleRef,
}: {
  store: Store;
  handleRef?: { current: GanttHandle | null };
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
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.setThemes(
      prefersDark
        ? [am5themes_Animated.new(root), am5themes_Dark.new(root)]
        : [am5themes_Animated.new(root)],
    );

    const doc0 = store.get();
    const chart = root.container.children.push(
      am5gantt.Gantt.new(root, {
        editable: true,
        durationUnit: doc0.calendar.durationUnit,
        weekends: doc0.calendar.weekends,
        excludeWeekends: doc0.calendar.excludeWeekends,
        holidays: doc0.calendar.holidays.map((d) => new Date(d)),
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

    // Echo guard #1: ignore valueschanged fired by our own writes.
    let applying = false;

    // The chart normalises data it is given - a task starting on a weekend is
    // snapped to working days - and reports it back. That is reconciliation,
    // not a user edit, so it must not mark a freshly opened plan as unsaved.
    // Bounded by time because the chart reports nothing when no normalising is
    // needed, and a permanent flag would then swallow the first real edit.
    const mountedAt = Date.now();
    const isSettling = () => Date.now() - mountedAt < SETTLE_MS;

    const apply = () => {
      const { categories, tasks } = project(store.get());
      applying = true;
      try {
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

    apply();

    // Open showing the whole plan rather than an arbitrary window.
    fit();
    if (handleRef) handleRef.current = { fit };

    // Today marker: the Gantt has a built-in date marking API, so use that
    // rather than hand-rolling an axis range.
    chart.markDate(Date.now());

    const unsubscribe = store.subscribe(apply);
    chart.appear(1000, 100);

    return () => {
      unsubscribe();
      if (handleRef) handleRef.current = null;
      root.dispose(); // never chart.dispose()
    };
  }, [store, handleRef]);

  return <div ref={divRef} style={{ width: "100%", height: "100%" }} />;
}
