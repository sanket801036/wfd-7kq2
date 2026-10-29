// Typed wrappers around the backend. Error sign everywhere: forecast - actual (MW),
// so a positive number means wind came in below forecast (a shortfall to cover).

export type Metrics = {
  count: number;
  mae_mw: number;
  rmse_mw: number;
  bias_mw: number;
  nmae_pct: number;
  p10_mw: number;
  p50_mw: number;
  p90_mw: number;
  max_over_mw: number;
  max_under_mw: number;
  within_1gw_pct: number;
};

export type Meta = {
  first_delivery_date: string;
  last_delivery_date: string;
  first_decision_date: string;
  last_decision_date: string;
  publish_times_utc: string[];
  default_decision_time: string;
  actual_rows: number;
  forecast_rows: number;
  source: string;
};

export type DayPoint = {
  time: string;
  actual: number | null;
  forecast: number | null;
  band_low: number | null;
  band_high: number | null;
  latest: number | null;
};

export type Vintage = { publish_time: string; before_decision: boolean; points: { time: string; value: number }[] };

export type DayView = {
  delivery_date: string;
  decision_at: string;
  forecast_published_at: string | null;
  lead_hours_min: number | null;
  lead_hours_max: number | null;
  bias_correct: boolean;
  band: { p10_mw: number; p90_mw: number; sample: number; lookback_days: number };
  summary: Partial<Metrics> & {
    forecast_mwh: number | null;
    actual_mwh: number | null;
    forecast_avg_mw: number | null;
    actual_avg_mw: number | null;
  };
  points: DayPoint[];
  vintages: Vintage[];
};

export type Grouped = { key: string; mae_mw: number; bias_mw: number; count: number };

export type Accuracy = {
  decision_time: string;
  bias_correct: boolean;
  overall: Metrics;
  baseline_overall: Metrics;
  by_hour: Grouped[];
  by_lead: Grouped[];
  daily: { date: string; mae_mw: number; bias_mw: number; forecast_mwh: number; actual_mwh: number }[];
  histogram: { from_mw: number; to_mw: number; count: number }[];
};

export type HorizonPoint = { lead_h: number; mae_mw: number; bias_mw: number; rmse_mw: number };

async function get<T>(path: string, params: Record<string, string | boolean> = {}): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const res = await fetch(`/api/${path}${qs.size ? `?${qs}` : ""}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  meta: () => get<Meta>("meta"),
  day: (delivery_date: string, decision_time: string, bias_correct: boolean) =>
    get<DayView>("day", { delivery_date, decision_time, bias_correct }),
  accuracy: (decision_time: string, bias_correct: boolean) =>
    get<Accuracy>("accuracy", { decision_time, bias_correct }),
  horizon: () => get<HorizonPoint[]>("horizon"),
};
