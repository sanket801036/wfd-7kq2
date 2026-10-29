"""Scope and defaults in one place, so the rules the analysis depends on are easy to find."""
from datetime import date, time
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

# Purchase decisions made in January 2026. A decision on day D-1 buys for
# delivery day D, so the delivery days are 2 Jan .. 1 Feb 2026.
FIRST_DECISION_DATE = date(2026, 1, 1)
LAST_DECISION_DATE = date(2026, 1, 31)

# When the team commits its day-ahead position on D-1. Configurable per
# request; 09:00 is a sensible default ahead of the morning auctions.
# In January the UK is on GMT, so UK local time equals UTC.
DEFAULT_DECISION_TIME = time(9, 0)

# Bias correction learns from the decision forecasts of the previous N
# delivery days whose actuals are complete before the decision is made.
BIAS_LOOKBACK_DAYS = 7

SETTLEMENT_PERIOD_MINUTES = 30
