"""Forecast selection and accuracy analysis.

Everything here is a pure function of DataFrames, so it can be tested with
small hand-made tables. Sign convention used throughout:

    error = forecast - actual   (MW)

A positive error means the forecast promised more wind than turned up, i.e.
a shortfall the desk has to cover by buying more power.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta

import numpy as np
import pandas as pd

from .config import BIAS_LOOKBACK_DAYS


# ---------- windows ----------

def delivery_window(delivery_date: date) -> tuple[pd.Timestamp, pd.Timestamp]:
    """[start, end) of a delivery day in UTC (UK local = UTC in January)."""
    start = pd.Timestamp(datetime.combine(delivery_date, time(0)), tz="UTC")
    return start, start + pd.Timedelta(days=1)


def decision_cutoff(delivery_date: date, decision_time: time) -> pd.Timestamp:
    """The moment on D-1 by which the day-ahead purchase must be decided."""
    d_minus_1 = delivery_date - timedelta(days=1)
    return pd.Timestamp(datetime.combine(d_minus_1, decision_time), tz="UTC")


# ---------- forecast selection ----------

def forecast_as_of(fc: pd.DataFrame, cutoff: pd.Timestamp, start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    """Latest forecast for each target time in [start, end) published at or before `cutoff`.

    This is exactly what the desk could see when deciding: nothing published
    after the cutoff is allowed to leak in.
    """
    cand = fc[(fc["publishTime"] <= cutoff) & (fc["startTime"] >= start) & (fc["startTime"] < end)]
    if cand.empty:
        return pd.DataFrame(columns=["startTime", "forecast", "publishTime", "lead_h"])
    latest = cand.loc[cand.groupby("startTime")["publishTime"].idxmax()]
    return latest.rename(columns={"generation": "forecast"})[["startTime", "forecast", "publishTime", "lead_h"]].reset_index(drop=True)


def forecast_min_lead(fc: pd.DataFrame, min_lead_h: float, targets: pd.Series) -> pd.DataFrame:
    """For each target, the latest forecast published at least `min_lead_h` hours before it."""
    cand = fc[(fc["lead_h"] >= min_lead_h) & (fc["startTime"].isin(targets))]
    if cand.empty:
        return pd.DataFrame(columns=["startTime", "forecast", "publishTime", "lead_h"])
    latest = cand.loc[cand.groupby("startTime")["publishTime"].idxmax()]
    return latest.rename(columns={"generation": "forecast"})[["startTime", "forecast", "publishTime", "lead_h"]].reset_index(drop=True)


def decision_forecasts(fc: pd.DataFrame, delivery_dates: list[date], decision_time: time) -> pd.DataFrame:
    """The forecast in hand at each day's decision cutoff, for every delivery day."""
    parts = []
    for d in delivery_dates:
        start, end = delivery_window(d)
        part = forecast_as_of(fc, decision_cutoff(d, decision_time), start, end)
        part["delivery_date"] = d
        parts.append(part)
    return pd.concat(parts, ignore_index=True) if parts else pd.DataFrame()


def with_actuals(df: pd.DataFrame, act: pd.DataFrame) -> pd.DataFrame:
    """Pair forecasts with the actual for the same settlement period start.

    Forecasts are hourly, actuals half-hourly: we compare at the hourly points,
    which are present in both, rather than inventing values in between.
    """
    out = df.merge(act.rename(columns={"generation": "actual"}), on="startTime", how="inner")
    out["error"] = out["forecast"] - out["actual"]
    return out


# ---------- bias correction ----------

def trailing_bias(paired: pd.DataFrame, lookback_days: int = BIAS_LOOKBACK_DAYS) -> dict[date, float]:
    """Mean error to subtract from each delivery day's forecast.

    For delivery day D (decided on D-1), only days D-1-lookback .. D-2 are
    used: D-2 is the last day that is fully settled before the decision, so
    the correction never uses information the desk did not have.
    """
    daily = paired.groupby("delivery_date")["error"].mean()
    out: dict[date, float] = {}
    for d in sorted(paired["delivery_date"].unique()):
        window = [d - timedelta(days=k) for k in range(2, 2 + lookback_days)]
        hist = daily[daily.index.isin(window)]
        out[d] = float(hist.mean()) if len(hist) else 0.0
    return out


def apply_bias(paired: pd.DataFrame, bias: dict[date, float]) -> pd.DataFrame:
    out = paired.copy()
    out["forecast"] = out["forecast"] - out["delivery_date"].map(bias).astype(float)
    out["error"] = out["forecast"] - out["actual"]
    return out


# ---------- metrics ----------

def metrics(err: pd.Series, actual: pd.Series) -> dict:
    if err.empty:
        return {}
    e = err.to_numpy(dtype=float)
    mae = float(np.mean(np.abs(e)))
    return {
        "count": int(e.size),
        "mae_mw": mae,
        "rmse_mw": float(np.sqrt(np.mean(e ** 2))),
        "bias_mw": float(np.mean(e)),
        # MAE as a share of average output: comparable across months and fleets.
        "nmae_pct": float(100 * mae / np.mean(actual.to_numpy(dtype=float))),
        "p10_mw": float(np.percentile(e, 10)),
        "p50_mw": float(np.percentile(e, 50)),
        "p90_mw": float(np.percentile(e, 90)),
        "max_over_mw": float(e.max()),
        "max_under_mw": float(e.min()),
        "within_1gw_pct": float(100 * np.mean(np.abs(e) <= 1000)),
    }


def _grouped(paired: pd.DataFrame, key: pd.Series) -> list[dict]:
    rows = []
    for k, g in paired.groupby(key, observed=True):
        m = metrics(g["error"], g["actual"])
        rows.append({"key": str(k), "mae_mw": m["mae_mw"], "bias_mw": m["bias_mw"], "count": m["count"]})
    return rows


def histogram(err: pd.Series, width: int = 500) -> list[dict]:
    lo = int(np.floor(err.min() / width) * width)
    hi = int(np.ceil(err.max() / width) * width) + width
    counts, edges = np.histogram(err, bins=np.arange(lo, hi + 1, width))
    return [{"from_mw": int(edges[i]), "to_mw": int(edges[i + 1]), "count": int(c)} for i, c in enumerate(counts)]


LEAD_BUCKETS = [0, 12, 18, 24, 30, 36, 48]


def accuracy_report(paired: pd.DataFrame) -> dict:
    """Everything the accuracy page shows, for one set of paired forecasts."""
    p = paired.copy()
    p["hour"] = p["startTime"].dt.hour
    p["lead_bucket"] = pd.cut(p["lead_h"], LEAD_BUCKETS, right=False)
    daily = []
    for d, g in p.groupby("delivery_date"):
        m = metrics(g["error"], g["actual"])
        daily.append({
            "date": d.isoformat(),
            "mae_mw": m["mae_mw"],
            "bias_mw": m["bias_mw"],
            "forecast_mwh": float(g["forecast"].sum()),  # hourly points x 1 h
            "actual_mwh": float(g["actual"].sum()),
        })
    return {
        "overall": metrics(p["error"], p["actual"]),
        "by_hour": _grouped(p, p["hour"]),
        "by_lead": _grouped(p, p["lead_bucket"].astype(str)),
        "daily": daily,
        "histogram": histogram(p["error"]),
    }


def horizon_curve(fc: pd.DataFrame, act: pd.DataFrame, targets: pd.Series, hours: range) -> list[dict]:
    """How accuracy decays as the forecast is taken further ahead of delivery."""
    rows = []
    for h in hours:
        paired = with_actuals(forecast_min_lead(fc, h, targets), act)
        m = metrics(paired["error"], paired["actual"])
        if m:
            rows.append({"lead_h": h, "mae_mw": m["mae_mw"], "bias_mw": m["bias_mw"], "rmse_mw": m["rmse_mw"]})
    return rows
