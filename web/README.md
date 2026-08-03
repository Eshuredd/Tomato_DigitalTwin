# CropTwin Next.js Frontend

This is the CropTwin Next.js frontend migration. It provides the application shell, typed FastAPI client, backend health status, shared active-session state, session creation/loading, disease-image evidence submission/results, weather review, recent irrigation input, deterministic water-state computation, canonical twin-state update, one-day advancement, candidate action simulation, and deterministic recommendation.

The FastAPI backend remains authoritative for agronomy, disease inference, recommendations, narration, validation, and persistence. The legacy Streamlit frontend in `../frontend/` remains operational while the migration proceeds.

## Requirements

- Node.js 22 is recommended through `.nvmrc`; the package requires Node.js `>=20.9`.
- npm is the package manager for this frontend.
- FastAPI should be running separately, normally at `http://127.0.0.1:8000`.

## Configuration

Create `web/.env.local` when you need a non-default API URL:

```bash
NEXT_PUBLIC_CROPTWIN_API_BASE_URL=http://127.0.0.1:8000
```

If the variable is absent, the frontend uses `http://127.0.0.1:8000`. If it is present but empty, whitespace-only, or not an HTTP/HTTPS URL, startup fails with a configuration error. Do not place secrets in `NEXT_PUBLIC_*` variables because they are exposed to the browser.

## Development

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

## Verification

```bash
npm run lint
npm run typecheck
npm run test:run
npm run test:coverage
npm run build
```

## Active Session Flow

Creating a session or loading an existing current session sets the active frontend session. The summary shows state ID, crop type, planting date, location, and soil texture. The state ID can be copied only after pressing the copy button. Clearing the active session clears disease evidence in the browser only.

## Disease Upload Flow

The disease panel is enabled only when an active state ID exists. It accepts one JPEG, PNG, or WebP image up to 10.0 MB, shows local file metadata and an object-URL preview, and converts the file to base64 only immediately before calling `POST /sessions/{state_id}/predict-disease`.

The request body matches the existing FastAPI contract:

```json
{
  "state_id": "active-state-id",
  "image_base64": "raw-base64",
  "model_version": "from /system-info when available, otherwise 1.0"
}
```

Disease evidence is rendered from backend response values. Confidence is shown as a percentage with the raw value in technical details. Uncertainty remains visible, including high-uncertainty and `UNKNOWN` results. Technical details never include uploaded image bytes.

## Weather, Water And Canonical Twin Flow

Weather is retrieved only when the user presses the weather snapshot button. The request uses `GET /sessions/{state_id}/weather-snapshot?target_date=YYYY-MM-DD`; components call the typed API wrapper rather than raw `fetch`.

The fetched snapshot is mapped to the exact backend `WeatherInput` fields and can be edited before water submission. Minimum temperature, maximum temperature, humidity, wind speed and rainfall are required. Sunlight energy and reference ETo are optional; blank values are sent as `null`, allowing the backend to use its configured fallback ETo path when Penman-Monteith inputs are unavailable. Zero rainfall and zero optional values remain valid values. Manual overrides are detected locally for display only and no unsupported `manual_overrides` field is sent to FastAPI.

Fetched weather snapshots default the water computation date to the snapshot `target_date`. If the user later changes the water date, the UI warns that the reviewed weather came from another date and does not automatically fetch another snapshot.

Recent irrigation can be omitted, entered directly in millimetres, converted from litres over area, or converted from drip runtime. Positive events send `LastIrrigationEvent` with a stable event id for the unchanged payload. A zero-depth entry sends no irrigation event. Invalid irrigation input is tracked explicitly and disables water computation instead of being interpreted as no irrigation.

Water computation is submitted only when the user presses the compute button. The request uses `POST /sessions/{state_id}/compute-water-state` with the active state id, current date, reviewed weather, optional irrigation event, and a retry-stable `water_update_id`. First observations omit base water fields; later observations include the latest accepted water observation id and sequence. Weather, water-date and irrigation controls are disabled while a water request is pending; late or changed-payload responses are discarded.

Canonical twin update is submitted only after the active session has accepted disease evidence and accepted water state. The request uses `POST /sessions/{state_id}/update-twin-state` with the exact body `{ "state_id": "active-state-id" }`. The UI captures a stable source signature from the accepted disease and water observations, aborts or discards stale responses after session/source changes, and renders the backend `current_state` without frontend calculations, simulations, recommendations, or action advice. New snapshots show `A new canonical twin snapshot was created.` Reused snapshots show `The canonical twin already reflected the latest accepted observations.`

One-day advancement is submitted only after accepted disease evidence, accepted canonical water lineage, and accepted canonical twin state are present. The browser derives the only allowed target date from `twin.current_state.observed_at + 1 day`, uses the twin timestamp as the canonical water date when transient displayed water has been cleared by later weather review, requires reviewed next-day weather and valid recent-irrigation input, and sends `POST /sessions/{state_id}/advance-one-day` with a stable `advancement_id` for unchanged retries. Fetched weather must be for the derived next date; same-date edits and fully manual weather require explicit acknowledgement, but a wrong-date fetched snapshot remains blocked until weather is retrieved for the required date. Reused advancement responses are treated conservatively: catch-up retries refresh the authoritative twin through `update-twin-state`, current retries preserve newer local twin state, and historical retries remain technical data only.

## Simulation And Recommendation Flow

Candidate action simulation requires an active session and an accepted canonical twin snapshot. All four supported candidate actions are selected by default for a new active session or canonical twin source with no valid accepted simulation: `IRRIGATE_NOW`, `IRRIGATE_IN_6H`, `IRRIGATE_TOMORROW_AM`, and `NO_IRRIGATION_24H`. When accepted simulation metadata proves that a retained simulation belongs to the current state, canonical twin, and accepted action subset, the controls restore that accepted subset across component remounts and equivalent canonical refreshes. The user may submit any non-empty subset explicitly through `POST /sessions/{state_id}/simulate-actions`; the browser sends only `{ "state_id": stateId, "actions": [...] }`. Changing the logical selected-action set after accepting a simulation clears the old simulation, recommendation, and their accepted source metadata without submitting automatically.

Simulation results are deterministic backend projections. The browser validates the response shape, verifies the response `state_id`, checks that returned actions exactly match the submitted set, and renders results in the submitted workflow order. It does not calculate projections, rank actions, choose an action, or automatically request a recommendation.

Deterministic recommendation requires an accepted simulation for the current canonical twin source. It is requested only when the user presses the recommendation button, using `POST /sessions/{state_id}/recommend` without a request body. FastAPI remains authoritative for action selection, irrigation constraints, caution reasons, inspection advisories, validation, persistence, and recommendation caching. The browser stores accepted simulation actions and source signatures separately from pending request metadata, recomputes the current source before enabling recommendation, verifies the response `state_id`, and confirms the chosen action appears in the accepted simulation before storing it.

Decision requests use AbortSignal cancellation, stale-response guards, request IDs, and source signatures. Equivalent canonical twin refreshes preserve valid simulation and recommendation outputs; changed or missing canonical twins clear decision state. New canonical water without a usable canonical twin, including catch-up advancement refresh failure, clears stale decisions. A newly accepted simulation clears the previous recommendation. Unsubmitted weather draft edits do not directly invalidate accepted decision outputs unless they lead to a changed canonical twin source.

## Safety Boundaries

- Disease evidence does not determine irrigation.
- Disease output is not a confirmed diagnosis and does not replace professional agronomic inspection.
- High uncertainty requires visual inspection.
- CropTwin does not provide pesticide, fertiliser, or treatment instructions.

## Remaining Features

Still in Streamlit until later phases:

- Narration, history, and actual actions.
- Farm and plot management.
