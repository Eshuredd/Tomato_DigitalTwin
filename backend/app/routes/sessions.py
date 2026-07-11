"""Session routes for tomato digital twin state management."""

from fastapi import APIRouter, Depends
import math

from app.schemas import (
    CreateSessionRequest,
    SessionHistoryResponse,
    SessionResponse,
    SessionStateResponse,
)
from app.state_store import InMemoryTwinStateStore
from app.dependencies import (
    TwinAPIException,
    call_store_or_raise,
    get_state_store,
)
from app.external.elevation_client import fetch_elevation_m


INVALID_LOCATION_CODE = "INVALID_LOCATION"
ELEVATION_LOOKUP_FAILED_CODE = "ELEVATION_LOOKUP_FAILED"

MIN_VALID_ELEVATION_M = -500.0

MIN_VALID_ELEVATION_M_BASIS = (
    "aligned_with_eto_input_validation_lower_bound"
)


router = APIRouter(tags=["sessions"])


def _is_finite_number(value: object) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )


def _validate_elevation_m(value: object) -> float:
    if not _is_finite_number(value):
        raise ValueError("elevation_m must be a finite number.")

    elevation_m = float(value)
    if elevation_m < MIN_VALID_ELEVATION_M:
        raise ValueError("elevation_m must be >= -500.0.")

    return elevation_m


async def _resolve_elevation_m(request: CreateSessionRequest) -> float:
    if not isinstance(request, CreateSessionRequest):
        raise ValueError("request must be a CreateSessionRequest.")

    if request.location.elevation_m is not None:
        return _validate_elevation_m(request.location.elevation_m)

    fetched_elevation_m = await fetch_elevation_m(
        latitude=request.location.latitude,
        longitude=request.location.longitude,
    )
    return _validate_elevation_m(fetched_elevation_m)


@router.post("/sessions", response_model=SessionResponse)
async def create_session(
    request: CreateSessionRequest,
    store: InMemoryTwinStateStore = Depends(get_state_store),
) -> SessionResponse:
    try:
        elevation_m = await _resolve_elevation_m(request)
    except ValueError as exc:
        raise TwinAPIException(
            status_code=422,
            code=INVALID_LOCATION_CODE,
            message="Invalid session location or elevation.",
            details={"reason": str(exc)},
        ) from exc
    except Exception as exc:
        raise TwinAPIException(
            status_code=500,
            code=ELEVATION_LOOKUP_FAILED_CODE,
            message="Failed to resolve elevation for the session location.",
            details={
                "error_type": exc.__class__.__name__,
                "reason": str(exc),
            },
        ) from exc

    return call_store_or_raise(
        store.create_session,
        request=request,
        elevation_m=elevation_m,
    )


@router.get("/sessions/{state_id}", response_model=SessionStateResponse)
async def get_session_state(
    state_id: str,
    store: InMemoryTwinStateStore = Depends(get_state_store),
) -> SessionStateResponse:
    return call_store_or_raise(
        store.get_session_state_response,
        state_id,
    )


@router.get("/sessions/{state_id}/history", response_model=SessionHistoryResponse)
async def get_session_history(
    state_id: str,
    store: InMemoryTwinStateStore = Depends(get_state_store),
) -> SessionHistoryResponse:
    return call_store_or_raise(
        store.get_history_response,
        state_id,
    )
