"""Route orchestration for deterministic irrigation recommendation.

The recommendation engine consumes an existing current state and cached
simulation. It owns action selection and disease policy; this route does not
recompute, simulate, or narrate.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import (
    TwinAPIException,
    call_store_or_raise,
    get_state_store,
)
from app.recommendation.engine import (
    recommend_action as build_recommendation_domain,
)
from app.schemas import RecommendationResponse
from app.state_store import InMemoryTwinStateStore


router = APIRouter(tags=["recommendation"])


INVALID_RECOMMENDATION_REQUEST_CODE = "INVALID_RECOMMENDATION_REQUEST"


@router.post(
    "/sessions/{state_id}/recommend",
    response_model=RecommendationResponse,
)
def recommend_route(
    state_id: str,
    store: InMemoryTwinStateStore = Depends(get_state_store),
) -> RecommendationResponse:
    if not state_id.strip():
        raise TwinAPIException(
            status_code=422,
            code=INVALID_RECOMMENDATION_REQUEST_CODE,
            message="Invalid recommendation request.",
            details={
                "reason": "Path state_id must contain a non-whitespace value.",
            },
        )

    current_state = call_store_or_raise(
        store.get_current_state,
        state_id,
    )

    simulation = call_store_or_raise(
        store.get_latest_simulation,
        state_id,
    )

    recommendation = build_recommendation_domain(
        state_id=state_id,
        current_state=current_state,
        simulation=simulation,
    )

    return call_store_or_raise(
        store.cache_recommendation,
        state_id=state_id,
        recommendation=recommendation,
    )
