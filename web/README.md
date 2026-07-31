# CropTwin Next.js Frontend

This is the Phase 2 Next.js frontend for CropTwin. It provides the application shell, typed FastAPI client, backend health status, shared active-session state, session creation/loading, and disease-image evidence submission/results.

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
  "model_version": "1.0"
}
```

Disease evidence is rendered from backend response values. Confidence is shown as a percentage with the raw value in technical details. Uncertainty remains visible, including high-uncertainty and `UNKNOWN` results. Technical details never include uploaded image bytes.

## Safety Boundaries

- Disease evidence does not determine irrigation.
- Disease output is not a confirmed diagnosis and does not replace professional agronomic inspection.
- High uncertainty requires visual inspection.
- CropTwin does not provide pesticide, fertiliser, or treatment instructions.

## Remaining Features

Still in Streamlit until later phases:

- Weather and irrigation inputs.
- Initial water computation.
- Twin update.
- One-day advancement.
- Simulation and recommendation.
- Narration, history, and actual actions.
- Farm and plot management.
