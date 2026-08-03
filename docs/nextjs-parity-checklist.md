# CropTwin Next.js parity checklist

This checklist records the FastAPI and Streamlit behavior that later rebuild milestones must restore. Milestone 1 implements only the frontend foundation, application shell, navigation, reusable workflow stepper, and shared UI states. No feature row below is considered implemented or browser verified yet.

| Capability | Authoritative API | Implemented | Browser verified | Notes that must survive |
|---|---|---:|---:|---|
| Health and runtime metadata | `GET /health`, `GET /system-info` | No | No | Keep backend authority and explicit decision boundary. |
| Farms | `POST /farms`, `GET /farms`, `GET /farms/{farm_id}` | No | No | IDs and timestamps come only from FastAPI. |
| Plots | `POST/GET /farms/{farm_id}/plots`, `GET /plots/{plot_id}` | No | No | Preserve stored location, elevation, and soil texture. |
| Plot-backed crop cycle | `POST /plots/{plot_id}/crop-cycles` | No | No | Do not replace with fabricated standalone IDs. |
| Standalone session | `POST /sessions`, `GET /sessions/{state_id}` | No | No | FastAPI resolves and validates elevation. |
| Disease evidence | `POST /sessions/{state_id}/predict-disease` | No | No | AI evidence is supporting, uncertainty-aware evidence only. |
| Weather review | `GET /sessions/{state_id}/weather-snapshot` | No | No | Retrieval is explicit and date-specific; reviewed overrides remain visible. |
| Irrigation conversion inputs | Client input feeding water/advancement requests | No | No | Millimetres, litres plus area, and drip runtime remain distinct input modes. |
| Water state | `POST /sessions/{state_id}/compute-water-state` | No | No | Preserve stable update identity, canonical lineage, and no double counting. |
| Twin update | `POST /sessions/{state_id}/update-twin-state` | No | No | Reused snapshots are distinct from newly created snapshots. |
| One-day advancement | `POST /sessions/{state_id}/advance-one-day` | No | No | Exactly one required date; preserve new/current/catch-up/historical retry semantics. |
| Candidate simulation | `POST /sessions/{state_id}/simulate-actions` | No | No | Browser submits a non-empty subset; it never computes or ranks projections. |
| Recommendation | `POST /sessions/{state_id}/recommend` | No | No | FastAPI alone chooses the action and constraints. |
| Narration | `POST /sessions/{state_id}/narrate` | No | No | Explain cached recommendations; do not generate treatment advice. |
| History | `GET /sessions/{state_id}/history` | No | No | Render authoritative immutable history. |
| Actual actions | `POST/GET /sessions/{state_id}/actual-actions` | No | No | Physical actions remain separate from recommendations and water updates. |

## Contract rules for later milestones

- Preserve the backend error envelope: `error.status_code`, `error.code`, `error.message`, and `error.details`.
- Encode every dynamic path segment.
- Never generate backend IDs, timestamps, observations, snapshots, lineage, simulations, recommendations, or action records in the browser.
- Never move agronomy, disease inference, candidate ranking, recommendation choice, or persistence rules into TypeScript.
- Keep Streamlit operational and documented until browser-tested parity is explicitly demonstrated.
- Mark a capability browser verified only after its prerequisites and populated success/reuse/error states have been exercised against FastAPI.
