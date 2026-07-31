# Next.js Frontend Migration Plan

This document describes a later frontend migration only. It does not introduce a Next.js application, Node tooling, or new backend routes in the current task.

## Planned Architecture

```text
Next.js frontend
    ↓
FastAPI API
    ↓
TwinStateStore
    ↓
SQLite/PostgreSQL
```

FastAPI remains the authoritative application and agronomy boundary. No agronomy calculations move to TypeScript. The browser must not recompute water balance, select recommendations, classify disease images, run simulations, or generate narration. The Next.js frontend will validate only basic UI input shape, submit API requests, and render API responses. Backend Pydantic validation remains authoritative for accepted inputs, error envelopes, and persistence rules.

The existing Streamlit frontend remains available until the Next.js frontend reaches feature parity.

## Proposed Future Structure

```text
web/
    src/
        app/
            page.tsx
            sessions/
            sessions/[stateId]/
        components/
        features/
            session/
            disease/
            water/
            advancement/
            decisions/
            narration/
            records/
        lib/
            api/
            types/
            validation/
        test/
    public/
    package.json
    next.config.ts
    tsconfig.json
```

## Migration Order

1. Application shell and API client.
2. Session creation/loading.
3. Disease upload and results.
4. Weather and irrigation inputs.
5. Initial water computation.
6. Twin update.
7. One-day advancement.
8. Simulation and recommendation.
9. Narration, history and actual actions.
10. Streamlit removal after parity.

## Daily Advancement Retry Semantics

`POST /sessions/{state_id}/advance-one-day` is idempotent by
`advancement_id`. When `advancement_created` is `false`, the returned ledger
response may describe an earlier successful advancement rather than the
currently authoritative twin. A retry can therefore be an exact current retry,
a catch-up from stale local water state, or a historical retry after newer
water or disease evidence has moved the current twin forward.

Next.js clients must not treat every returned advancement snapshot as current.
For catch-up retries, update local canonical water from the returned water
state, clear simulation, recommendation, and narration outputs, then call
`/sessions/{state_id}/update-twin-state` to refresh the authoritative current
twin. Historical retries should be read-only locally except for retaining the
technical response and showing a reuse notice.

If a catch-up retry updates canonical water before the authoritative twin
refresh completes, the previous twin must be invalidated before the refresh
request. A failed refresh must never leave an older twin displayed as current.
Clients that are missing their current snapshot identity must clear dependent
simulation, recommendation, and narration outputs before recovering the
authoritative twin. Show catch-up success notices only after the refresh
succeeds; otherwise keep the technical retry response and ask the user to retry
the twin update.

## Streamlit Route Inventory

These are the FastAPI endpoints currently used by the legacy Streamlit client. The migration should reuse them rather than inventing replacement routes.

| Method | Route | Current frontend use |
|---|---|---|
| `GET` | `/health` | Backend health check. |
| `GET` | `/system-info` | Runtime/model/system metadata. |
| `POST` | `/sessions` | Create standalone crop twin session. |
| `GET` | `/sessions/{state_id}` | Load current session state. |
| `GET` | `/sessions/{state_id}/history` | Load twin history. |
| `POST` | `/sessions/{state_id}/predict-disease` | Submit disease image evidence. |
| `POST` | `/sessions/{state_id}/compute-water-state` | Compute initial/manual water state. |
| `POST` | `/sessions/{state_id}/advance-one-day` | Submit explicit one-day advancement. |
| `GET` | `/sessions/{state_id}/weather-snapshot` | Fetch one-day Open-Meteo weather for stored location. |
| `POST` | `/sessions/{state_id}/update-twin-state` | Build or reuse current twin snapshot. |
| `POST` | `/sessions/{state_id}/simulate-actions` | Simulate candidate irrigation actions. |
| `POST` | `/sessions/{state_id}/recommend` | Generate deterministic recommendation. |
| `POST` | `/sessions/{state_id}/narrate` | Generate narration for cached recommendation. |
| `POST` | `/sessions/{state_id}/actual-actions` | Record actual physical action. |
| `GET` | `/sessions/{state_id}/actual-actions` | List actual physical actions. |
| `POST` | `/farms` | Create farm. |
| `GET` | `/farms` | List farms. |
| `GET` | `/farms/{farm_id}` | Read farm. |
| `POST` | `/farms/{farm_id}/plots` | Create plot under farm. |
| `GET` | `/farms/{farm_id}/plots` | List plots under farm. |
| `GET` | `/plots/{plot_id}` | Read plot. |
| `POST` | `/plots/{plot_id}/crop-cycles` | Create plot-backed crop cycle/session. |

## Non-Goals For The Migration

The migration must not change deterministic water equations, recommendation authority, disease evidence policy, persistence identity rules, daily-advancement idempotency, or backend error envelopes. Feature parity should be reached before removing Streamlit.
