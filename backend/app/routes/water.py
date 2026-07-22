"""Route orchestration for deterministic tomato water-state updates.

The compute route uses the accepted growth and water-balance modules and
caches their completed outputs. The update route asks the store to build the
canonical twin state. This module prevents irrigation-event double counting
and does not simulate, recommend, or narrate.
"""

from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Query

from app.dependencies import (
    TwinAPIException,
    call_store_or_raise,
    get_state_store,
)
from app.external.weather_client import WeatherClientError, fetch_daily_weather
from app.growth_stage.resolver import resolve_growth_stage
from app.schemas import (
    ComputeWaterStateRequest,
    LastIrrigationEvent,
    ObservationTimeBasis,
    StateIdRequest,
    UpdateTwinStateResponse,
    WeatherSnapshotResponse,
    WaterStateResponse,
)
from app.state_store import utc_now, with_irrigation_event_id
from app.store_protocol import TwinStateStore
from app.water.update_identity import (
    compute_water_update_fingerprint,
    derive_water_update_id,
)
from app.water.water_balance import (
    compute_water_state as compute_water_state_domain,
)


router = APIRouter(tags=["water"])


INVALID_WATER_STATE_REQUEST_CODE = "INVALID_WATER_STATE_REQUEST"
INVALID_WEATHER_REQUEST_CODE = "INVALID_WEATHER_REQUEST"
WEATHER_LOOKUP_FAILED_CODE = "WEATHER_LOOKUP_FAILED"
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


def _validate_weather_state_id(state_id: str) -> None:
    if not state_id.strip():
        raise TwinAPIException(
            status_code=422,
            code=INVALID_WEATHER_REQUEST_CODE,
            message="Invalid weather request.",
            details={
                "reason": "Path state_id must contain a non-whitespace value.",
            },
        )


def _parse_weather_target_date(target_date: str) -> date:
    try:
        return date.fromisoformat(target_date)
    except ValueError as exc:
        raise TwinAPIException(
            status_code=422,
            code=INVALID_WEATHER_REQUEST_CODE,
            message="Invalid weather request.",
            details={
                "reason": "target_date must be an ISO date in YYYY-MM-DD format.",
                "target_date": target_date,
            },
        ) from exc


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


@router.get(
    "/sessions/{state_id}/weather-snapshot",
    response_model=WeatherSnapshotResponse,
)
async def get_weather_snapshot_route(
    state_id: str,
    target_date: str = Query(...),
    store: TwinStateStore = Depends(get_state_store),
) -> WeatherSnapshotResponse:
    _validate_weather_state_id(state_id)
    parsed_target_date = _parse_weather_target_date(target_date)

    record = call_store_or_raise(
        store.get_record,
        state_id,
    )

    try:
        snapshot = await fetch_daily_weather(
            latitude=record.location.latitude,
            longitude=record.location.longitude,
            target_date=parsed_target_date,
        )
    except ValueError as exc:
        raise TwinAPIException(
            status_code=422,
            code=INVALID_WEATHER_REQUEST_CODE,
            message="Invalid weather request.",
            details={"reason": str(exc)},
        ) from exc
    except WeatherClientError as exc:
        raise TwinAPIException(
            status_code=502,
            code=WEATHER_LOOKUP_FAILED_CODE,
            message="Failed to retrieve weather for this farm.",
            details={
                "reason": str(exc),
                "target_date": parsed_target_date.isoformat(),
                "source": "open_meteo",
            },
        ) from exc

    return snapshot.model_copy(update={"state_id": state_id})


@router.post(
    "/sessions/{state_id}/compute-water-state",
    response_model=WaterStateResponse,
)
def compute_water_state_route(
    state_id: str,
    request: ComputeWaterStateRequest,
    store: TwinStateStore = Depends(get_state_store),
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

    if request.observed_at is None:
        observed_at = datetime.combine(
            request.current_date,
            datetime.min.time(),
            tzinfo=timezone.utc,
        )
        observation_time_basis = ObservationTimeBasis.DATE_ONLY_UTC_START
    else:
        observed_at = request.observed_at
        observation_time_basis = ObservationTimeBasis.EXPLICIT

    water_update_id = request.water_update_id or derive_water_update_id(
        state_id=state_id,
        observed_at=observed_at,
        observation_time_basis=observation_time_basis,
    )

    reported_irrigation_event: LastIrrigationEvent | None = None
    reported_irrigation_event_id: str | None = None
    if request.last_irrigation_event is not None:
        reported_irrigation_event = with_irrigation_event_id(
            state_id,
            request.last_irrigation_event,
        )
        reported_irrigation_event_id = reported_irrigation_event.irrigation_event_id
        if reported_irrigation_event_id is None:
            raise TwinAPIException(
                status_code=422,
                code=INVALID_WATER_STATE_REQUEST_CODE,
                message="Invalid water state request.",
                details={"reason": "irrigation_event_id could not be resolved."},
            )

    request_fingerprint = compute_water_update_fingerprint(
        state_id=state_id,
        water_update_id=water_update_id,
        current_date=request.current_date,
        observed_at=observed_at,
        observation_time_basis=observation_time_basis,
        weather=request.weather,
        last_irrigation_event=reported_irrigation_event,
        base_water_observation_id=request.base_water_observation_id,
        base_water_sequence=request.base_water_sequence,
    )

    existing_water_state = call_store_or_raise(
        store.get_water_state_for_update,
        state_id,
        water_update_id,
        request_fingerprint,
    )
    if existing_water_state is not None:
        return existing_water_state

    canonical_baseline = call_store_or_raise(
        store.get_canonical_water_baseline,
        state_id,
    )
    expected_base_water_observation_id = (
        request.base_water_observation_id
        if request.base_water_sequence is not None
        else (
            None
            if canonical_baseline is None
            else canonical_baseline.water_observation_id
        )
    )
    expected_base_water_sequence = (
        request.base_water_sequence
        if request.base_water_sequence is not None
        else (0 if canonical_baseline is None else canonical_baseline.water_sequence)
    )
    previous_root_zone_depletion_mm = (
        0.0
        if canonical_baseline is None
        else canonical_baseline.root_zone_depletion_mm
    )

    irrigation_event_already_applied = False
    effective_irrigation_mm = 0.0
    irrigation_event_for_balance: LastIrrigationEvent | None = None
    if reported_irrigation_event is not None and reported_irrigation_event_id is not None:
        irrigation_event_already_applied = call_store_or_raise(
            store.has_applied_irrigation_event,
            state_id,
            reported_irrigation_event_id,
            irrigation_event=reported_irrigation_event,
        )
        if irrigation_event_already_applied:
            effective_irrigation_mm = 0.0
            irrigation_event_for_balance = None
        else:
            effective_irrigation_mm = reported_irrigation_event.amount_mm
            irrigation_event_for_balance = reported_irrigation_event
    else:
        effective_irrigation_mm = 0.0

    try:
        computed_at = utc_now()
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
            last_irrigation_event=irrigation_event_for_balance,
            previous_root_zone_depletion_mm=previous_root_zone_depletion_mm,
            observed_at=observed_at,
            observation_time_basis=observation_time_basis,
            computed_at=computed_at,
        )
        water_state = water_state.model_copy(
            update={
                "water_update_id": water_update_id,
                "reported_irrigation_event_id": reported_irrigation_event_id,
                "applied_irrigation_event_id": (
                    reported_irrigation_event_id
                    if irrigation_event_for_balance is not None
                    else None
                ),
                "effective_irrigation_mm": effective_irrigation_mm,
                "irrigation_event_already_accounted_for": (
                    reported_irrigation_event_id is not None
                    and irrigation_event_already_applied
                ),
                "base_water_observation_id": expected_base_water_observation_id,
                "base_water_sequence": expected_base_water_sequence,
                "previous_root_zone_depletion_mm": previous_root_zone_depletion_mm,
            },
            deep=True,
        )
    except ValueError as exc:
        raise TwinAPIException(
            status_code=422,
            code=INVALID_WATER_STATE_REQUEST_CODE,
            message="Invalid water state request.",
            details={"reason": str(exc)},
        ) from exc

    return call_store_or_raise(
        store.cache_water_update,
        state_id=state_id,
        growth_state=growth_state,
        water_state=water_state,
        water_update_id=water_update_id,
        request_fingerprint=request_fingerprint,
        weather_payload=request.weather.model_dump(mode="json"),
        previous_root_zone_depletion_mm=previous_root_zone_depletion_mm,
        expected_base_water_observation_id=expected_base_water_observation_id,
        expected_base_water_sequence=expected_base_water_sequence,
        calculated_previous_root_zone_depletion_mm=previous_root_zone_depletion_mm,
        reported_irrigation_event=reported_irrigation_event,
        effective_irrigation_mm=effective_irrigation_mm,
        computed_at=computed_at,
    )


@router.post(
    "/sessions/{state_id}/update-twin-state",
    response_model=UpdateTwinStateResponse,
)
def update_twin_state_route(
    state_id: str,
    request: StateIdRequest,
    store: TwinStateStore = Depends(get_state_store),
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
