import { useEffect, useRef } from "react";
import * as am5 from "@amcharts/amcharts5";
import * as am5gantt from "@amcharts/amcharts5/gantt";
import am5themes_Animated from "@amcharts/amcharts5/themes/Animated";
import am5themes_Dark from "@amcharts/amcharts5/themes/Dark";
import type { Store } from "../core/store";
import { project, type GanttTask } from "./projection";
import { ingestTasks, isEcho } from "./ingest";

/** Gantt wants number | Percent; the document stores a string like "30%". */
function toWidth(value: string): number | am5.Percent {
  return value.trim().endsWith("%") ? am5.percent(parseFloat(value)) : parseFloat(value);
}

export function GanttView({ store }: { store: Store }) {
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
        store.apply(ingestTasks(snapshots));
      },
      300,
    );

    apply();

    // Today marker: the Gantt has a built-in date marking API, so use that
    // rather than hand-rolling an axis range.
    chart.markDate(Date.now());

    const unsubscribe = store.subscribe(apply);
    chart.appear(1000, 100);

    return () => {
      unsubscribe();
      root.dispose(); // never chart.dispose()
    };
  }, [store]);

  return <div ref={divRef} style={{ width: "100%", height: "100%" }} />;
}
