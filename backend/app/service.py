"""Glue between the snapshot and the analysis: builds the payloads the API returns."""
from __future__ import annotations

from datetime import date, time, timedelta
from functools import lru_cache

import numpy as np
import pandas as pd

from . import analysis as an
from . import data
from .config import FIRST_DECISION_DATE, LAST_DECISION_DATE

BAND_LOOKBACK_DAYS = 14


def delivery_dates() -> list[date]:
    n = (LAST_DECISION_DATE - FIRST_DECISION_DATE).days + 1
    return [FIRST_DECISION_DATE + timedelta(days=k + 1) for k in range(n)]


def _iso(ts) -> str | None:
    return None if ts is None or pd.isna(ts) else pd.Timestamp(ts).strftime("%Y-%m-%dT%H:%M:%SZ")


# Days before the first delivery day are only used to warm up the bias and
# the uncertainty band (they are not part of the reported January results).
WARMUP_DAYS = 16


@lru_cache(maxsize=48)
def _paired(decision_time: time) -> pd.DataFrame:
    days = [delivery_dates()[0] - timedelta(days=k) for k in range(WARMUP_DAYS, 0, -1)] + delivery_dates()
    fc = an.decision_forecasts(data.forecasts(), days, decision_time)
    return an.with_actuals(fc, data.actuals())


@lru_cache(maxsize=96)
def paired(decision_time: time, bias_correct: bool) -> pd.DataFrame:
    raw = _paired(decision_time)
    if not bias_correct:
        return raw
    return an.apply_bias(raw, an.trailing_bias(raw))


def _in_scope(p: pd.DataFrame) -> pd.DataFrame:
    return p[p["delivery_date"].isin(delivery_dates())]


def accuracy(decision_time: time, bias_correct: bool) -> dict:
    report = an.accuracy_report(_in_scope(paired(decision_time, bias_correct)))
    baseline = an.accuracy_report(_in_scope(paired(decision_time, False)))["overall"]
    return {"decision_time": decision_time.strftime("%H:%M"), "bias_correct": bias_correct,
            "baseline_overall": baseline, **report}


def _band(p: pd.DataFrame, delivery_date: date) -> tuple[float, float, int]:
    """P10/P90 of errors over the settled days before this decision (no look-ahead)."""
    window = [delivery_date - timedelta(days=k) for k in range(2, 2 + BAND_LOOKBACK_DAYS)]
    hist = p[p["delivery_date"].isin(window)]["error"]
    if len(hist) < 24:
        return 0.0, 0.0, len(hist)
    return float(np.percentile(hist, 10)), float(np.percentile(hist, 90)), len(hist)


def day_view(delivery_date: date, decision_time: time, bias_correct: bool) -> dict:
    fc_all = data.forecasts()
    act = data.actuals()
    start, end = an.delivery_window(delivery_date)
    cutoff = an.decision_cutoff(delivery_date, decision_time)

    p = paired(decision_time, bias_correct)
    day = p[p["delivery_date"] == delivery_date].set_index("startTime")
    p10, p90, band_n = _band(p, delivery_date)

    # For contrast: the last forecast issued before each period itself. The
    # desk cannot use it (it arrives after the auction), but it shows how much
    # the picture changed after the decision.
    last = (fc_all[(fc_all["startTime"] >= start) & (fc_all["startTime"] < end)]
            .sort_values("publishTime").groupby("startTime").last()["generation"])

    act_day = act[(act["startTime"] >= start) & (act["startTime"] < end)].set_index("startTime")["generation"]
    points = []
    for ts in pd.date_range(start, end, freq="30min", inclusive="left"):
        f = day["forecast"].get(ts)
        points.append({
            "time": _iso(ts),
            "actual": None if ts not in act_day.index else float(act_day[ts]),
            "forecast": None if f is None else float(f),
            # Forecast - error = actual, so the actual should fall in
            # [forecast - p90, forecast - p10] about 80% of the time.
            "band_low": None if f is None or band_n < 24 else float(f - p90),
            "band_high": None if f is None or band_n < 24 else float(f - p10),
            "latest": None if ts not in last.index else float(last[ts]),
        })

    used = day["publishTime"].max() if not day.empty else None
    m = an.metrics(day["error"], day["actual"]) if not day.empty else {}
    vintages = []
    for pub, g in fc_all[(fc_all["startTime"] >= start) & (fc_all["startTime"] < end)
                         & (fc_all["publishTime"] >= start - pd.Timedelta(days=2))].groupby("publishTime"):
        vintages.append({"publish_time": _iso(pub), "before_decision": bool(pub <= cutoff),
                         "points": [{"time": _iso(r.startTime), "value": float(r.generation)} for r in g.itertuples()]})

    return {
        "delivery_date": delivery_date.isoformat(),
        "decision_at": _iso(cutoff),
        "forecast_published_at": _iso(used),
        "lead_hours_min": None if day.empty else float(day["lead_h"].min()),
        "lead_hours_max": None if day.empty else float(day["lead_h"].max()),
        "bias_correct": bias_correct,
        "band": {"p10_mw": p10, "p90_mw": p90, "sample": band_n, "lookback_days": BAND_LOOKBACK_DAYS},
        "summary": {
            "forecast_mwh": float(day["forecast"].sum()) if not day.empty else None,
            "actual_mwh": float(act_day.sum() * 0.5) if len(act_day) else None,
            "forecast_avg_mw": float(day["forecast"].mean()) if not day.empty else None,
            "actual_avg_mw": float(act_day.mean()) if len(act_day) else None,
            **m,
        },
        "points": points,
        "vintages": vintages,
    }


@lru_cache(maxsize=1)
def horizon() -> list[dict]:
    targets = pd.concat([pd.Series(pd.date_range(*an.delivery_window(d), freq="1h", inclusive="left"))
                         for d in delivery_dates()], ignore_index=True)
    return an.horizon_curve(data.forecasts(), data.actuals(), targets, range(0, 49))


def meta() -> dict:
    fc = data.forecasts()
    act = data.actuals()
    return {
        "first_delivery_date": delivery_dates()[0].isoformat(),
        "last_delivery_date": delivery_dates()[-1].isoformat(),
        "first_decision_date": FIRST_DECISION_DATE.isoformat(),
        "last_decision_date": LAST_DECISION_DATE.isoformat(),
        "publish_times_utc": sorted(fc["publishTime"].dt.strftime("%H:%M").value_counts()
                                    .loc[lambda s: s > 50].index.tolist()),
        "actual_rows": int(len(act)),
        "forecast_rows": int(len(fc)),
        "source": "Elexon BMRS: FUELHH (fuelType=WIND) and WINDFOR",
    }
