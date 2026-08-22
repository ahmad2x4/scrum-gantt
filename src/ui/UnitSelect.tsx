import type { Store } from "../core/store";
import { usePlan } from "./useStore";
import { setDurationUnit } from "../core/mutations";

/**
 * amCharts expresses the duration unit as a bare enum with no count, so day and
 * week are the only useful options — there is no two-week unit to offer.
 */
const OPTIONS = [
  { label: "1d", unit: "day" as const, title: "Count durations in days" },
  { label: "1w", unit: "week" as const, title: "Count durations in weeks" },
];

export function UnitSelect({ store }: { store: Store }) {
  const plan = usePlan(store);

  return (
    <div className="unit-group" role="group" aria-label="Duration unit">
      {OPTIONS.map((o) => (
        <button
          key={o.label}
          aria-pressed={plan.calendar.durationUnit === o.unit}
          className={plan.calendar.durationUnit === o.unit ? "unit on" : "unit"}
          title={o.title}
          onClick={() => store.apply(setDurationUnit(o.unit))}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
