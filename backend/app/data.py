"""Load the Elexon snapshot into tidy DataFrames (UTC timestamps, MW values)."""
from __future__ import annotations

from functools import lru_cache

import pandas as pd

from .config import DATA_DIR


def _read(name: str, time_cols: list[str]) -> pd.DataFrame:
    df = pd.read_json(DATA_DIR / name)
    for col in time_cols:
        df[col] = pd.to_datetime(df[col], utc=True)
    return df


@lru_cache(maxsize=1)
def actuals() -> pd.DataFrame:
    """Half-hourly metered wind generation: columns startTime, generation."""
    df = _read("actuals.json", ["startTime"])
    return df.sort_values("startTime").reset_index(drop=True)


@lru_cache(maxsize=1)
def forecasts() -> pd.DataFrame:
    """Every published hourly wind forecast: publishTime, startTime, generation, lead_h.

    Each publish also restates a few hours that are already in the past. Those
    rows are not forecasts (nobody could have acted on them), so they are
    dropped here, once, rather than in every query.
    """
    df = _read("forecasts.json", ["publishTime", "startTime"])
    df = df[df["startTime"] >= df["publishTime"]].copy()
    df["lead_h"] = (df["startTime"] - df["publishTime"]).dt.total_seconds() / 3600
    return df.sort_values(["startTime", "publishTime"]).reset_index(drop=True)
