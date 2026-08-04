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

Milestones 1 through 3 established the application, contract, management, session, evidence, weather-review, and irrigation-preparation foundations. Milestone 4 adds:

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
- a real `/workflow/[stateId]` route whose route parameter is authoritative;
- supporting tomato-leaf disease evidence using the system-advertised model version, runtime response validation, cancellation, and stale-response rejection;
- explicit, date-specific weather retrieval with fetched-and-reviewed or fully manual provenance and deliberate acceptance;
- recent-irrigation preparation for no irrigation, direct millimetres, litres plus area, and drip-runtime conversions;
- route-owned unsaved weather and irrigation drafts that are invalidated when prior accepted inputs change; and
- a test-only ASGI launcher with deterministic disease and weather dependencies while preserving real water, twin, advancement, store, idempotency, lineage, and error behavior;
- stable in-memory semantic identities for irrigation events, water updates, and daily advancements;
- paired canonical water baselines, explicit stale-baseline rebase, and irrigation double-counting visibility;
- complete runtime validation for water, twin, and nested advancement responses;
- a canonical twin created/reused distinction plus deliberate session refresh; and
- separate next-day weather and irrigation preparation with new/current/catch-up/historical advancement transitions and partial-success twin refresh handling.

Disease results remain supporting AI evidence, not a confirmed diagnosis. Images are limited to one JPEG, PNG, or WebP file up to 10 MiB. Weather is never fetched merely because a stage opens or a date changes; reviewed weather requires explicit acceptance and manual input makes no source claim. The only irrigation calculations in TypeScript are unit conversions: litres divided by area, and emitter count × flow × runtime-hours divided by area. Reviewed weather and irrigation are not persisted yet.

Image metadata is not treated as durable evidence identity. Each file-selection event receives an ephemeral component-local generation and supersedes previously accepted evidence, including same-metadata or invalid replacement attempts. Weather retrieval similarly captures a request generation, state ID, target date, and draft revision; responses or errors from an invalidated generation may remain date-scoped query data but cannot overwrite the active draft or provenance.

Milestone 4 does not implement simulation, recommendation, narration, history, or actual actions. It does not claim feature parity.

## Route foundation

| Route | Area | Milestone 4 state |
|---|---|---|
| `/` | Overview | Browser-visible health and current milestone overview |
| `/farms` | Farms | Real list and create workflow |
| `/farms/[farmId]` | Farm detail | Real farm-scoped plot list and create workflow |
| `/plots/[plotId]` | Plot detail | Stored context and plot-backed cycle creation |
| `/cycle` | Session entry | Standalone creation and explicit state-ID loading |
| `/cycle/[stateId]` | Active cycle | Authoritative session summary or normal not-yet-computed state |
| `/workflow` | Workflow entry | Explanatory entry or safe `stateId` compatibility redirect |
| `/workflow/[stateId]` | Nine-step workflow | First six stages implemented; one-day advancement lives within canonical twin; simulation and later stages visibly blocked |
| `/history` | History | Neutral placeholder |
| `/actions` | Actual actions | Neutral placeholder |
| `/system` | System information | Real FastAPI metadata query |

The detailed restoration checklist is maintained in [`nextjs-parity-checklist.md`](nextjs-parity-checklist.md).
