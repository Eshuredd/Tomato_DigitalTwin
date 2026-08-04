# CropTwin Next.js application

Milestone 4 adds deterministic water-state computation, canonical twin update, and controlled one-day advancement to the accepted state-ID-scoped workflow. Simulation, recommendation, narration, history, and actual-action workflows remain deferred. Complete parity is not claimed.

## Requirements

- Node.js 22 (`.nvmrc`)
- npm
- FastAPI only when deliberately refreshing the checked-in OpenAPI snapshot

## Configuration

Copy `.env.example` to `.env.local` when a different browser-visible API origin is required:

```bash
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

Never put secrets in `NEXT_PUBLIC_*` variables. Normal builds use the checked-in schema and do not require FastAPI to be running.

## OpenAPI workflow

```bash
npm run api:schema:pull  # explicitly fetch /openapi.json from FastAPI
npm run api:generate     # generate src/lib/api/schema.d.ts from the snapshot
npm run api:check        # verify generated output is current without changing files
npm run api:schema:check # compare the snapshot semantically with app.main.app.openapi()
```

Set `CROPTWIN_OPENAPI_URL` to override the schema URL used by `api:schema:pull`.

`api:check` detects generated-TypeScript drift from the checked-in snapshot. `api:schema:check` is independent: it imports the real FastAPI application without starting a server and detects snapshot drift from the backend contract. Normal builds run neither backend import nor network request.

## Development and validation

```bash
npm ci
npm run lint
npm run typecheck
npm run test:run
npm run build
npm run test:e2e
```

The Playwright configuration starts a test-only launcher that imports the real FastAPI app, uses the in-memory state store, overrides disease inference deterministically, and patches weather retrieval only inside the test process. It does not use or mutate an important persistent database.

## Milestone 4 workflow boundaries

- `/workflow/[stateId]` uses the encoded route parameter as authoritative workflow identity. `/workflow?stateId=…` remains a compatibility entry and redirects to it.
- Disease evidence accepts exactly one JPEG, PNG, or WebP image up to 10 MiB. The image is converted to raw base64 only immediately before submission and is never retained in query state. Results always carry the safety statement “Supporting AI evidence — not a confirmed diagnosis.”
- File name, type, size, and modification time are display metadata rather than durable image identity. Every new image-selection attempt conservatively supersedes accepted evidence and invalidates dependent reviewed weather and irrigation, even when those metadata values match.
- Weather retrieval is user-triggered and date-specific. Fetched values can be reviewed with visible overrides or replaced by clearly labelled fully manual input. Either mode requires an explicit “Accept reviewed weather” action.
- Pending weather retrievals use a component-local request generation and draft revision. A later date, field, or provenance edit wins and cannot be overwritten by an older response; repeated retrievals apply only the latest eligible response.
- Irrigation input can represent no recent irrigation, direct depth, litres divided by area, or drip runtime. The permitted conversions are `amount_mm = total_litres / irrigated_area_m2` and `total_litres = emitter_count * emitter_flow_lph * (runtime_minutes / 60)`; full precision is retained.
- Accepted reviewed weather and irrigation values are route-scoped unsaved drafts. They are prepared for later water-state computation, are not persisted to FastAPI, and become stale when their source fields change.
- A canonical recursively sorted JSON signature omits undefined fields and drives route-memory UUID reuse. Exact retries reuse `water_update_id`, `irrigation_event_id`, or `advancement_id`; a semantic payload change creates a new identity. None are stored in `localStorage`.
- No-irrigation sends `null`. Explicit zero materializes a real event and stays distinct. Initial-water and next-day advancement events use separate identity lifecycles.
- The first water request omits both baseline fields. A later computation supplies the exact returned observation ID and positive sequence together; the browser never increments or fabricates lineage.
- Twin update sends only `state_id`. Newly created and idempotently reused snapshots are labelled separately, and session refresh is deliberately invalidated after success without replacing the richer twin result.
- Advancement preparation has a locked next UTC calendar date plus separate explicitly accepted weather and irrigation drafts. New/current/catch-up/historical results are classified before query data is updated; a failed catch-up twin refresh preserves the newer water result as partial success.

## Milestone 2 form and identity boundaries

- Latitude and longitude are required finite numbers. HTML numeric strings are trimmed and parsed before their inclusive coordinate bounds are checked; blank, null, non-numeric, and non-finite values are rejected.
- Elevation is optional. Blank, whitespace-only, null, or undefined form values are omitted from JSON, while an explicit zero is retained and values below -500 m are rejected.
- Date-input defaults use the browser's local calendar year, month, and day rather than a UTC ISO date.
- A cycle `stateId` is authoritative route identity. `plotId` and `mode` query values are optional browser navigation context only because current FastAPI session responses do not expose durable farm or plot relationships.

The parity source of truth is [`../docs/nextjs-parity-checklist.md`](../docs/nextjs-parity-checklist.md).
