# CropTwin Next.js parity checklist

This checklist records the FastAPI and Streamlit behavior that the rebuild must restore. Milestone 4 implements deterministic water, canonical twin update, and controlled one-day advancement; later decision workflows remain unimplemented.

| Capability | Authoritative API | Implemented | Browser verified | Notes that must survive |
|---|---|---:|---:|---|
| Health and runtime metadata | `GET /health`, `GET /system-info` | Yes | Yes | Browser-visible queries; explicit retry, base URL, and decision boundary. |
| Farms | `POST /farms`, `GET /farms`, `GET /farms/{farm_id}` | Yes | Yes | Empty/list/create/detail exercised against isolated FastAPI. |
| Plots | `POST/GET /farms/{farm_id}/plots`, `GET /plots/{plot_id}` | Yes | Yes | Create/list/detail and stored location/soil context exercised. |
| Plot-backed crop cycle | `POST /plots/{plot_id}/crop-cycles` | Yes | Yes | Creation and authoritative inherited context exercised. |
| Standalone session | `POST /sessions`, `GET /sessions/{state_id}` | Yes | Yes | Creation, structured pre-snapshot state, and deliberate refresh after canonical twin update are verified. |
| Disease evidence | `POST /sessions/{state_id}/predict-disease` | Yes | Yes | One JPEG/PNG/WebP up to 10 MiB; system model version, cancellation and stale-response guards; supporting, uncertainty-aware evidence only. |
| Weather review | `GET /sessions/{state_id}/weather-snapshot` | Yes | Yes | Retrieval is explicit and date-specific; fetched overrides remain visible; fully manual provenance is distinct; acceptance is deliberate. |
| Irrigation conversion inputs | Route-scoped input materialized in authoritative requests | Yes | Yes | No irrigation, millimetres, litres plus area, and drip runtime remain distinct; full precision and explicit zero semantics are preserved. |
| Water state | `POST /sessions/{state_id}/compute-water-state` | Yes | Yes | Stable update/event identities, paired canonical lineage, explicit rebase, and no-double-counting accounting. |
| Twin update | `POST /sessions/{state_id}/update-twin-state` | Yes | Yes | Newly created and idempotently reused snapshots are distinct; session refresh is deliberate. |
| One-day advancement | `POST /sessions/{state_id}/advance-one-day` | Yes | Yes | Locked next UTC date, separate next-day inputs, stable identity, and non-regressing transition classification. |
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
