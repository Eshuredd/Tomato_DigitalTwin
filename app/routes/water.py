"""Route orchestration for deterministic tomato water-state updates.

The compute route uses the accepted growth and water-balance modules and
caches their completed outputs. The update route asks the store to build the
canonical twin state. This module prevents irrigation-event double counting
and does not simulate, recommend, or narrate.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import (
    TwinAPIException,
    call_store_or_raise,
    get_state_store,
)
from app.growth_stage.resolver import resolve_growth_stage
from app.schemas import (
    ComputeWaterStateRequest,
    StateIdRequest,
    UpdateTwinStateResponse,
    WaterStateResponse,
)
from app.state_store import InMemoryTwinStateStore
from app.water.water_balance import (
    compute_water_state as compute_water_state_domain,
)


router = APIRouter(tags=["water"])


INVALID_WATER_STATE_REQUEST_CODE = "INVALID_WATER_STATE_REQUEST"
STATE_ID_MISMATCH_CODE = "STATE_ID_MISMATCH"
SESSION_ELEVATION_MISSING_CODE = "SESSION_ELEVATION_MISSING"


def _validate_state_id(state_id: str) -> None:
    if not state_id.strip():
        raise TwinAPIException(
            status_code=422,
            code=INVALID_WATER_STATE_REQUEST_CODE,
            message="Invalid water state request.",
            details={
                "reason": "Path state_id must contain a non-whitespace value.",
            },
        )


def _validate_matching_state_id(
    *,
    path_state_id: str,
    request_state_id: str,
    message: str,
) -> None:
    if request_state_id != path_state_id:
        raise TwinAPIException(
            status_code=422,
            code=STATE_ID_MISMATCH_CODE,
            message=message,
            details={
                "path_state_id": path_state_id,
                "request_state_id": request_state_id,
            },
        )


def _validate_session_elevation(elevation_m: float | None) -> float:
    if elevation_m is None:
        raise TwinAPIException(
            status_code=500,
            code=SESSION_ELEVATION_MISSING_CODE,
            message="Session elevation is missing.",
            details={
                "reason": (
                    "Session location.elevation_m must be populated before "
                    "computing water state."
                ),
            },
        )

    return elevation_m


@router.post(
    "/sessions/{state_id}/compute-water-state",
    response_model=WaterStateResponse,
)
def compute_water_state_route(
    state_id: str,
    request: ComputeWaterStateRequest,
    store: InMemoryTwinStateStore = Depends(get_state_store),
) -> WaterStateResponse:
    _validate_state_id(state_id)
    _validate_matching_state_id(
        path_state_id=state_id,
        request_state_id=request.state_id,
        message="Water state request state_id mismatch.",
    )

    record = call_store_or_raise(
        store.get_record,
        state_id,
    )

    elevation_m = _validate_session_elevation(record.location.elevation_m)

    previous_current_state = record.current_state
    last_irrigation_event = request.last_irrigation_event

    if last_irrigation_event is None:
        irrigation_event_for_update = None
    elif previous_current_state is None:
        irrigation_event_for_update = last_irrigation_event
    elif last_irrigation_event.timestamp > previous_current_state.last_update_time:
        irrigation_event_for_update = last_irrigation_event
    else:
        irrigation_event_for_update = None

    previous_root_zone_depletion_mm = (
        None
        if previous_current_state is None
        else previous_current_state.root_zone_depletion
    )

    try:
        growth_state = resolve_growth_stage(
            state_id=state_id,
            crop_type=record.crop_type,
            planting_date=record.planting_date,
            current_date=request.current_date,
        )

        water_state = compute_water_state_domain(
            state_id=state_id,
            crop_type=record.crop_type,
            growth_stage=growth_state.growth_stage,
            soil_texture=record.soil_texture,
            current_date=request.current_date,
            weather=request.weather,
            latitude_deg=record.location.latitude,
            elevation_m=elevation_m,
            last_irrigation_event=irrigation_event_for_update,
            previous_root_zone_depletion_mm=previous_root_zone_depletion_mm,
        )
    except ValueError as exc:
        raise TwinAPIException(
            status_code=422,
            code=INVALID_WATER_STATE_REQUEST_CODE,
            message="Invalid water state request.",
            details={"reason": str(exc)},
        ) from exc

    call_store_or_raise(
        store.cache_growth_state,
        state_id=state_id,
        growth_state=growth_state,
    )

    return call_store_or_raise(
        store.cache_water_state,
        state_id=state_id,
        water_state=water_state,
    )


@router.post(
    "/sessions/{state_id}/update-twin-state",
    response_model=UpdateTwinStateResponse,
)
def update_twin_state_route(
    state_id: str,
    request: StateIdRequest,
    store: InMemoryTwinStateStore = Depends(get_state_store),
) -> UpdateTwinStateResponse:
    _validate_state_id(state_id)
    _validate_matching_state_id(
        path_state_id=state_id,
        request_state_id=request.state_id,
        message="Twin state request state_id mismatch.",
    )

    return call_store_or_raise(
        store.update_current_state,
        state_id,
    )