# CropTwin mobile

Expo SDK 57 / React Native companion for the CropTwin FastAPI service. This foundation contains the phone navigation shell, semantic design system, typed API transport, OpenAPI workflow, TanStack Query, shared async states, and the real `/health` integration. Farm and crop-cycle workflows are intentionally not implemented yet.

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
- `src/features/`: health/system and honest future-area foundations
- `src/lib/api/`: generated schema, runtime contracts, fetch transport, structured errors, paths, operations, and query keys
- `src/lib/query/`: the single QueryClient and retry policy
- `src/lib/theme/`: semantic color, spacing, radius, typography, and elevation tokens
- `__tests__/`: permanent unit and React Native component tests (kept outside route files)

## Known environment notes

- iOS log collection can print `getpwuid_r did not find a match for uid 501`; this is non-blocking in the verified environment.
- A physical device cannot use the host loopback URL; use a LAN address and ensure FastAPI listens on a reachable interface.
- If FastAPI is stopped, Home and More intentionally render an explicit unavailable state with Retry and optional technical detail disclosure.
