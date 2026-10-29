# Wind Forecast Desk

A web app for a UK utility's day-ahead trading desk. For any delivery day it shows **the national wind forecast that was actually available when the purchase had to be decided**, and it measures **how accurate those forecasts were** across January 2026, so the desk can size the extra power it buys.

**Live app:** https://wfd-7kq2.vercel.app  ·  **API docs:** https://wfd-7kq2.vercel.app/api/docs

Data: Elexon BMRS — actual wind generation ([FUELHH](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream), `fuelType = WIND`) and wind forecasts ([WINDFOR](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream)). Nothing else.

## What it does

| Page | Question it answers |
| --- | --- |
| **Day-ahead decision** | "It's 09:00 on D-1. What does the latest forecast say about tomorrow, and how much wind can I count on?" Pick a delivery day and decision time; the chart shows the forecast in hand, an 80% range learned from recent errors, and (optionally) what actually happened. |
| **Forecast accuracy** | "How wrong is that forecast, and when?" MAE, RMSE, bias, P90 shortfall and share of hours within ±1 GW, plus error by day, by hour of day, by lead time and as a distribution. |
| **How it works** | The rules behind the numbers, in plain language. |

### Key findings for January 2026 (decision at 09:00 on D-1)

- The raw WINDFOR forecast ran **~1.75 GW above metered output on average** (MAE 2.02 GW, 17.9% of mean output).
- Subtracting the mean error of the previous 7 settled days — using only data available at decision time — cuts **MAE by ~21% to 1.61 GW** and brings the bias close to zero.
- Accuracy degrades with lead time: MAE rises from ~1.7 GW for the freshest forecast to ~2.3 GW at 48 h ahead.
- A likely contributor to the bias is curtailment: FUELHH is metered output, so wind turned down for grid constraints never appears as generation. These two datasets cannot confirm the cause, so the app corrects for the bias without assuming one.

## How the forecast is chosen

For delivery day **D** and decision time **T** (UK local; equal to UTC in January):

1. Cutoff = `D-1 T`. Only forecasts with `publishTime <= cutoff` are visible.
2. For each hour of D, use the **latest** visible publish.
3. Rows where `startTime < publishTime` are dropped: they restate the past and nobody could act on them.
4. Compare with actuals at the hourly points both datasets share (forecasts are hourly, actuals half-hourly). `error = forecast − actual`, so positive means a shortfall to cover.

Scope: decisions made **1–31 January 2026**, i.e. delivery days **2 Jan – 1 Feb 2026** (744 hourly points). About two weeks of December data are loaded only to warm up the bias correction and the uncertainty band, which look back at already-settled days (D-2 and earlier; D-1 is still being delivered at decision time).

## Repository layout

```
.
├── backend/                  Python API (FastAPI)
│   ├── app/
│   │   ├── config.py         scope, defaults and look-back windows
│   │   ├── data.py           loads the snapshot, drops non-forecast rows
│   │   ├── analysis.py       forecast selection, bias correction, metrics (pure functions)
│   │   ├── service.py        builds API payloads from data + analysis
│   │   └── main.py           HTTP routes and input validation
│   ├── data/                 Elexon snapshot (actuals.json, forecasts.json)
│   ├── scripts/fetch_data.py re-downloads the snapshot from Elexon
│   ├── tests/                unit tests (analysis) and API tests (on the snapshot)
│   ├── Dockerfile
│   └── requirements*.txt
├── frontend/                 React + TypeScript (Vite, Tailwind, Recharts)
│   ├── src/
│   │   ├── api.ts            typed API client — the only place that calls the backend
│   │   ├── components/       DayView, AccuracyView, Method, shared ui
│   │   ├── format.ts         GW / GWh / time formatting
│   │   └── useApi.ts         small data-fetching hook
│   ├── nginx.conf            serves the build and proxies /api in Docker
│   └── Dockerfile
├── api/index.py              Vercel serverless entry point for the FastAPI app
├── vercel.json               Vercel build + routing
├── requirements.txt          Python deps for the Vercel function
├── docker-compose.yml        runs API + web together
└── .github/workflows/ci.yml  tests, lint and build on every push
```

### API

| Endpoint | Returns |
| --- | --- |
| `GET /api/meta` | scope, publish times, row counts |
| `GET /api/day?delivery_date=2026-01-15&decision_time=09:00&bias_correct=true` | the day's forecast in hand, 80% band, actuals, every forecast version |
| `GET /api/accuracy?decision_time=09:00&bias_correct=false` | January metrics, by day / hour / lead time, error histogram |
| `GET /api/horizon` | MAE, RMSE and bias against minimum lead time (0–48 h) |

Interactive docs (Swagger) at `/api/docs`, locally and on the live app.

## Running it

**Docker (API + web):**

```bash
docker compose up --build
# UI  http://localhost:8080
# API http://localhost:8000/api/docs
```

**Without Docker:**

```bash
cd backend
pip install -r requirements.txt -r requirements-dev.txt
python -m pytest -q                     # 12 tests
uvicorn app.main:app --port 8000

cd frontend                             # in a second terminal
npm ci
npm run dev                             # http://localhost:5173, proxies /api to :8000
```

**Refresh the data snapshot** (optional — the committed snapshot is what the app serves):

```bash
cd backend && python -m scripts.fetch_data
```

**Deploy to Vercel:** import the repository in Vercel and deploy with the defaults; `vercel.json` builds the frontend and exposes the API as a Python function under `/api`. Or with the CLI: `npx vercel --prod`.

## Design choices

- **Snapshot, not live calls.** January 2026 is history, so the API serves a committed snapshot: fast, reproducible, and the demo cannot break because Elexon is slow. `fetch_data.py` rebuilds it.
- **No look-ahead anywhere.** The forecast, the bias correction and the uncertainty band only use information available at the decision cutoff. Tests pin this down.
- **Pure analysis functions.** `analysis.py` takes DataFrames and returns DataFrames or dicts, so the rules are tested with tiny hand-made tables.
- **One sign convention.** `forecast − actual` everywhere; positive is a shortfall the desk must buy.
- **Same-origin API.** The UI calls `/api/...` in every environment (Vite proxy in dev, nginx in Docker, a rewrite on Vercel), so there is no environment-specific configuration.

## Limitations and next steps

- National totals only; no regional split or capacity normalisation.
- The uncertainty band uses empirical error quantiles from a 14-day window; a longer history or quantile regression on lead time would be more stable.
- Bias correction is a single offset per day; correcting by lead time or hour of day is a natural next step.
- Demand is out of scope, so the app sizes wind uncertainty rather than the full purchase volume.

## Use of AI tools

This project was built with the help of **Claude Code (Anthropic)** as an AI pair programmer: scaffolding, drafting code and tests, and reviewing the analysis. I directed the approach, checked the data and results, and am responsible for the code.
