# CropTwin Streamlit Frontend

This folder contains the optional Streamlit interface for the CropTwin FastAPI backend. The frontend is only an HTTP client: it does not recompute agronomy, disease confidence, simulation outcomes, recommendations, or narration.

## Design

The interface uses a compact dark agriculture dashboard style. The sidebar keeps connection status, load/reset controls, and technical settings visible without duplicating the main workflow tabs.

## Install

```powershell
python -m pip install -r backend/requirements.txt
python -m pip install -r frontend/requirements.txt
```

## Run

Start the API from the repository root:

```powershell
uvicorn app.main:app --reload --app-dir backend
```

You can also run `cd backend` first, then `uvicorn app.main:app --reload`.

Start the frontend in another terminal:

```powershell
streamlit run frontend/app.py
```

By default the frontend calls `http://127.0.0.1:8000`. Override it with:

```powershell
$env:CROPTWIN_API_BASE_URL = "http://127.0.0.1:8000"; streamlit run frontend/app.py
```

The same base URL can also be edited in the Streamlit sidebar.

In Docker, Supervisor launches Streamlit with `--server.address 0.0.0.0` and `--server.port ${PORT:-7860}`. Local Streamlit CLI runs usually use Streamlit's default port unless you pass `--server.port`.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `CROPTWIN_API_BASE_URL` | `http://127.0.0.1:8000` | FastAPI target used by the frontend HTTP client. |
| `PORT` | `7860` in Docker fallback | Public Streamlit port used by the container supervisor and health check. |

## Workflow

1. Create or load a CropTwin session.
2. Upload a tomato leaf image for disease evidence.
3. Fetch Open-Meteo weather or review/edit weather values manually, then enter optional irrigation inputs to compute water state.
4. Update the canonical twin state.
5. Simulate candidate irrigation actions.
6. Generate the deterministic recommendation.
7. Generate narration and inspect session history.

The disease inference request uses a longer timeout because model loading and first inference can be slower than ordinary API calls.

Session creation fetches elevation automatically from Open-Meteo when the elevation override is disabled. The lookup uses the latitude and longitude entered in the form; the location name is stored as a label and is not geocoded.

Recent irrigation can be entered as direct depth, total litres over an irrigated area, or drip runtime with emitter details. The frontend converts farmer-friendly inputs into the backend's canonical millimetre depth.

For each unchanged water-state submission, the frontend generates one standard-library UUID as `water_update_id` and retains it in Streamlit session state across automatic reruns, timeouts, and temporary API errors. Changing the selected date, weather payload, or irrigation inputs invalidates that retained ID; the "New observation" command clears it explicitly. The raw ID is available only in the collapsed technical response JSON.

Water-state results now display observed time, CropTwin computation time, current root-zone deficit, unallocated excess water, and deficit beyond assumed total available water. The Streamlit workflow continues to submit date-only water observations unless extended by a caller, so the API marks those observations as `DATE_ONLY_UTC_START`.

If the API reports that a submitted irrigation event was already accounted for, the frontend shows an informational note that 0 mm from that event was applied to the current update.

Farm and Plot management endpoints exist in the backend API, but this frontend remains focused on the existing session workflow. Session and history data can persist through the configured backend store; the frontend itself does not store backend state.
