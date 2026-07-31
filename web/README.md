# CropTwin Next.js Frontend

This is the Phase 1 Next.js frontend for CropTwin. It provides the application shell, backend health status, session creation/loading foundation, typed API client, and endpoint wrappers for the current FastAPI surface.

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

The client trims trailing slashes and rejects an empty base URL. Do not place secrets in `NEXT_PUBLIC_*` variables because they are exposed to the browser.

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
npm run build
```

Useful during development:

```bash
npm run test
npm run test:coverage
```

## Phase 1 Scope

Implemented:

- App Router shell with Tailwind and small local UI components.
- Health status check with retry and technical API base URL details.
- Session creation form matching `CreateSessionRequest`.
- Load existing session by `state_id`.
- Typed API client, structured error handling, URL encoding, timeout/abort handling, and wrappers for current backend endpoints.

Not implemented yet:

- Disease upload/results workflow.
- Weather and irrigation entry workflow.
- Water-state computation screens.
- Daily advancement screens.
- Twin update, simulation, recommendation, narration, history, and actual-action workflows.
