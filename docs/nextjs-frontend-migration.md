# Next.js Frontend Migration Plan

This document tracks the staged migration from the legacy Streamlit UI to a Next.js frontend. Phase 5 introduces deterministic one-day advancement after accepted disease evidence, canonical water state, and canonical twin state while keeping FastAPI as the authoritative backend.

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

Backend changes are deferred until Next.js reaches full Streamlit feature parity unless an existing API contract makes a frontend workflow impossible.

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

1. Application shell and API client. **Implemented.**
2. Session creation/loading. **Implemented.**
3. Disease upload and results. **Implemented.**
4. Weather and irrigation inputs. **Implemented.**
5. Initial/manual water computation. **Implemented.**
6. Twin update. **Implemented.**
7. One-day advancement. **Implemented.**
8. Simulation and recommendation. **Not implemented.**
9. Narration, history and actual actions. **Not implemented.**
10. Streamlit removal after parity. **Not implemented.**

## Phase 1 Through 5 Implementation Notes

The `web/` app uses Next.js App Router, TypeScript, Tailwind, npm, `src/`, and the `@/*` import alias. It includes no separate Git repository and no generated demo app content.

The API client is hand-typed for this phase rather than generated from OpenAPI. This keeps the initial migration small while preserving explicit TypeScript contracts for the current Pydantic request and response shapes. Generated types can be reconsidered once the frontend reaches broader workflow coverage and the backend OpenAPI contract is stable enough to make code generation valuable.

`NEXT_PUBLIC_CROPTWIN_API_BASE_URL` configures the browser-visible FastAPI base URL and defaults to `http://127.0.0.1:8000`. It is intentionally public configuration only; secrets must not be added to `NEXT_PUBLIC_*` values.

The frontend wrappers cover the existing backend routes listed below, but the current UI calls only `/health`, `/system-info`, `POST /sessions`, `GET /sessions/{state_id}`, `POST /sessions/{state_id}/predict-disease`, `GET /sessions/{state_id}/weather-snapshot`, `POST /sessions/{state_id}/compute-water-state`, `POST /sessions/{state_id}/update-twin-state`, and `POST /sessions/{state_id}/advance-one-day`. Simulation, recommendation, narration, history, and actual-action screens are intentionally left for later phases.

Phase 2 adds a small React reducer/context boundary for active session state and disease evidence. Phase 3 extends that state to system info, weather snapshots, reviewed weather drafts, water responses, and latest water lineage ids. Phase 4 adds canonical twin response state, twin request metadata, and loaded-current-state display separation. Phase 5 adds advancement request metadata, retained reused/historical advancement responses, and transition notices. It does not add Redux, React Query, URL persistence, localStorage persistence, or a frontend database.

Disease image bytes are kept in component-local browser state only. The preview uses an object URL that is revoked when the file changes or the component unmounts. Base64 conversion happens only immediately before the FastAPI disease request and is not stored in workflow state.

Disease requests use the model version from `/system-info` when available and fall back to the documented compatibility value only when metadata is unavailable or malformed.

Weather snapshots are fetched only on user action and are mapped to backend `WeatherInput` fields before review. The browser requires temperature, humidity, wind speed and rainfall. Sunlight energy and reference ETo are nullable backend inputs; blank reviewed values are sent as `null`, zero is preserved as zero, and malformed or non-finite values invalidate the local draft. The browser does not calculate or choose the ETo method. When sunlight energy is unavailable, the backend may use its configured Hargreaves-Samani fallback instead of Penman-Monteith. Manual overrides are detected locally but not sent as a backend field. Weather or irrigation changes invalidate the displayed water response.

Fetched weather is date-specific. Accepting a snapshot records its `target_date` and defaults the water computation date to that same date. If a user deliberately changes the water date while keeping the reviewed weather values, the UI warns that the reviewed weather originated from another date and does not silently represent it as same-day fetched weather.

Recent irrigation validity is explicit. No-irrigation mode sends no event, valid zero-depth entries send no event with a distinct local signature, and invalid conversion details disable water computation instead of being interpreted as no irrigation. Positive irrigation events retain their event ID across unchanged retries; changing timestamp, amount or source creates a new event ID. Switching active sessions resets the irrigation form and parent request state to valid no-irrigation.

Initial water-state requests use a stable `water_update_id` for unchanged payload retries, omit base water fields for the first observation, and include the latest accepted water observation id and sequence for subsequent initial/manual observations. Weather, reviewed weather, water date and irrigation controls are disabled while the water computation is pending. The request captures a stable logical payload signature, state ID and request ID; late responses, stale-state responses, changed-payload responses, and mismatched backend `state_id` values are discarded. Weather and water requests use the API client's abort/timeout path. The browser renders the returned deterministic water state and lineage values; it does not compute ETo, ETc, water balance, simulations, recommendations, or narration.

Canonical twin update requires an active session, accepted disease evidence, and accepted water state. The browser submits `POST /sessions/{state_id}/update-twin-state` with the exact `{ state_id }` body and renders the backend `current_state` from `UpdateTwinStateResponse`. It keeps `SessionStateResponse.current_state` separate from the full twin update response because loaded sessions do not provide snapshot metadata. Twin update captures the request ID, state ID, and a stable source signature from the accepted disease and water observations; responses are aborted or discarded after session, disease, or water changes. New snapshots show `A new canonical twin snapshot was created.` Reused snapshots show `The canonical twin already reflected the latest accepted observations.` The browser does not fabricate snapshot IDs, calculate twin fields, run simulations, choose recommendations, or clear downstream workflows that are not yet migrated.

One-day advancement requires an active session, accepted disease evidence, accepted canonical water lineage, accepted canonical twin, reviewed weather for the derived next date, valid recent-irrigation input, and no conflicting pending request. The browser derives the target date from `twin.current_state.observed_at` plus one calendar day and does not expose arbitrary target-date selection. Fetched weather must match the required date and unchanged fetched values; edited or manually entered weather requires explicit acknowledgement. Advancement requests use stable payload signatures and reuse the same `advancement_id` for unchanged user-triggered retries. The browser validates the `AdvanceOneDayResponse`, displays created versus reused status, and applies retry transitions conservatively: new advancements replace canonical water and twin, catch-up retries replace water then refresh the authoritative twin, current retries preserve newer local twin state, historical retries remain technical-only, and malformed sequence metadata is never accepted as valid canonical state. The browser does not run simulation, recommendation, narration, history, or actual-action workflows.

Browser-level Playwright coverage is not part of Phase 1 through Phase 5. The current frontend test boundary is Vitest, jsdom, React Testing Library, API-client unit coverage, reducer tests, and pure conversion/signature tests.

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
