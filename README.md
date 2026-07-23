# CropTwin

**Tomato Irrigation and Disease Digital Twin**

Deterministic agronomy with AI-assisted disease evidence.

CropTwin is a FastAPI-based tomato-crop digital twin for local or internal MVP demonstration. It combines deterministic crop-water reasoning with a locally stored MobileNetV3-Small tomato-leaf classifier. The classifier contributes disease evidence; the deterministic agronomy engine remains the authority for irrigation recommendations.

CropTwin does not treat model output as a confirmed diagnosis, and it does not replace field inspection or professional agronomic advice.

| Component | Status |
|---|---|
| FastAPI backend | Implemented |
| Deterministic water balance | Implemented |
| Tomato disease classifier | Implemented |
| Temperature calibration | Implemented |
| Streamlit frontend | Implemented |
| Automated tests | Implemented |
| Persistent database | Implemented |
| Public deployment | Not yet implemented |

## Key Capabilities

- Tomato session creation with location, planting date, and soil texture.
- Open-Meteo elevation lookup when session elevation is omitted.
- Open-Meteo daily weather retrieval for the active farm location, with manual overrides.
- Tomato growth-stage determination from planting date.
- ETo calculation with Penman-Monteith and Hargreaves-Samani fallback.
- ETc, root-zone depletion, moisture-state, and stress-band estimation.
- Farmer-friendly irrigation input using depth, litres over area, or drip runtime details.
- Tomato-leaf image classification with calibrated confidence and uncertainty bands.
- Current digital-twin state creation from cached disease, growth, and water outputs.
- Candidate irrigation-action simulation.
- Deterministic irrigation recommendation with disease-related caution and inspection advisory.
- Farmer-readable narration of an already-selected recommendation.
- Session history.
- Streamlit workflow interface.
- Direct FastAPI, Swagger, and ReDoc access.

## Problem Statement

Irrigation decisions often depend on disconnected data: crop stage, weather, soil assumptions, recent irrigation, and visible plant symptoms. Disease symptoms can matter for irrigation caution, especially leaf-wetness risk, but a probabilistic image classifier should not directly control irrigation.

CropTwin separates those responsibilities. Physical and agronomic calculations are deterministic. Disease inference supplies supporting evidence and uncertainty. The recommendation engine chooses irrigation actions from water-state and simulation outputs, with disease evidence used only for caution, constraints, and inspection advice.

## Architecture

```mermaid
flowchart TD
    UI[Streamlit frontend] --> API[FastAPI routes]
    API --> STORE[TwinStateStore protocol]
    STORE --> SQL[SQLAlchemy persistent store]
    STORE --> MEM[In-memory test/dev store]
    SQL --> FARM[Farm]
    FARM --> PLOT[Plot]
    PLOT --> CYCLE[Crop Cycle / Session]
    CYCLE --> OBS[Observations]
    OBS --> SNAP[Immutable Twin State Snapshots]
    SNAP --> SIM[Simulations]
    SIM --> REC[Recommendations]
    CYCLE --> ACTUAL[Actual Actions]
    API --> DISEASE[Disease predictor]
    DISEASE --> MODEL[MobileNetV3-Small artifact]
    DISEASE --> TEMP[Temperature scaling]
    DISEASE --> UNC[Uncertainty policy]
    API --> GROWTH[Growth stage resolver]
    API --> WATER[ETo and water balance]
    GROWTH --> OBS
    WATER --> OBS
    DISEASE --> EVIDENCE[Disease evidence only]
    EVIDENCE --> OBS
    OBS --> SNAP
    SNAP --> SIM
    SIM --> REC[Deterministic recommendation engine]
    REC --> NARR[Narration layer]

    EVIDENCE -. supporting evidence .-> REC
    SIM == recommendation authority ==> REC
    REC -. optional relation .-> ACTUAL
```

The disease model does not compute water balance, run simulations, or choose the irrigation action. The narrator explains a cached recommendation; it does not recompute water balance, rerun simulation, or override the deterministic recommendation.

## End-to-End Workflow

1. Create or load a tomato session.
2. Upload a tomato-leaf image.
3. Receive disease evidence, calibrated confidence, and uncertainty.
4. Fetch weather for the farm or review weather values manually.
5. Enter recent irrigation as millimetres, total litres over area, or drip runtime details.
6. Compute ETo, ETc, water state, and stress.
7. Update the current digital-twin state.
8. Simulate candidate irrigation actions.
9. Generate the deterministic recommendation.
10. Generate farmer-readable narration.
11. Review current state and history.

Supported simulation actions:

| Action enum | Meaning |
|---|---|
| `IRRIGATE_NOW` | Irrigate immediately |
| `IRRIGATE_IN_6H` | Irrigate in 6 hours |
| `IRRIGATE_TOMORROW_AM` | Irrigate in 24 hours; current MVP approximation for tomorrow morning |
| `NO_IRRIGATION_24H` | Do not irrigate during the next 24 hours |

## Technology Stack

| Layer | Technology |
|---|---|
| Backend API | FastAPI |
| Validation and schemas | Pydantic |
| Disease model runtime | PyTorch / Torchvision |
| Model architecture | MobileNetV3-Small |
| Image handling | Pillow |
| Frontend | Streamlit |
| HTTP client | httpx |
| Testing | pytest |
| State storage | SQLAlchemy persistent store, optional in-memory store |
| Recorded training/runtime context | AMD ROCm PyTorch environment |

## Persistence

CropTwin now persists state through SQLAlchemy. SQLite is the default development database:

```text
CROPTWIN_STATE_STORE=sqlalchemy
CROPTWIN_DATABASE_URL=sqlite+pysqlite:///./data/croptwin.db
CROPTWIN_AUTO_CREATE_DB=true
```

`CROPTWIN_STATE_STORE=memory` preserves the original isolated in-memory store for tests and explicit development use.

PostgreSQL is supported by setting `CROPTWIN_DATABASE_URL`, for example:

```text
CROPTWIN_DATABASE_URL=postgresql+psycopg://user:password@host:5432/croptwin
```

From `backend/`, run production-style migrations with:

```bash
alembic upgrade head
```

For the local/Docker MVP, automatic table creation is enabled by default with `CROPTWIN_AUTO_CREATE_DB=true`. Production PostgreSQL should use Alembic migrations instead of relying on metadata auto-create.

Persistent entities include Farm, Plot, Crop Cycle / Session, disease observations, growth observations, water observations, immutable twin-state snapshots, simulation runs, recommendation runs, irrigation events, and actual actions. Standalone `POST /sessions` remains supported and does not create fake Farm or Plot records. Plot-created crop cycles copy plot location, elevation, and soil texture into the crop-cycle snapshot so historical sessions do not change when plot metadata changes.

Water updates and irrigation events use different identities. `water_update_id` identifies one physical/source water observation and is scoped by `state_id`; exact retries use the same `water_update_id` plus a canonical SHA-256 request fingerprint. Reusing a `water_update_id` with changed calculation inputs returns a conflict. If old clients omit `water_update_id`, CropTwin derives `derived-water-update-*` from `state_id`, UTC `observed_at`, and `observation_time_basis`, so one crop cycle has one compatibility observation for one exact observed instant unless the caller provides a distinct ID.

Water observations form a canonical chronological chain per crop cycle. The latest successfully persisted water observation, not the latest committed `TwinCurrentState` snapshot, is the baseline for the next water calculation. `/update-twin-state` is separate: it creates an immutable current-state snapshot from the latest canonical water observation plus the latest disease and growth evidence, but it is not required to preserve water progression. A `TwinCurrentState` snapshot may therefore lag behind the water-observation chain.

Each accepted water observation has a monotonic `water_sequence`, records its `base_water_observation_id` and `base_water_sequence`, and persists the exact `previous_root_zone_depletion_mm` copied from that base. It also references the growth observation generated in the same atomic water update. For a crop cycle with no prior water observation, the first calculation starts from 0 mm, has `water_sequence = 1`, `base_water_observation_id = null`, and `base_water_sequence = 0`.

`cache_water_update` is the authoritative production path for advancing the canonical water timeline. The older direct `cache_water_state` path is deprecated and blocked from writing canonical water observations because it cannot provide the full request identity, baseline validation, chronology validation, optimistic sequence update, irrigation-event validation, and paired growth reference.

`observed_at` is the physical ordering key. `computed_at` is only processing time and is not used to decide which water state comes next. New canonical observations must be later than the current canonical observation. Historical insertion into the canonical chain is not supported yet, and a date-only request resolves to 00:00 UTC, so multiple same-date updates need explicit timezone-aware `observed_at` values. Stale bases are rejected instead of silently rebasing; concurrent updates cannot both advance from the same base. Exact retries still return their original stored response, even if newer observations have since advanced the canonical sequence.

Example water chain:

| Sequence | `observed_at` | Base sequence | Previous depletion | Resulting depletion |
|---:|---|---:|---:|---:|
| 1 | July 10 | 0 | 0 mm | 3 mm |
| 2 | July 11 | 1 | 3 mm | 6 mm |
| 3 | July 12 | 2 | 6 mm | depends on July 12 inputs |

This task does not add automatic time advancement, scheduled weather ingestion, recurring jobs, sensors, or background water-state updates.

`/update-twin-state` combines the canonical water observation, that water observation's paired growth observation, and the latest available disease observation at snapshot computation time. Disease evidence may be newer than the water observation; the snapshot source IDs preserve the exact evidence set, while snapshot `observed_at` remains the water observation time and snapshot `computed_at` records when the combined state was assembled.

Twin-state snapshot identity is deterministic. CropTwin calculates a SHA-256 source fingerprint from `state_id`, `disease_observation_id`, `growth_observation_id`, and `water_observation_id`, excluding `computed_at` and random values. Repeating `/update-twin-state` with unchanged source observations reuses the existing snapshot, does not add duplicate history, and does not invalidate current simulations or recommendations. A changed disease observation or a new canonical water observation creates one new immutable snapshot; simulations and recommendations linked to the previous snapshot are then no longer current until regenerated.

The follow-up snapshot-lineage migration backfills existing water observations to the best matching same-state growth observation by preferring identical `observed_at` and `observation_time_basis`, then deterministic computed-time tie-breakers, and otherwise the latest same-state growth observation at or before the water observation. Existing duplicate snapshots are preserved; the first row gets the normal source fingerprint and later legacy duplicates get unique `legacy-*` fingerprints so future writes can enforce uniqueness.

Irrigation-event IDs identify physical irrigation events. An event ID cannot be reused for a different crop cycle or for a different timestamp, amount, or source. `water_observations.irrigation_event_id` is the authoritative application link, is unique when present, and links one irrigation event to the water observation that first applied it. Later water observations may report the same historical event; CropTwin stores that provenance in `reported_irrigation_event_id`, sets `effective_irrigation_mm` to `0`, leaves `irrigation_event_id` null for the later row, and still computes the new weather and ETc. Database uniqueness guards exact retries and prevents one irrigation event from being applied twice. If two different updates race to apply the same event, the losing request receives a conflict and should retry.

Actual actions record what physically happened. They remain separate from recommendations, do not automatically modify water state in this task, and may reference only recommendations from the same crop cycle. Historical recommendations from the same crop cycle can still be referenced.

Alembic migrations are covered by real upgrade/downgrade smoke tests against temporary SQLite databases. The tests also verify the authoritative irrigation-event link, water-update uniqueness, reported-event provenance, canonical water sequence constraints, growth-water pairing backfill, snapshot source-fingerprint backfill, foreign-key enforcement, and duplicate-link protection. Constraint tests isolate unrelated values such as `water_sequence`, `water_update_id`, and irrigation-event IDs so each expected failure proves the intended constraint.

The disease model is a locally stored Torchvision/PyTorch artifact. CropTwin does not use Hugging Face and does not download model weights at runtime.

## Disease Model

`POST /sessions/{state_id}/predict-disease` runs a trained tomato-leaf classifier through a lazy dependency-injected predictor.

| Property | Value |
|---|---|
| Architecture | MobileNetV3-Small |
| Runtime model reconstruction | `torchvision.models.mobilenet_v3_small(weights=None)` |
| Trained weights | Loaded from local artifact |
| Dataset | PlantVillage tomato subset |
| Classes | 10 |
| Input size | 224 x 224 |
| Supported API `model_version` | `1.0` |
| Calibration | Temperature scaling fitted on validation split |
| Runtime artifact directory | `model_artifacts/croptwin_disease/` |

Training used ImageNet-pretrained Torchvision initialization, classifier-head training, and final feature-block fine-tuning. Runtime inference reconstructs the architecture with `weights=None`, then loads trained weights from the committed artifact.

The model adapter validates the artifact before inference:

- required-file presence
- manifest checksums
- class-order compatibility
- uncertainty policy compatibility
- temperature metadata compatibility
- safe `weights_only=True` loading
- scoped `TorchVersion` allowlist compatibility for artifact metadata

Important artifact files:

```text
model_artifacts/croptwin_disease/
  croptwin_tomato_mobilenet_v3_small.pt
  manifest.json
  class_to_idx.json
  temperature.json
  uncertainty_policy.json
  test_metrics.json
  per_class_metrics.csv
  confusion_matrix.csv
```

The classifier output is disease evidence, not a confirmed diagnosis.

## Model Evaluation

The following values were read from the current artifact files in `model_artifacts/croptwin_disease/`.

| Metric | Value |
|---|---:|
| Test sample count | `2411` |
| Test accuracy | `0.953961012028204` |
| Test macro precision | `0.9514433459718663` |
| Test macro recall | `0.9468968994181605` |
| Test macro F1 | `0.9478684631559062` |
| Calibration temperature | `1.0508726748943829` |
| Validation ECE before calibration | `0.01117339072516188` |
| Validation ECE after calibration | `0.008117275312542915` |
| Test ECE before calibration | `0.006922619584656786` |
| Test ECE after calibration | `0.008560522925108671` |
| Confidence acceptance threshold | `0.7` |
| Validation images for threshold selection | `2397` |
| Validation coverage at threshold | `0.9362` |
| Accepted validation accuracy | `0.9724` |
| Validation error capture rate | `0.5231` |

Temperature scaling was selected on validation data. The classifier was evaluated on an untouched test split. The test ECE was already small before calibration and was slightly larger after applying the validation-fitted temperature, so this README does not claim calibration improved test ECE.

Lowest per-class F1 values in the current artifact:

| Class | Support | Precision | Recall | F1 |
|---|---:|---:|---:|---:|
| `Tomato___Target_Spot` | `212` | `0.8156862745098039` | `0.9811320754716981` | `0.8907922912205568` |
| `Tomato___Early_blight` | `150` | `0.9219858156028369` | `0.8666666666666667` | `0.8934707903780069` |
| `Tomato___Spider_mites Two-spotted_spider_mite` | `252` | `0.9734513274336283` | `0.873015873015873` | `0.9205020920502092` |

PlantVillage imagery uses controlled backgrounds and does not establish real-field generalization.

## Uncertainty Policy

The confidence policy is implemented in `app/disease/uncertainty.py` and mirrored in `uncertainty_policy.json`.

| Calibrated confidence | Uncertainty band |
|---|---|
| `< 0.70` | `high` |
| `>= 0.70` and `< 0.90` | `medium` |
| `>= 0.90` | `low` |

`uncertainty_score = 1 - confidence`.

Low confidence does not replace the top-1 label with `uncertain`. The top-1 label remains visible as tentative evidence. High uncertainty should trigger clearer image capture and manual inspection. Confidence is not a guarantee of correctness, and some incorrect predictions may still have high confidence.

## Deterministic Agronomy Engine

CropTwin uses deterministic modules for crop stage, ETo, water balance, simulation, and recommendation. The same inputs produce the same domain result.

Implemented assumptions and calculations include:

- Tomato-only crop support.
- FAO-56 Table 11-style tomato stage durations: initial 30, development 40, mid-season 45, late-season 30 days.
- Stage Kc values: initial `0.60`, development `0.80`, mid-season `1.15`, late-season `0.80`.
- Penman-Monteith ETo when shortwave radiation is available.
- Hargreaves-Samani ETo fallback when shortwave radiation is missing.
- ETc from ETo and Kc.
- Soil texture assumptions for field capacity and wilting point.
- Root depth assumptions by growth stage.
- Total available water (TAW).
- Readily available water threshold using `p_allowable = 0.50`.
- Root-zone depletion update from ETc, rainfall, and a non-duplicated irrigation event.
- Explicit root-zone water surplus accounting.
- Deficit beyond total available water accounting.
- Moisture-state and stress-band classification.
- 24-hour candidate action simulation.
- Deterministic recommendation selection from current state and cached simulation.

Disease evidence can add caution reasons, inspection advisory, or irrigation constraints such as avoiding overhead irrigation for stronger fungal wetness risk. It does not override the water engine.

### Observation Time Policy

`observed_at` is when the physical/source condition applies. `computed_at` is when CropTwin processed the record. `last_update_time` remains only as a backward-compatible alias of twin-snapshot `computed_at`; it is not physical observation time.

For existing water requests that provide only `current_date`, CropTwin uses `00:00 UTC` on that date and marks `observation_time_basis=DATE_ONLY_UTC_START`. Explicit `observed_at` values must be timezone-aware and are normalized to UTC. Disease predictions without capture metadata use the server receipt/prediction timestamp with `observation_time_basis=SERVER_RECEIVED`.

When a water request computes both growth and water observations, the stored growth observation uses the same `observed_at` and `observation_time_basis` as the paired water observation.

### Water Surplus Accounting

The deterministic bucket update is:

```text
raw_depletion = previous_root_zone_depletion + ETc - rainfall - irrigation
root_zone_depletion_mm = clamp(raw_depletion, 0, TAW)
water_surplus_mm = max(0, -raw_depletion)
depletion_beyond_taw_mm = max(0, raw_depletion - TAW)
```

`water_surplus_mm` is water input beyond what was required to refill the simplified root-zone bucket. CropTwin does not yet divide that surplus into runoff, deep drainage, or temporary storage, and it is not carried forward as stored plant-available water. No sensor synchronization, automatic daily/hourly advancement, controller integration, or detailed runoff/drainage model is implemented yet.

## Weather and Irrigation Inputs

`GET /sessions/{state_id}/weather-snapshot?target_date=YYYY-MM-DD` retrieves one day of model-derived weather from Open-Meteo using the stored session latitude and longitude. The weather snapshot includes:

- minimum and maximum 2 m air temperature
- mean relative humidity
- precipitation sum
- shortwave radiation sum
- mean 10 m wind speed, normalized to 2 m for Penman-Monteith input
- Open-Meteo FAO ETo

CropTwin still computes ETo locally. The Open-Meteo ETo value is stored only as `WeatherInput.eto_reference_feed` for comparison, not as the final CropTwin ETo. Weather values can be manually overridden before water-state computation.

Recent irrigation can be entered as millimetres, total litres plus irrigated area, or drip runtime plus emitter details. The backend still receives the canonical `LastIrrigationEvent.amount_mm`. The conversion basis is that 1 litre over 1 m2 equals 1 mm.

If the request does not supply an irrigation-event ID, CropTwin derives a stable event ID from `state_id`, timestamp, and normalized `amount_mm`. Reusing an event ID with different timestamp, amount, or source is rejected. Reusing an already-applied event ID in a later water observation is not an error and does not make the later request an exact retry.

Example:

| Observation | `water_update_id` | Reported `irrigation_event_id` | Applied link | Effective irrigation |
|---|---|---|---|---:|
| July 10 | `update-july-10` | `irrigation-123` | `irrigation-123` | `5 mm` |
| July 11 | `update-july-11` | `irrigation-123` | none | `0 mm` |

The July 11 update still processes July 11 weather and ETc. It simply records that `irrigation-123` had already been included in an earlier water balance.

## Streamlit Frontend

The Streamlit frontend lives in `frontend/`. It is an HTTP client for the FastAPI API and does not import backend model or agronomy modules directly.

The frontend supports:

- backend connection status
- collapsed technical settings
- session creation and loading
- read-only active-session display
- tomato-leaf upload
- disease evidence, confidence, uncertainty, and top probabilities
- Open-Meteo weather fetch with manual weather overrides
- farmer-friendly irrigation conversion from litres/area or drip runtime details
- water-state and twin-state summaries
- action simulation comparison
- deterministic recommendation display
- narration
- current state and history refresh

Farm and Plot management routes are available through the API. The current Streamlit workflow remains focused on the existing session, disease, water, simulation, recommendation, narration, and records path.

## Docker And Render Deployment

The Docker image creates `/workspace/data` and provides safe non-secret local defaults:

```text
CROPTWIN_STATE_STORE=sqlalchemy
CROPTWIN_DATABASE_URL=sqlite+pysqlite:////workspace/data/croptwin.db
CROPTWIN_AUTO_CREATE_DB=true
CROPTWIN_API_BASE_URL=http://127.0.0.1:8000
```

Runtime environment variables supplied by Docker, Compose, Render, or the operating system override those Dockerfile defaults. Supervisor launches the internal FastAPI backend and the public Streamlit frontend in one container. FastAPI remains internal at `http://127.0.0.1:8000`; Streamlit binds to `0.0.0.0` and uses `${PORT:-7860}`.

### Local Docker Compose: SQLite

The default Compose file starts only the CropTwin application and uses SQLite in the named `croptwin_sqlite_data` volume:

```powershell
docker compose up --build
```

The application is available at:

```text
http://127.0.0.1:7860
```

Stop the container while retaining the SQLite database volume:

```powershell
docker compose down
```

Stop the container and delete the SQLite database volume:

```powershell
docker compose down -v
```

`docker compose down -v` deletes the stored local `croptwin.db`. SQLite mode is suitable for local development and small demonstrations. PostgreSQL is preferred for durable multi-user deployments.

### Local Docker Compose: PostgreSQL

Use `docker-compose.postgres.yml` as an override when you want local PostgreSQL instead of SQLite. The password examples below are only for local development.

PowerShell:

```powershell
$env:POSTGRES_PASSWORD = "choose-a-local-development-password"
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up --build
```

PowerShell one-line form:

```powershell
$env:POSTGRES_PASSWORD = "choose-a-local-development-password"; docker compose -f docker-compose.yml -f docker-compose.postgres.yml up --build
```

Bash/macOS/Linux:

```bash
export POSTGRES_PASSWORD="choose-a-local-development-password"
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up --build
```

PostgreSQL mode starts the `postgres` service first, waits for its health check, runs the one-shot `migrate` service with `alembic upgrade head`, and starts CropTwin only after migration succeeds. The override removes the inherited SQLite data mount, so PostgreSQL data is stored only in the `croptwin_postgres_data` named volume. Real deployment credentials belong in platform secret/environment settings, not in Git.

Stop PostgreSQL mode while retaining volumes:

```powershell
docker compose -f docker-compose.yml -f docker-compose.postgres.yml down
```

Stop PostgreSQL mode and delete local PostgreSQL data:

```powershell
docker compose -f docker-compose.yml -f docker-compose.postgres.yml down -v
```

Warning: `down -v` deletes local PostgreSQL data.

### Render Mode A: Temporary SQLite Demonstration

Render uses the Dockerfile and Supervisor configuration directly; `docker-compose.postgres.yml` is for local Compose development and is not required by Render.

- Service type: Web Service.
- Runtime: Docker.
- Dockerfile path: `./Dockerfile`.
- Root directory: repository root.
- Health check path: `/_stcore/health`.
- Do not manually define `PORT` unless intentionally overriding Render's value.
- No external database is required.
- Data may disappear after restart, spin-down, or redeployment.

### Render Mode B: Persistent PostgreSQL

Set runtime environment variables in Render:

```text
CROPTWIN_STATE_STORE=sqlalchemy
CROPTWIN_DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:PORT/DATABASE
CROPTWIN_AUTO_CREATE_DB=false
```

Do not commit database credentials. Run migrations before application startup, or through Render's migration/pre-deploy mechanism:

```bash
cd backend
alembic upgrade head
```

The public service is Streamlit. The internal API target remains `http://127.0.0.1:8000`.

The frontend uses `CROPTWIN_API_BASE_URL` or the Settings panel to choose the API target. The default target is `http://127.0.0.1:8000`.

## API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/health` | Process health |
| `GET` | `/system-info` | Model and agronomy metadata |
| `POST` | `/farms` | Create a farm |
| `GET` | `/farms` | List farms |
| `GET` | `/farms/{farm_id}` | Read a farm |
| `POST` | `/farms/{farm_id}/plots` | Create a plot under a farm |
| `GET` | `/farms/{farm_id}/plots` | List plots under a farm |
| `GET` | `/plots/{plot_id}` | Read a plot |
| `POST` | `/plots/{plot_id}/crop-cycles` | Create a plot-backed crop cycle/session |
| `POST` | `/sessions` | Create a session |
| `GET` | `/sessions/{state_id}` | Read current session state |
| `GET` | `/sessions/{state_id}/history` | Read twin history |
| `GET` | `/sessions/{state_id}/weather-snapshot` | Fetch one-day Open-Meteo weather for the stored farm location |
| `POST` | `/sessions/{state_id}/predict-disease` | Run disease inference |
| `POST` | `/sessions/{state_id}/compute-water-state` | Compute growth and water state |
| `POST` | `/sessions/{state_id}/update-twin-state` | Build current twin state |
| `POST` | `/sessions/{state_id}/simulate-actions` | Simulate candidate actions |
| `POST` | `/sessions/{state_id}/recommend` | Generate recommendation |
| `POST` | `/sessions/{state_id}/narrate` | Explain recommendation |
| `POST` | `/sessions/{state_id}/actual-actions` | Record a physical farmer action |
| `GET` | `/sessions/{state_id}/actual-actions` | List physical farmer actions |

`POST /sessions/{state_id}/compute-water-state` accepts optional `water_update_id`. The path `state_id` remains authoritative, and older clients may omit the field. Exact retries return the canonical persisted `WaterStateResponse`; conflicting reuse of `water_update_id` or `irrigation_event_id` returns a structured conflict response with `status_code`, `code`, `message`, and `details`.

Local API documentation:

- Swagger UI: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`
- OpenAPI JSON: `http://127.0.0.1:8000/openapi.json`

## Repository Structure

```text
AMD_DigitalTwin/
  backend/
    alembic/
    alembic.ini
    app/
      disease/
      external/
      growth_stage/
      narration/
      persistence/
      recommendation/
      routes/
        actions.py
        farms.py
        plots.py
      simulation/
      water/
      dependencies.py
      main.py
      schemas.py
      state_store.py
      store_protocol.py
    tests/
  frontend/
    app.py
    api_client.py
    ui_helpers.py
    requirements.txt
    README.md
  docker/
    supervisord.conf
  .streamlit/
  docker-compose.yml
  docker-compose.postgres.yml
  .env.compose.example
  Dockerfile
  pyproject.toml
  README.md
```

There is no `requirements-vision.txt` in the current checkout; the vision runtime packages are listed in `backend/requirements.txt`.

## Installation

The project has been locally tested with Python 3.12. The repository does not currently declare a formal Python version range in `pyproject.toml`.

Clone and create an environment:

```powershell
git clone https://github.com/Eshuredd/AMD_DigitalTwin.git
cd AMD_DigitalTwin

python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
```

Install backend, model runtime, and test dependencies:

```powershell
python -m pip install -r backend/requirements.txt
```

Install frontend dependencies:

```powershell
python -m pip install -r frontend/requirements.txt
```

`backend/requirements.txt` includes `torch` and `torchvision`. Select builds compatible with the target CPU, GPU, or AMD ROCm runtime. The repository does not require a Hugging Face install step.

## Running the Application

Use two terminals during local development.

Terminal 1: start FastAPI.

```powershell
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --app-dir backend
```

You can also run `cd backend` first, then `uvicorn app.main:app --reload`.

Terminal 2: start Streamlit.

```powershell
.\.venv\Scripts\Activate.ps1
streamlit run frontend/app.py
```

Default local URLs:

- API: `http://127.0.0.1:8000`
- Swagger UI: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`
- Streamlit: usually `http://localhost:8501`

`--reload` is for local development, not production serving.

## Using the API Directly

The disease endpoint expects the path `state_id` to match the body `state_id`.

```json
{
  "state_id": "state_xxx",
  "image_base64": "/9j/4AAQSkZJRgABAQAAAQABAAD...",
  "model_version": "1.0"
}
```

Data URI prefixes are accepted:

```json
{
  "state_id": "state_xxx",
  "image_base64": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...",
  "model_version": "1.0"
}
```

For full request and response schemas, use Swagger or ReDoc.

## Configuration

| Variable | Default | Used by | Purpose |
|---|---|---|---|
| `CROPTWIN_DATABASE_URL` | `sqlite+pysqlite:///./data/croptwin.db` locally; `sqlite+pysqlite:////workspace/data/croptwin.db` in Docker | Backend, Docker, deployment | Selects SQLite or PostgreSQL persistence. |
| `CROPTWIN_STATE_STORE` | `sqlalchemy` | Backend, Docker, deployment | Selects `sqlalchemy` or explicit `memory` store. |
| `CROPTWIN_AUTO_CREATE_DB` | `true` | Backend, Docker, deployment | Allows local MVP table creation; use `false` with PostgreSQL migrations. |
| `PORT` | `7860` Docker fallback | Docker, deployment | Public Streamlit port used by Supervisor and Docker health check. |
| `CROPTWIN_API_BASE_URL` | `http://127.0.0.1:8000` | Frontend, Docker | Sets the FastAPI target for the Streamlit HTTP client. |
| `CROPTWIN_DISEASE_ARTIFACT_DIR` | `model_artifacts/croptwin_disease` locally; `/workspace/backend/model_artifacts/croptwin_disease` in Docker | Backend, Docker | Overrides the disease artifact directory for inference and `/system-info`. |

Configuration precedence is: application defaults, Dockerfile non-secret defaults, runtime environment variables, then inherited Supervisor child-process environment. Supervisor does not hard-code database settings.

## Testing

Run the complete test suite:

```powershell
$env:PYTHONPATH = "backend"
python -m pytest -v backend/tests
```

Focused commands:

```powershell
$env:PYTHONPATH = "backend"; python -m pytest -v backend/tests/test_disease_model.py
$env:PYTHONPATH = "backend"; python -m pytest -v backend/tests/test_routes/test_disease.py
$env:PYTHONPATH = "backend"; python -m pytest -v backend/tests/test_frontend_api_client.py
$env:PYTHONPATH = "backend"; python -m pytest -v backend/tests/test_frontend_ui_helpers.py
```

Bash/macOS/Linux:

```bash
export PYTHONPATH=backend
python -m pytest -v backend/tests
```

Current local verification:

| Command | Result |
|---|---|
| `PYTHONPATH=backend python3 -m pytest -v backend/tests` | `219 passed, 1 skipped in 1.04s` |

The full suite includes API workflow tests, route tests, persistence store-contract tests, deployment configuration tests, disease artifact validation, image validation, uncertainty policy tests, ETo/Open-Meteo tests, water-balance tests, and frontend HTTP/helper tests. Some route tests use dependency overrides; the optional real artifact smoke test runs when the local runtime can execute it.

## Current Limitations

- No authentication or multi-user isolation is implemented.
- Open-Meteo weather retrieval is available with manual overrides; the data is model-derived and is not equivalent to an on-farm weather station.
- No on-farm weather-station or soil-moisture-sensor integration is implemented.
- No automatic hourly or daily twin advancement is implemented.
- Real irrigation amounts still require farmer, controller, or sensor information.
- PlantVillage images have controlled backgrounds and do not prove real-field performance.
- Unrelated or out-of-distribution images may still produce predictions.
- Out-of-distribution and non-tomato rejection are not implemented.
- Confidence thresholds were selected from the current validation split.
- Docker packaging is implemented, but no public production URL has been verified.
- No field validation is included.
- No treatment recommendation engine is included.
- Local development servers are not production hosting.

## Future Improvements

- Authentication and user/session separation.
- On-farm weather-station and soil-moisture-sensor integration.
- Real-field tomato-leaf dataset evaluation.
- Out-of-distribution and non-tomato image rejection.
- Model monitoring and recalibration workflow.
- Structured logs and observability.
- CI.
- Production serving.
- Mobile-friendly UI improvements.

## Safety and Scope

CropTwin is an MVP decision-support system.

- Disease output is supporting evidence, not a confirmed diagnosis.
- Irrigation decisions come from deterministic agronomy logic.
- High-uncertainty disease results require manual inspection.
- The project does not provide pesticide, fertilizer, fungicide, insecticide, chemical, or dosage advice.
- The project does not replace professional agronomic advice or field inspection.
