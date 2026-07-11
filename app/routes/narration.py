"""Route orchestration for safe deterministic recommendation narration.

The route explains an existing cached recommendation through the accepted
narrator. It does not recompute, simulate, recommend, or provide treatment
advice. Deterministic narration is used by default.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import (
    TwinAPIException,
    call_store_or_raise,
    get_state_store,
)
from app.narration.narrator import (
    generate_narration as build_narration_domain,
)
from app.schemas import NarrationResponse
from app.state_store import InMemoryTwinStateStore


router = APIRouter(tags=["narration"])


INVALID_NARRATION_REQUEST_CODE = "INVALID_NARRATION_REQUEST"


@router.post(
    "/sessions/{state_id}/narrate",
    response_model=NarrationResponse,
)
def narrate_route(
    state_id: str,
    store: InMemoryTwinStateStore = Depends(get_state_store),
) -> NarrationResponse:
    if not state_id.strip():
        raise TwinAPIException(
            status_code=422,
            code=INVALID_NARRATION_REQUEST_CODE,
            message="Invalid narration request.",
            details={
                "reason": "Path state_id must contain a non-whitespace value.",
            },
        )

    recommendation = call_store_or_raise(
        store.get_latest_recommendation,
        state_id,
    )

    narration = build_narration_domain(
        recommendation=recommendation,
    )

    return narration