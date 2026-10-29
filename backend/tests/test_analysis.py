from datetime import date, time

import pandas as pd
import pytest

from app import analysis as an


def ts(s: str) -> pd.Timestamp:
    return pd.Timestamp(s, tz="UTC")


def make_fc(rows):
    df = pd.DataFrame(rows, columns=["publishTime", "startTime", "generation"])
    df["publishTime"] = pd.to_datetime(df["publishTime"], utc=True)
    df["startTime"] = pd.to_datetime(df["startTime"], utc=True)
    df["lead_h"] = (df["startTime"] - df["publishTime"]).dt.total_seconds() / 3600
    return df


def test_decision_cutoff_is_d_minus_1():
    assert an.decision_cutoff(date(2026, 1, 15), time(9, 0)) == ts("2026-01-14 09:00")


def test_forecast_as_of_takes_latest_publish_before_cutoff():
    fc = make_fc([
        ("2026-01-14 04:30", "2026-01-15 10:00", 100),
        ("2026-01-14 07:30", "2026-01-15 10:00", 200),  # latest before 09:00 -> used
        ("2026-01-14 09:30", "2026-01-15 10:00", 999),  # after the cutoff -> must not leak
    ])
    start, end = an.delivery_window(date(2026, 1, 15))
    out = an.forecast_as_of(fc, ts("2026-01-14 09:00"), start, end)
    assert out["forecast"].tolist() == [200]
    assert out["publishTime"].iloc[0] == ts("2026-01-14 07:30")


def test_forecast_as_of_ignores_targets_outside_the_day():
    fc = make_fc([
        ("2026-01-14 07:30", "2026-01-14 23:00", 1),
        ("2026-01-14 07:30", "2026-01-15 00:00", 2),
        ("2026-01-14 07:30", "2026-01-16 00:00", 3),
    ])
    start, end = an.delivery_window(date(2026, 1, 15))
    out = an.forecast_as_of(fc, ts("2026-01-14 09:00"), start, end)
    assert out["forecast"].tolist() == [2]


def test_forecast_min_lead_respects_the_horizon():
    fc = make_fc([
        ("2026-01-15 02:30", "2026-01-15 10:00", 10),  # 7.5 h ahead
        ("2026-01-15 07:30", "2026-01-15 10:00", 20),  # 2.5 h ahead
    ])
    out = an.forecast_min_lead(fc, 4, pd.Series([ts("2026-01-15 10:00")]))
    assert out["forecast"].tolist() == [10]


def test_error_sign_positive_means_shortfall():
    fc = pd.DataFrame({"startTime": [ts("2026-01-15 10:00")], "forecast": [12000.0]})
    act = pd.DataFrame({"startTime": [ts("2026-01-15 10:00")], "generation": [10000.0]})
    assert an.with_actuals(fc, act)["error"].tolist() == [2000.0]


def test_metrics():
    m = an.metrics(pd.Series([100.0, -100.0, 300.0]), pd.Series([1000.0, 1000.0, 1000.0]))
    assert m["mae_mw"] == pytest.approx(500 / 3)
    assert m["bias_mw"] == pytest.approx(100)
    assert m["rmse_mw"] == pytest.approx((110000 / 3) ** 0.5)
    assert m["nmae_pct"] == pytest.approx(100 * (500 / 3) / 1000)


def test_trailing_bias_uses_only_settled_days():
    # Day D gets the mean error of D-2 .. D-8. D-1 is still being delivered
    # when the decision is made, so it must not be used.
    days = [date(2026, 1, d) for d in range(1, 11)]
    paired = pd.DataFrame({"delivery_date": days, "error": [float(d.day) for d in days]})
    bias = an.trailing_bias(paired, lookback_days=7)
    assert bias[date(2026, 1, 10)] == pytest.approx(sum(range(2, 9)) / 7)  # days 2..8
    assert bias[date(2026, 1, 3)] == pytest.approx(1.0)  # only day 1 is settled
    assert bias[date(2026, 1, 1)] == 0.0  # nothing to learn from yet


def test_apply_bias_shifts_forecast_and_error():
    paired = pd.DataFrame({"delivery_date": [date(2026, 1, 5)], "forecast": [1000.0], "actual": [900.0], "error": [100.0]})
    out = an.apply_bias(paired, {date(2026, 1, 5): 100.0})
    assert out["forecast"].tolist() == [900.0]
    assert out["error"].tolist() == [0.0]
