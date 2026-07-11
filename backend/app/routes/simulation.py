"""Route orchestration for deterministic irrigation action simulation.

The simulator owns all projection calculations. This route preserves every
requested candidate and does not choose a recommendation.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import (
    TwinAPIException,
    call_store_or_raise,
    get_state_store,
)
from app.schemas import (
    SimulateActionsRequest,
    SimulateActionsResponse,
)
from app.simulation.simulator import (
    simulate_actions as simulate_actions_domain,
)
from app.state_store import InMemoryTwinStateStore


router = APIRouter(tags=["simulation"])


STATE_ID_MISMATCH_CODE = "STATE_ID_MISMATCH"
INVALID_SIMULATION_REQUEST_CODE = "INVALID_SIMULATION_REQUEST"


@router.post(
    "/sessions/{state_id}/simulate-actions",
    response_model=SimulateActionsResponse,
)
def simulate_actions_route(
    state_id: str,
    request: SimulateActionsRequest,
    store: InMemoryTwinStateStore = Depends(get_state_store),
) -> SimulateActionsResponse:
    if not state_id.strip():
        raise TwinAPIException(
            status_code=422,
            code=INVALID_SIMULATION_REQUEST_CODE,
            message="Invalid simulation request.",
            details={
                "reason": "Path state_id must contain a non-whitespace value.",
            },
        )

    if request.state_id != state_id:
        raise TwinAPIException(
            status_code=422,
            code=STATE_ID_MISMATCH_CODE,
            message="Simulation state_id mismatch.",
            details={
                "path_state_id": state_id,
                "request_state_id": request.state_id,
            },
        )

    current_state = call_store_or_raise(
        store.get_current_state,
        state_id,
    )

    simulation_response = simulate_actions_domain(
        state_id=state_id,
        current_state=current_state,
        actions=request.actions,
    )

    return call_store_or_raise(
        store.cache_simulation,
        state_id=state_id,
        simulation=simulation_response,
    )
