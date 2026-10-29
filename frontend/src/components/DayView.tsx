import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, type Meta } from "../api";
import { dayLabel, gw, gwh, hhmm, pct, signedGw, stamp } from "../format";
import { useApi } from "../useApi";
import { DecisionTimeSelect, ErrorBox, Kpi, Loading, Panel, Toggle } from "./ui";

export default function DayView({ meta }: { meta: Meta }) {
  const [date, setDate] = useState("2026-01-15");
  const [decision, setDecision] = useState(meta.default_decision_time);
  const [biasCorrect, setBiasCorrect] = useState(true);
  const [showVintages, setShowVintages] = useState(false);
  const [showHindsight, setShowHindsight] = useState(true);

  const { data, error, loading } = useApi(() => api.day(date, decision, biasCorrect), [date, decision, biasCorrect]);

  const chart = useMemo(() => {
    if (!data) return [];
    const byTime = new Map(data.points.map((p) => [p.time, { ...p, band: p.band_low == null ? null : [p.band_low, p.band_high] } as Record<string, unknown>]));
    data.vintages.forEach((v, i) =>
      v.points.forEach((pt) => {
        const row = byTime.get(pt.time);
        if (row) row[`v${i}`] = pt.value;
      }),
    );
    return [...byTime.values()];
  }, [data]);

  const s = data?.summary;
  const firmWind = s?.forecast_avg_mw != null && data ? s.forecast_avg_mw - data.band.p90_mw : null;

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-end gap-5">
        <label className="text-sm text-slate-700">
          <span className="label mb-1 block">Delivery day</span>
          <input
            type="date"
            value={date}
            min={meta.first_delivery_date}
            max={meta.last_delivery_date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
          />
        </label>
        <DecisionTimeSelect value={decision} onChange={setDecision} />
        <div className="flex flex-col gap-2 pb-1">
          <Toggle checked={biasCorrect} onChange={setBiasCorrect} label="Bias-corrected forecast" />
          <Toggle checked={showHindsight} onChange={setShowHindsight} label="Show what actually happened" />
        </div>
        <p className="ml-auto max-w-sm text-xs leading-relaxed text-slate-500">
          Only forecasts published before the decision time are used. Times are UK local (GMT in January).
        </p>
      </div>

      {error && <ErrorBox message={error} />}
      {loading && !data && <Loading />}

      {data && s && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Forecast in hand"
              value={stamp(data.forecast_published_at)}
              hint={`Latest publish before the ${hhmm(data.decision_at)} decision · ${data.lead_hours_min?.toFixed(0)}–${data.lead_hours_max?.toFixed(0)} h ahead`}
            />
            <Kpi
              label="Expected wind"
              value={gwh(s.forecast_mwh)}
              hint={`Average ${gw(s.forecast_avg_mw)} across the day${biasCorrect ? ", after bias correction" : ""}`}
            />
            <Kpi
              label="Wind you can count on (P90)"
              value={gw(firmWind)}
              tone="warn"
              hint={`Average output met or beaten in 9 of 10 hours over the last ${data.band.lookback_days} settled days`}
            />
            <Kpi
              label="Extra cover to hold"
              value={gw(Math.max(data.band.p90_mw, 0))}
              hint="Buy this much beyond the forecast to cover 90% of wind shortfalls seen recently"
            />
          </div>

          <Panel
            title={`Wind generation · ${dayLabel(data.delivery_date)}`}
            subtitle="Shaded band: where actual output landed 80% of the time, given forecasts like this one"
            right={<Toggle checked={showVintages} onChange={setShowVintages} label="All forecast versions" />}
          >
            <div className="h-80">
              <ResponsiveContainer>
                <ComposedChart data={chart} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="time" tickFormatter={hhmm} interval={5} tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}`} tick={{ fontSize: 12 }} unit=" GW" width={60} />
                  <Tooltip
                    labelFormatter={(l) => hhmm(String(l))}
                    formatter={(v, name) => [Array.isArray(v) ? `${gw(Number(v[0]))} – ${gw(Number(v[1]))}` : gw(Number(v)), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area dataKey="band" name="80% range" stroke="none" fill="#99f6e4" fillOpacity={0.5} connectNulls isAnimationActive={false} />
                  {showVintages &&
                    data.vintages.map((v, i) => (
                      <Line
                        key={v.publish_time}
                        dataKey={`v${i}`}
                        name={i === 0 ? "Other forecast versions" : undefined}
                        legendType={i === 0 ? "line" : "none"}
                        stroke={v.before_decision ? "#94a3b8" : "#cbd5e1"}
                        strokeWidth={1}
                        dot={false}
                        connectNulls
                        isAnimationActive={false}
                      />
                    ))}
                  <Line dataKey="forecast" name="Forecast at decision" stroke="#0f766e" strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
                  {showHindsight && (
                    <Line dataKey="actual" name="Actual" stroke="#1e293b" strokeWidth={2} dot={false} isAnimationActive={false} />
                  )}
                  {showHindsight && (
                    <Line dataKey="latest" name="Last forecast before delivery" stroke="#f59e0b" strokeDasharray="5 4" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          {showHindsight && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Actual wind (hindsight)" value={gwh(s.actual_mwh)} hint={`Average ${gw(s.actual_avg_mw)}`} />
              <Kpi label="Mean absolute error" value={gw(s.mae_mw, 2)} hint={`${pct(s.nmae_pct)} of average output`} />
              <Kpi
                label="Bias on the day"
                value={signedGw(s.bias_mw)}
                tone={Math.abs(s.bias_mw ?? 0) < 500 ? "good" : "warn"}
                hint="Positive = forecast was too high (shortfall)"
              />
              <Kpi label="Hours within ±1 GW" value={pct(s.within_1gw_pct)} hint={`${s.count} hourly points compared`} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
