"""Manual deterministic one-day twin advancement orchestration."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends

from app.dependencies import (
    TwinAPIException,
    call_store_or_raise,
    get_state_store,
    raise_from_store_error,
)
from app.growth_stage.resolver import resolve_growth_stage
from app.routes.water import (
    SESSION_ELEVATION_MISSING_CODE,
    STATE_ID_MISMATCH_CODE,
    _validate_session_elevation,
)
from app.schemas import (
    AdvanceOneDayRequest,
    AdvanceOneDayResponse,
    LastIrrigationEvent,
    ObservationTimeBasis,
)
from app.state_store import (
    DailyAdvancementBaselineRequiredError,
    DailyAdvancementDateConflictError,
    DailyAdvancementDiseaseRequiredError,
    DailyAdvancementTargetConflictError,
    utc_now,
    with_irrigation_event_id,
)
from app.store_protocol import TwinStateStore
from app.water.update_identity import (
    compute_daily_advancement_fingerprint,
    derive_daily_advancement_water_update_id,
)
from app.water.water_balance import (
    compute_water_state as compute_water_state_domain,
)


router = APIRouter(tags=["advancement"])

INVALID_DAILY_ADVANCEMENT_REQUEST_CODE = "INVALID_DAILY_ADVANCEMENT_REQUEST"


@router.post(
    "/sessions/{state_id}/advance-one-day",
    response_model=AdvanceOneDayResponse,
)
def advance_one_day_route(
    state_id: str,
    request: AdvanceOneDayRequest,
    store: TwinStateStore = Depends(get_state_store),
) -> AdvanceOneDayResponse:
    if not state_id.strip():
        raise TwinAPIException(
            status_code=422,
            code=INVALID_DAILY_ADVANCEMENT_REQUEST_CODE,
            message="Invalid daily advancement request.",
            details={"reason": "Path state_id must contain a non-whitespace value."},
        )
    if request.state_id != state_id:
        raise TwinAPIException(
            status_code=422,
            code=STATE_ID_MISMATCH_CODE,
            message="Daily advancement request state_id mismatch.",
            details={
                "path_state_id": state_id,
                "request_state_id": request.state_id,
            },
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
                code=INVALID_DAILY_ADVANCEMENT_REQUEST_CODE,
                message="Invalid daily advancement request.",
                details={"reason": "irrigation_event_id could not be resolved."},
            )

    request_fingerprint = compute_daily_advancement_fingerprint(
        state_id=state_id,
        advancement_id=request.advancement_id,
        target_date=request.target_date,
        weather=request.weather,
        last_irrigation_event=reported_irrigation_event,
    )
    existing = call_store_or_raise(
        store.get_daily_advancement,
        state_id,
        request.advancement_id,
        request_fingerprint,
    )
    if existing is not None:
        return existing

    record = call_store_or_raise(store.get_record, state_id)
    elevation_m = _validate_session_elevation(record.location.elevation_m)

    canonical_baseline = call_store_or_raise(
        store.get_canonical_water_baseline,
        state_id,
    )
    if canonical_baseline is None:
        raise_from_store_error(DailyAdvancementBaselineRequiredError(state_id))
    target_owner = call_store_or_raise(
        store.get_daily_advancement_id_for_target_date,
        state_id,
        request.target_date,
    )
    if target_owner is not None and target_owner != request.advancement_id:
        raise_from_store_error(
            DailyAdvancementTargetConflictError(
                state_id,
                target_date=request.target_date,
                existing_advancement_id=target_owner,
            )
        )
    expected_target_date = canonical_baseline.current_date + timedelta(days=1)
    if request.target_date != expected_target_date:
        raise_from_store_error(
            DailyAdvancementDateConflictError(
                state_id,
                requested_target_date=request.target_date,
                expected_target_date=expected_target_date,
                canonical_base_date=canonical_baseline.current_date,
                base_water_observation_id=canonical_baseline.water_observation_id,
                base_water_sequence=canonical_baseline.water_sequence,
            )
        )
    if record.latest_disease_state is None:
        raise_from_store_error(DailyAdvancementDiseaseRequiredError(state_id))

    observed_at = datetime.combine(
        request.target_date,
        datetime.min.time(),
        tzinfo=timezone.utc,
    )
    observation_time_basis = ObservationTimeBasis.DATE_ONLY_UTC_START
    water_update_id = derive_daily_advancement_water_update_id(
        state_id=state_id,
        advancement_id=request.advancement_id,
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

    try:
        computed_at = utc_now()
        growth_state = resolve_growth_stage(
            state_id=state_id,
            crop_type=record.crop_type,
            planting_date=record.planting_date,
            current_date=request.target_date,
        )
        water_state = compute_water_state_domain(
            state_id=state_id,
            crop_type=record.crop_type,
            growth_stage=growth_state.growth_stage,
            soil_texture=record.soil_texture,
            current_date=request.target_date,
            weather=request.weather,
            latitude_deg=record.location.latitude,
            elevation_m=elevation_m,
            last_irrigation_event=irrigation_event_for_balance,
            previous_root_zone_depletion_mm=(
                canonical_baseline.root_zone_depletion_mm
            ),
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
                "base_water_observation_id": (
                    canonical_baseline.water_observation_id
                ),
                "base_water_sequence": canonical_baseline.water_sequence,
                "previous_root_zone_depletion_mm": (
                    canonical_baseline.root_zone_depletion_mm
                ),
            },
            deep=True,
        )
    except ValueError as exc:
        raise TwinAPIException(
            status_code=422,
            code=INVALID_DAILY_ADVANCEMENT_REQUEST_CODE,
            message="Invalid daily advancement request.",
            details={"reason": str(exc)},
        ) from exc

    return call_store_or_raise(
        store.cache_daily_advancement,
        state_id=state_id,
        advancement_id=request.advancement_id,
        request_fingerprint=request_fingerprint,
        target_date=request.target_date,
        growth_state=growth_state,
        water_state=water_state,
        water_update_id=water_update_id,
        weather_payload=request.weather.model_dump(mode="json"),
        expected_base_water_observation_id=canonical_baseline.water_observation_id,
        expected_base_water_sequence=canonical_baseline.water_sequence,
        calculated_previous_root_zone_depletion_mm=(
            canonical_baseline.root_zone_depletion_mm
        ),
        reported_irrigation_event=reported_irrigation_event,
        effective_irrigation_mm=effective_irrigation_mm,
        computed_at=computed_at,
    )
