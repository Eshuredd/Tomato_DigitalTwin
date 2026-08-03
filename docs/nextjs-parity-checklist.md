# CropTwin Next.js parity checklist

This checklist records the FastAPI and Streamlit behavior that the rebuild must restore. Milestone 2 implements the management and session-entry rows noted below; later agronomy workflows remain unimplemented.

| Capability | Authoritative API | Implemented | Browser verified | Notes that must survive |
|---|---|---:|---:|---|
| Health and runtime metadata | `GET /health`, `GET /system-info` | Yes | Yes | Browser-visible queries; explicit retry, base URL, and decision boundary. |
| Farms | `POST /farms`, `GET /farms`, `GET /farms/{farm_id}` | Yes | Yes | Empty/list/create/detail exercised against isolated FastAPI. |
| Plots | `POST/GET /farms/{farm_id}/plots`, `GET /plots/{plot_id}` | Yes | Yes | Create/list/detail and stored location/soil context exercised. |
| Plot-backed crop cycle | `POST /plots/{plot_id}/crop-cycles` | Yes | Yes | Creation and authoritative inherited context exercised. |
| Standalone session | `POST /sessions`, `GET /sessions/{state_id}` | Yes | Partial | Creation and structured not-found are verified. Populated GET requires a current twin snapshot and remains unverified until a later workflow creates one. |
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
