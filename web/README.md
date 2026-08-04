# CropTwin Next.js application

Milestone 2 adds browser-visible FastAPI health and system metadata, farms, plots, standalone sessions, plot-backed crop cycles, and explicit active-session routes to the accepted foundation. Disease, water, advancement, simulation, recommendation, narration, history, and actual-action workflows remain deferred. Complete parity is not claimed.

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

The Playwright configuration starts FastAPI with the in-memory state store. It does not use or mutate an important persistent database.

## Milestone 2 form and identity boundaries

- Latitude and longitude are required finite numbers. HTML numeric strings are trimmed and parsed before their inclusive coordinate bounds are checked; blank, null, non-numeric, and non-finite values are rejected.
- Elevation is optional. Blank, whitespace-only, null, or undefined form values are omitted from JSON, while an explicit zero is retained and values below -500 m are rejected.
- Date-input defaults use the browser's local calendar year, month, and day rather than a UTC ISO date.
- A cycle `stateId` is authoritative route identity. `plotId` and `mode` query values are optional browser navigation context only because current FastAPI session responses do not expose durable farm or plot relationships.

The parity source of truth is [`../docs/nextjs-parity-checklist.md`](../docs/nextjs-parity-checklist.md).
