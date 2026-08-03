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

Milestone 1 replaces the previous stacked Next.js implementation with:

- a stable App Router, React, strict TypeScript, and Tailwind foundation;
- a checked-in FastAPI OpenAPI snapshot and generated TypeScript declarations;
- centralized request, cancellation, timeout, structured-error, and query-key foundations;
- a custom CropTwin design system that distinguishes authoritative deterministic agronomy from provisional AI evidence in text and visual treatment;
- persistent desktop navigation and neutral route placeholders;
- a reusable accessible nine-stage workflow stepper;
- reusable loading, empty, refreshing, blocked, error, timeout, cancellation, malformed, reused, and created states;
- Vitest, Testing Library, and Playwright coverage for the foundation.

Milestone 1 does not implement farms, plots, crop cycles, sessions, disease, weather, irrigation, water state, twin update, advancement, simulation, recommendation, narration, history, or actual actions. It does not claim feature parity.

## Route foundation

| Route | Area | Milestone 1 state |
|---|---|---|
| `/` | Overview | Foundation overview only |
| `/farms` | Farms and plots | Neutral placeholder |
| `/cycle` | Active crop cycle | Neutral placeholder |
| `/workflow` | Nine-step workflow | Placeholder-state stepper only |
| `/history` | History | Neutral placeholder |
| `/actions` | Actual actions | Neutral placeholder |
| `/system` | System information | Neutral placeholder |

The detailed restoration checklist is maintained in [`nextjs-parity-checklist.md`](nextjs-parity-checklist.md).
