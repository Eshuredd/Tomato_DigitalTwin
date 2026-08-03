# CropTwin web foundation

Milestone 1 is a fresh Next.js App Router foundation for CropTwin. It contains the custom design system, desktop application shell, route placeholders, typed API transport foundation, generated OpenAPI contract, reusable workflow stepper, shared async states, and automated tests. It does **not** implement feature workflows or claim parity with Streamlit.

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
```

Set `CROPTWIN_OPENAPI_URL` to override the schema URL used by `api:schema:pull`.

## Development and validation

```bash
npm ci
npm run lint
npm run typecheck
npm run test:run
npm run build
npm run test:e2e
```

The parity source of truth is [`../docs/nextjs-parity-checklist.md`](../docs/nextjs-parity-checklist.md).
