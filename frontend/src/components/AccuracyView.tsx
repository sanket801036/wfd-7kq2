import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, type Accuracy, type Meta } from "../api";
import { dayLabel, gw, pct, signedGw } from "../format";
import { useApi } from "../useApi";
import { DecisionTimeSelect, ErrorBox, Kpi, Loading, Panel, Toggle } from "./ui";

const gwTick = (v: number) => (v / 1000).toFixed(1);
const gwTip = (v: unknown) => gw(Number(v), 2);

function Insights({ a }: { a: Accuracy }) {
  const o = a.overall;
  const b = a.baseline_overall;
  const overDays = a.daily.filter((d) => d.bias_mw > 0).length;
  const worst = [...a.daily].sort((x, y) => y.mae_mw - x.mae_mw)[0];
  const gain = b.mae_mw > 0 ? (100 * (b.mae_mw - o.mae_mw)) / b.mae_mw : 0;
  return (
    <ul className="space-y-2 text-sm leading-relaxed text-slate-700">
      <li>
        <b>The raw forecast runs high.</b> At the {a.decision_time} decision it over-stated wind by {signedGw(b.bias_mw)} on average.{" "}
        {a.bias_correct
          ? `After correction the bias is ${signedGw(o.bias_mw)}, and the forecast was still too high on ${overDays} of ${a.daily.length} days.`
          : `It was too high on ${overDays} of ${a.daily.length} days.`}
      </li>
      <li>
        <b>Learning that bias from the last 7 settled days</b> cuts the mean absolute error from {gw(b.mae_mw, 2)} to{" "}
        {gw(a.bias_correct ? o.mae_mw : b.mae_mw, 2)}
        {a.bias_correct ? ` (${gain.toFixed(0)}% better)` : " — switch on bias correction to see the effect"}, using only data available at decision time.
      </li>
      <li>
        <b>Plan cover for the tail, not the average.</b> In 9 of 10 hours the shortfall was below {gw(o.p90_mw)}; the worst hour missed by{" "}
        {gw(o.max_over_mw)}.
      </li>
      <li>
        <b>Hardest day:</b> {dayLabel(worst.date)}, with an average miss of {gw(worst.mae_mw, 2)}.
      </li>
    </ul>
  );
}

export default function AccuracyView({ meta }: { meta: Meta }) {
  const [decision, setDecision] = useState(meta.default_decision_time);
  const [biasCorrect, setBiasCorrect] = useState(false);
  const acc = useApi(() => api.accuracy(decision, biasCorrect), [decision, biasCorrect]);
  const horizon = useApi(() => api.horizon(), []);
  const a = acc.data;

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-end gap-5">
        <DecisionTimeSelect value={decision} onChange={setDecision} />
        <div className="pb-2">
          <Toggle checked={biasCorrect} onChange={setBiasCorrect} label="Bias-corrected forecast" />
        </div>
        <p className="ml-auto max-w-md text-xs leading-relaxed text-slate-500">
          For every delivery day {dayLabel(meta.first_delivery_date)} – {dayLabel(meta.last_delivery_date)}: the forecast in hand at the
          decision time, compared hour by hour with metered output. Error = forecast − actual, so positive means a shortfall.
        </p>
      </div>

      {acc.error && <ErrorBox message={acc.error} />}
      {acc.loading && !a && <Loading />}

      {a && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Kpi
              label="Mean absolute error"
              value={gw(a.overall.mae_mw, 2)}
              tone={a.bias_correct ? "good" : "default"}
              hint={`${pct(a.overall.nmae_pct, 1)} of average output`}
            />
            <Kpi label="Bias" value={signedGw(a.overall.bias_mw)} tone={Math.abs(a.overall.bias_mw) < 500 ? "good" : "warn"} hint="Positive = forecast too high" />
            <Kpi label="RMSE" value={gw(a.overall.rmse_mw, 2)} hint="Penalises the big misses" />
            <Kpi label="P90 shortfall" value={gw(a.overall.p90_mw, 2)} tone="warn" hint="Cover that would have handled 9 in 10 hours" />
            <Kpi label="Within ±1 GW" value={pct(a.overall.within_1gw_pct)} hint={`${a.overall.count} hourly points`} />
          </div>

          <Panel title="What this means for the desk">
            <Insights a={a} />
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Error by delivery day" subtitle="Bars: mean absolute error · line: bias">
              <div className="h-64">
                <ResponsiveContainer>
                  <ComposedChart data={a.daily}>
                    <CartesianGrid stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(8, 10)} tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={gwTick} unit=" GW" width={56} tick={{ fontSize: 11 }} />
                    <Tooltip labelFormatter={(l) => dayLabel(String(l))} formatter={gwTip} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <ReferenceLine y={0} stroke="#94a3b8" />
                    <Bar dataKey="mae_mw" name="MAE" fill="#5eead4" isAnimationActive={false} />
                    <Line dataKey="bias_mw" name="Bias" stroke="#b45309" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Accuracy vs. how far ahead" subtitle="Latest forecast issued at least N hours before delivery (all of January)">
              {horizon.error && <ErrorBox message={horizon.error} />}
              <div className="h-64">
                <ResponsiveContainer>
                  <ComposedChart data={horizon.data ?? []}>
                    <CartesianGrid stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="lead_h" unit=" h" tick={{ fontSize: 11 }} interval={5} />
                    <YAxis tickFormatter={gwTick} unit=" GW" width={56} tick={{ fontSize: 11 }} />
                    <Tooltip labelFormatter={(l) => `${l} h ahead`} formatter={gwTip} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line dataKey="mae_mw" name="MAE" stroke="#0f766e" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line dataKey="rmse_mw" name="RMSE" stroke="#64748b" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    <Line dataKey="bias_mw" name="Bias" stroke="#b45309" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Error by hour of delivery" subtitle="Is the forecast worse at particular times of day?">
              <div className="h-64">
                <ResponsiveContainer>
                  <ComposedChart data={a.by_hour}>
                    <CartesianGrid stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="key" tickFormatter={(h: string) => `${h.padStart(2, "0")}:00`} interval={3} tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={gwTick} unit=" GW" width={56} tick={{ fontSize: 11 }} />
                    <Tooltip labelFormatter={(l) => `${String(l).padStart(2, "0")}:00`} formatter={gwTip} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <ReferenceLine y={0} stroke="#94a3b8" />
                    <Bar dataKey="mae_mw" name="MAE" fill="#99f6e4" isAnimationActive={false} />
                    <Line dataKey="bias_mw" name="Bias" stroke="#b45309" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="How big are the misses?" subtitle="Hourly errors in 0.5 GW bins · orange = shortfall, teal = surplus">
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={a.histogram}>
                    <CartesianGrid stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="from_mw" tickFormatter={gwTick} tick={{ fontSize: 11 }} unit=" GW" />
                    <YAxis width={40} tick={{ fontSize: 11 }} />
                    <Tooltip labelFormatter={(l) => `${gwTick(Number(l))} to ${gwTick(Number(l) + 500)} GW`} formatter={(v) => [`${v} hours`, "Count"]} />
                    <Bar dataKey="count" isAnimationActive={false}>
                      {a.histogram.map((h) => (
                        <Cell key={h.from_mw} fill={h.from_mw >= 0 ? "#f59e0b" : "#14b8a6"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          <Panel title="Daily energy: forecast vs. actual" subtitle="Hourly points summed, GWh">
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={a.daily}>
                  <CartesianGrid stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(8, 10)} tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v: number) => (v / 1000).toFixed(0)} unit=" GWh" width={64} tick={{ fontSize: 11 }} />
                  <Tooltip labelFormatter={(l) => dayLabel(String(l))} formatter={(v) => `${(Number(v) / 1000).toFixed(1)} GWh`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="forecast_mwh" name="Forecast" fill="#0f766e" isAnimationActive={false} />
                  <Bar dataKey="actual_mwh" name="Actual" fill="#334155" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
