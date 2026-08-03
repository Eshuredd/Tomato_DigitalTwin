# Next.js frontend rebuild

CropTwin is rebuilding the Next.js frontend in-place under `web/`. The legacy Streamlit application in `frontend/` remains operational and documented until the replacement reaches verified browser-tested parity.

## Authority boundary

```text
Next.js browser UI
    ↓ generated OpenAPI contract and typed transport
FastAPI
    ↓
TwinStateStore and persistence
```

FastAPI remains authoritative for agronomy, disease inference, simulations, recommendation choice, narration, validation, identifiers, timestamps, lineage, and persistence. TypeScript may validate UI shape, submit requests, and render responses; it must not reproduce domain decisions.

## Current milestone

Milestone 1 established the accepted application foundation. Milestone 2 now adds:

- a stable App Router, React, strict TypeScript, and Tailwind foundation;
- a checked-in FastAPI OpenAPI snapshot and generated TypeScript declarations;
- centralized request, cancellation, timeout, structured-error, and query-key foundations;
- a custom CropTwin design system that distinguishes authoritative deterministic agronomy from provisional AI evidence in text and visual treatment;
- persistent desktop navigation and route-parameter identity;
- a reusable accessible nine-stage workflow stepper;
- reusable loading, empty, refreshing, blocked, error, timeout, cancellation, malformed, reused, and created states;
- browser-visible health and system-information queries;
- farm list/create/detail and farm-scoped plot list/create/detail workflows;
- standalone session creation and explicit existing-session loading;
- plot-backed crop-cycle creation and `/cycle/[stateId]` summaries;
- Vitest, Testing Library, and isolated-memory FastAPI Playwright coverage.

Milestone 2 does not implement disease, weather, irrigation, water state, twin update, advancement, simulation, recommendation, narration, history, or actual actions. It does not claim feature parity.

## Route foundation

| Route | Area | Milestone 2 state |
|---|---|---|
| `/` | Overview | Browser-visible health and current milestone overview |
| `/farms` | Farms | Real list and create workflow |
| `/farms/[farmId]` | Farm detail | Real farm-scoped plot list and create workflow |
| `/plots/[plotId]` | Plot detail | Stored context and plot-backed cycle creation |
| `/cycle` | Session entry | Standalone creation and explicit state-ID loading |
| `/cycle/[stateId]` | Active cycle | Authoritative session summary or normal not-yet-computed state |
| `/workflow` | Nine-step workflow | Placeholder-state stepper only |
| `/history` | History | Neutral placeholder |
| `/actions` | Actual actions | Neutral placeholder |
| `/system` | System information | Real FastAPI metadata query |

The detailed restoration checklist is maintained in [`nextjs-parity-checklist.md`](nextjs-parity-checklist.md).
