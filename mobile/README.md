# CropTwin mobile

Expo SDK 57 / React Native companion for the CropTwin FastAPI service. The app includes the phone navigation shell, semantic design system, typed API transport, OpenAPI workflow, TanStack Query, farms, plots, sessions, crop-cycle creation, disease evidence, weather review, and irrigation-input preparation.

## Requirements

- Node.js 24.18.0 (the version used for local validation)
- npm
- Xcode and an iOS Simulator for iOS development
- Android Studio and an emulator for Android development, if needed
- The repository Python environment with backend dependencies for semantic schema checks
- Expo Go compatible with SDK 57, or an Expo development build

## Install and configure

```bash
cd /Users/dspl_012/Desktop/AMD_DigitalTwin/mobile
npm ci
cp .env.example .env
```

Set `EXPO_PUBLIC_API_BASE_URL` in `.env`:

- iOS Simulator: `http://127.0.0.1:8000`
- Android emulator: `http://10.0.2.2:8000`
- Physical device: the computer's reachable LAN URL, such as `http://192.168.1.10:8000`

`EXPO_PUBLIC_*` values are bundled into the app. Never put secrets in them. If the variable is omitted, local development defaults to `http://127.0.0.1:8000`.

## Develop and validate

```bash
npm start
npm run ios
npm run android
npm run lint
npm run typecheck
npm run test:run
npm run validate:config
npm run validate:routes
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8000 npx expo export --platform ios --output-dir dist/ios
```

Start the Expo MCP-enabled development server from this directory:

```bash
EXPO_UNSTABLE_MCP_SERVER=1 npx expo start
```

Then open the iOS Simulator from Expo CLI (`i`) or through Expo MCP. Always point Expo MCP at this `mobile/` project root.

## FastAPI and OpenAPI

The normal app build uses checked-in `src/lib/api/openapi.json` and `schema.d.ts`; it does not need a running backend.

```bash
# Explicitly pull from a running FastAPI server; rewrites the snapshot
CROPTWIN_OPENAPI_URL=http://127.0.0.1:8000/openapi.json npm run api:schema:pull

# Generate TypeScript declarations from the checked-in snapshot
npm run api:generate

# Prove generated declarations are current
npm run api:check

# Import backend/app/main.py and compare schemas semantically (no backend write)
npm run api:schema:check
```

`openapi-typescript` is a development-only generator. Its current package metadata declares TypeScript 5 while Expo SDK 57 supplies TypeScript 6; installation therefore uses the committed lockfile, while generation and checks are validated directly.

## Architecture

- `src/app/`: Expo Router routes and the five-tab shell
- `src/components/ui/`: safe-area layout, cards, buttons, badges, disclosure, and shared loading/error/empty states
- `src/features/`: health/system, entity setup, and session-scoped disease/weather/irrigation workflow boundaries
- `src/lib/api/`: generated schema, runtime contracts, fetch transport, structured errors, paths, operations, and query keys
- `src/lib/query/`: the single QueryClient and retry policy
- `src/lib/theme/`: semantic color, spacing, radius, typography, and elevation tokens
- `__tests__/`: permanent unit and React Native component tests (kept outside route files)

## Known environment notes

- iOS log collection can print `getpwuid_r did not find a match for uid 501`; this is non-blocking in the verified environment.
- A physical device cannot use the host loopback URL; use a LAN address and ensure FastAPI listens on a reachable interface.
- If FastAPI is stopped, Home and More intentionally render an explicit unavailable state with Retry and optional technical detail disclosure.

## Farm, plot, and cycle setup

- Farms lists and creates `GET/POST /farms`, then opens authoritative farm detail.
- Farm detail loads `GET /farms/{farm_id}` and the farm-scoped `GET /farms/{farm_id}/plots`; plot creation uses the exact nested location and soil contract.
- Plot detail uses `GET /plots/{plot_id}` and can create a tomato cycle through `POST /plots/{plot_id}/crop-cycles` with only crop type and planting date. FastAPI inherits location and soil from the plot.
- Cycle supports standalone `POST /sessions`, loading an existing `GET /sessions/{state_id}`, and `/cycle/[stateId]` as the canonical mobile session screen.

Known backend limitation: a newly created session has authoritative creation metadata, but `GET /sessions/{state_id}` currently requires a computed current twin snapshot. Until a later workflow computes it, the app retains the authoritative `SessionResponse` in TanStack Query and shows “Current state not computed.” The session response does not expose plot/farm relationship fields, so plot-origin route context is explicitly labeled as non-authoritative navigation context.

## Evidence and input workflow

- `/workflow/[stateId]` verifies and displays an authoritative session identity; changing the route identity remounts and clears route-local media/weather/irrigation drafts.
- Disease uses `POST /sessions/{state_id}/predict-disease` with JSON `image_base64`. Camera and photo permissions are requested only after the corresponding action, while returned evidence is cached without image bytes under the session-scoped disease key.
- The disease model version is read from `GET /system-info`; it is never hard-coded from an OpenAPI example.
- Weather retrieval uses `GET /sessions/{state_id}/weather-snapshot?target_date=YYYY-MM-DD`, which uses the session’s stored coordinates. Fetched values remain reviewable inputs and failures never create zero-filled weather.
- Irrigation supports no-event, direct depth, litres/area, and drip-runtime review. It remains an explicitly unsaved route-local draft because FastAPI accepts irrigation only inside the deterministic `compute-water-state` operation.

Deterministic water state, twin update, advancement, simulation, recommendation, narration, history, and actual actions remain out of scope. Complete mobile parity is not claimed.
