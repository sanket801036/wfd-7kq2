import type { Meta } from "../api";
import { dayLabel } from "../format";
import { Panel } from "./ui";

export default function Method({ meta }: { meta: Meta }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="What the desk sees">
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
          <li>Pick a delivery day and the time on the day before when the purchase is committed.</li>
          <li>
            The app takes, for every hour of that day, the <b>latest forecast published before the decision</b>. Anything
            published later is invisible, exactly as it was at the time.
          </li>
          <li>
            The shaded range and the "count on" figure come from how wrong similar forecasts were over the previous 14 settled
            days, so the desk can size the extra cover it buys.
          </li>
          <li>The accuracy page repeats this for every delivery day and measures the error hour by hour.</li>
        </ol>
      </Panel>
      <Panel title="Data and scope">
        <ul className="space-y-2 text-sm leading-relaxed text-slate-700">
          <li>
            <b>Actuals:</b> Elexon FUELHH, fuel type WIND — half-hourly metered national output.
          </li>
          <li>
            <b>Forecasts:</b> Elexon WINDFOR — hourly national wind forecasts, published about {meta.publish_times_utc.length} times a day (
            {meta.publish_times_utc.join(", ")} UTC), each looking up to ~3 days ahead.
          </li>
          <li>
            <b>Scope:</b> purchase decisions made {dayLabel(meta.first_decision_date)} – {dayLabel(meta.last_decision_date)} 2026, i.e.
            delivery days {dayLabel(meta.first_delivery_date)} – {dayLabel(meta.last_delivery_date)}.
          </li>
          <li>
            <b>Bias correction:</b> subtract the mean error of the last 7 fully settled days (D-8 … D-2). D-1 is excluded because it
            is still being delivered when the decision is made.
          </li>
          <li>
            <b>Comparison:</b> at the hourly points both datasets share. Error = forecast − actual.
          </li>
          <li>
            <b>Why the forecast may run high:</b> FUELHH is metered output, so wind that was curtailed for grid constraints never
            shows up as generation. This dataset alone cannot confirm the cause; the correction handles it either way.
          </li>
        </ul>
      </Panel>
    </div>
  );
}
