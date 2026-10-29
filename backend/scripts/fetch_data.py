"""Download the Elexon BMRS data the app needs and save it as a snapshot.

Scope: purchase decisions made in January 2026. A decision on day D-1 buys
power for delivery day D, so we need
  * actual wind generation (FUELHH, fuelType=WIND) for delivery days
    2 Jan - 1 Feb 2026, and
  * every wind forecast (WINDFOR) published up to the end of 31 Jan 2026
    (the forecast in hand at a decision on 1 Jan may have been published
    the evening before),
plus about two weeks of history before January, used only to warm up the
bias correction and the uncertainty band.

The app reads the snapshot instead of calling Elexon on every request, so the
demo is fast and reproducible. Re-run this script to refresh it:

    python -m scripts.fetch_data
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

BASE = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
DATA_DIR = Path(__file__).resolve().parents[1] / "data"

# Wide enough on both sides; the app trims to the exact decision window.
# The extra fortnight before January only warms up the bias correction and
# the uncertainty band, which look back at already-settled days.
ACTUALS_FROM = datetime(2025, 12, 16, tzinfo=timezone.utc)
ACTUALS_TO = datetime(2026, 2, 3, tzinfo=timezone.utc)
FORECASTS_FROM = datetime(2025, 12, 14, tzinfo=timezone.utc)
FORECASTS_TO = datetime(2026, 2, 2, tzinfo=timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _get(client: httpx.Client, url: str, params: dict) -> list[dict]:
    for attempt in range(4):
        try:
            r = client.get(url, params=params, timeout=60)
            r.raise_for_status()
            return r.json()
        except httpx.HTTPError:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)
    return []


def _fetch_daily(client: httpx.Client, dataset: str, start: datetime, end: datetime, extra: dict) -> list[dict]:
    """Fetch one publish-day at a time: small requests, easy to retry."""
    rows: list[dict] = []
    day = start
    while day < end:
        nxt = min(day + timedelta(days=1), end)
        params = {"publishDateTimeFrom": _iso(day), "publishDateTimeTo": _iso(nxt), **extra}
        rows.extend(_get(client, f"{BASE}/{dataset}/stream", params))
        day = nxt
    return rows


def _dedupe(rows: list[dict], key: tuple[str, ...]) -> list[dict]:
    # Day windows share their boundary instant, so the same row can arrive twice.
    seen: dict[tuple, dict] = {}
    for r in rows:
        seen[tuple(r[k] for k in key)] = r
    return sorted(seen.values(), key=lambda r: tuple(r[k] for k in key))


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with httpx.Client() as client:
        actual = _fetch_daily(client, "FUELHH", ACTUALS_FROM, ACTUALS_TO, {"fuelType": "WIND"})
        actual = [
            {"startTime": r["startTime"], "generation": r["generation"]}
            for r in actual
            if r.get("fuelType") == "WIND"
        ]
        actual = _dedupe(actual, ("startTime",))

        forecast = _fetch_daily(client, "WINDFOR", FORECASTS_FROM, FORECASTS_TO, {})
        forecast = [
            {"publishTime": r["publishTime"], "startTime": r["startTime"], "generation": r["generation"]}
            for r in forecast
        ]
        forecast = _dedupe(forecast, ("publishTime", "startTime"))

    (DATA_DIR / "actuals.json").write_text(json.dumps(actual))
    (DATA_DIR / "forecasts.json").write_text(json.dumps(forecast))
    print(f"actuals: {len(actual)} rows, forecasts: {len(forecast)} rows -> {DATA_DIR}")


if __name__ == "__main__":
    main()
