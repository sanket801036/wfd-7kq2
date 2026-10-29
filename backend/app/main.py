"""HTTP API for the wind forecast desk."""
from __future__ import annotations

from datetime import date, datetime, time

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from . import service
from .config import DEFAULT_DECISION_TIME

app = FastAPI(
    title="Wind Forecast Desk API",
    description="Day-ahead wind forecast selection and accuracy for GB, January 2026 decisions.",
    version="1.0.0",
)
# The UI is served from the same origin in production; this is for local dev.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])


def _parse_time(value: str) -> time:
    try:
        return datetime.strptime(value, "%H:%M").time()
    except ValueError:
        raise HTTPException(422, "decision_time must be HH:MM, for example 09:00")


def _check_delivery_date(d: date) -> None:
    days = service.delivery_dates()
    if not days[0] <= d <= days[-1]:
        raise HTTPException(422, f"delivery_date must be between {days[0]} and {days[-1]}")


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/meta")
def meta() -> dict:
    return {**service.meta(), "default_decision_time": DEFAULT_DECISION_TIME.strftime("%H:%M")}


@app.get("/api/day")
def day(
    delivery_date: date,
    decision_time: str = Query(DEFAULT_DECISION_TIME.strftime("%H:%M")),
    bias_correct: bool = False,
) -> dict:
    _check_delivery_date(delivery_date)
    return service.day_view(delivery_date, _parse_time(decision_time), bias_correct)


@app.get("/api/accuracy")
def accuracy(
    decision_time: str = Query(DEFAULT_DECISION_TIME.strftime("%H:%M")),
    bias_correct: bool = False,
) -> dict:
    return service.accuracy(_parse_time(decision_time), bias_correct)


@app.get("/api/horizon")
def horizon() -> list[dict]:
    return service.horizon()
