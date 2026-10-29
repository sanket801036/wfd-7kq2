"""End-to-end checks against the committed January 2026 snapshot."""
import pandas as pd
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_meta_scope():
    m = client.get("/api/meta").json()
    assert m["first_delivery_date"] == "2026-01-02"
    assert m["last_delivery_date"] == "2026-02-01"


def test_day_view_never_uses_a_forecast_published_after_the_decision():
    d = client.get("/api/day", params={"delivery_date": "2026-01-15", "decision_time": "09:00"}).json()
    assert pd.Timestamp(d["forecast_published_at"]) <= pd.Timestamp(d["decision_at"])
    assert len(d["points"]) == 48  # half-hourly delivery day


def test_bias_correction_improves_january_mae():
    raw = client.get("/api/accuracy").json()["overall"]
    corrected = client.get("/api/accuracy", params={"bias_correct": True}).json()["overall"]
    assert corrected["mae_mw"] < raw["mae_mw"]
    assert raw["count"] == corrected["count"] == 31 * 24


def test_input_validation_messages():
    assert client.get("/api/day", params={"delivery_date": "2026-03-01"}).status_code == 422
    r = client.get("/api/accuracy", params={"decision_time": "9am"})
    assert r.status_code == 422
    assert "HH:MM" in r.json()["detail"]
