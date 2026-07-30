from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import hashlib
import json
import math
import uuid
from typing import TypeVar

from pydantic import BaseModel
from sqlalchemy import delete, desc, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.persistence.database import (
    SessionFactory,
    create_database_engine,
    create_session_factory,
    create_tables,
)
from app.persistence.models import (
    ActualActionModel,
    CropCycleModel,
    DailyAdvancementModel,
    DiseaseObservationModel,
    FarmModel,
    GrowthObservationModel,
    IrrigationEventModel,
    PlotModel,
    RecommendationRunModel,
    SimulationRunModel,
    TwinStateSnapshotModel,
    WaterObservationModel,
)
from app.schemas import (
    ActualActionCreateRequest,
    ActualActionResponse,
    AdvanceOneDayResponse,
    CreateCropCycleRequest,
    CreateSessionRequest,
    CropType,
    DiseasePredictionResponse,
    FarmCreateRequest,
    FarmResponse,
    GrowthStageResponse,
    HistoryEvent,
    LastIrrigationEvent,
    Location,
    ObservationTimeBasis,
    PlotCreateRequest,
    PlotResponse,
    RecommendationResponse,
    SessionHistoryResponse,
    SessionResponse,
    SessionStateResponse,
    SimulateActionsResponse,
    SoilTexture,
    TwinCurrentState,
    UpdateTwinStateResponse,
    WaterStateResponse,
)
from app.state_store import (
    DailyAdvancementBaselineRequiredError,
    DailyAdvancementDateConflictError,
    DailyAdvancementDiseaseRequiredError,
    DailyAdvancementPayloadConflictError,
    DailyAdvancementTargetConflictError,
    DuplicateActualActionError,
    DuplicateIrrigationEventApplicationError,
    IncompleteStateError,
    IrrigationEventPayloadConflictError,
    IrrigationEventStateMismatchError,
    MissingCachedOutputError,
    OutOfOrderWaterObservationError,
    PersistenceIntegrityError,
    RecommendationStateMismatchError,
    RelatedRecommendationNotFoundError,
    StateNotFoundError,
    TwinSessionRecord,
    StaleWaterBaselineError,
    WaterBaseline,
    WaterBaselineMismatchError,
    WaterObservationTimeConflictError,
    WaterStateConcurrencyConflictError,
    WaterUpdateConcurrencyConflictError,
    WaterUpdatePayloadConflictError,
    ensure_utc_datetime,
    irrigation_event_payload_conflict_field,
    normalize_irrigation_event,
    snapshot_source_fingerprint,
    utc_now,
)

_ModelT = TypeVar("_ModelT", bound=BaseModel)


def get_daily_advancement(
        self,
        state_id: str,
        advancement_id: str,
        request_fingerprint: str,
    ) -> AdvanceOneDayResponse | None:
        advancement_id_value = self._validate_non_empty_bounded_string(
            advancement_id,
            field_name="advancement_id",
            max_length=120,
        )
        request_fingerprint_value = self._validate_request_fingerprint(
            request_fingerprint,
        )
        with self._session_factory() as session:
            self._get_cycle_or_raise(session, state_id)
            row = self._daily_advancement_for_id(
                session,
                state_id=state_id,
                advancement_id=advancement_id_value,
            )
            if row is None:
                return None
            return self._daily_response_from_row_or_raise(
                session,
                row,
                state_id=state_id,
                advancement_id=advancement_id_value,
                request_fingerprint=request_fingerprint_value,
                advancement_created=False,
                snapshot_created=False,
            )


def get_daily_advancement_id_for_target_date(
        self,
        state_id: str,
        target_date: date,
    ) -> str | None:
        with self._session_factory() as session:
            self._get_cycle_or_raise(session, state_id)
            row = self._daily_advancement_for_target_date(
                session,
                state_id=state_id,
                target_date=target_date,
            )
            return None if row is None else row.advancement_id


def cache_daily_advancement(
        self,
        *,
        state_id: str,
        advancement_id: str,
        request_fingerprint: str,
        target_date: date,
        growth_state: GrowthStageResponse,
        water_state: WaterStateResponse,
        water_update_id: str,
        weather_payload: dict[str, object],
        expected_base_water_observation_id: str,
        expected_base_water_sequence: int,
        calculated_previous_root_zone_depletion_mm: float,
        reported_irrigation_event: LastIrrigationEvent | None,
        effective_irrigation_mm: float,
        computed_at: datetime,
    ) -> AdvanceOneDayResponse:
        if growth_state.state_id != state_id:
            raise ValueError("growth_state.state_id does not match state_id.")
        if water_state.state_id != state_id:
            raise ValueError("water_state.state_id does not match state_id.")
        advancement_id_value = self._validate_non_empty_bounded_string(
            advancement_id,
            field_name="advancement_id",
            max_length=120,
        )
        request_fingerprint_value = self._validate_request_fingerprint(
            request_fingerprint,
        )
        water_update_id_value = self._validate_water_update_id(water_update_id)
        computed_at_value = ensure_utc_datetime(
            computed_at,
            field_name="computed_at",
        )
        observed_at = self._as_utc(water_state.observed_at)
        normalized_event = (
            normalize_irrigation_event(state_id, reported_irrigation_event)
            if reported_irrigation_event is not None
            else None
        )
        reported_event_id = (
            normalized_event.irrigation_event_id
            if normalized_event is not None
            else None
        )
        effective_irrigation_mm_value = self._validate_effective_irrigation_mm(
            effective_irrigation_mm,
        )
        try:
            with self._session_factory() as session:
                with session.begin():
                    cycle = self._get_cycle_or_raise(session, state_id)
                    existing = self._daily_advancement_for_id(
                        session,
                        state_id=state_id,
                        advancement_id=advancement_id_value,
                    )
                    if existing is not None:
                        return self._daily_response_from_row_or_raise(
                            session,
                            existing,
                            state_id=state_id,
                            advancement_id=advancement_id_value,
                            request_fingerprint=request_fingerprint_value,
                            advancement_created=False,
                            snapshot_created=False,
                        )
                    target_existing = self._daily_advancement_for_target_date(
                        session,
                        state_id=state_id,
                        target_date=target_date,
                    )
                    if target_existing is not None:
                        raise DailyAdvancementTargetConflictError(
                            state_id,
                            target_date=target_date,
                            existing_advancement_id=target_existing.advancement_id,
                        )

                    base_row = self._canonical_water_row(session, cycle)
                    if base_row is None:
                        raise DailyAdvancementBaselineRequiredError(state_id)
                    base_date = self._as_utc(base_row.observed_at).date()
                    expected_date = base_date + timedelta(days=1)
                    if target_date != expected_date:
                        raise DailyAdvancementDateConflictError(
                            state_id,
                            requested_target_date=target_date,
                            expected_target_date=expected_date,
                            canonical_base_date=base_date,
                            base_water_observation_id=base_row.observation_id,
                            base_water_sequence=base_row.water_sequence,
                        )
                    self._validate_expected_water_baseline(
                        session,
                        state_id=state_id,
                        supplied_base_water_observation_id=(
                            expected_base_water_observation_id
                        ),
                        supplied_base_water_sequence=self._validate_base_sequence(
                            expected_base_water_sequence,
                            field_name="expected_base_water_sequence",
                        ),
                        current_base_water_observation_id=base_row.observation_id,
                        current_base_water_sequence=base_row.water_sequence,
                    )
                    current_depletion = float(base_row.root_zone_depletion_mm)
                    if not math.isclose(
                        float(calculated_previous_root_zone_depletion_mm),
                        current_depletion,
                        rel_tol=0.0,
                        abs_tol=1e-9,
                    ):
                        raise WaterBaselineMismatchError(
                            "Calculated previous_root_zone_depletion_mm does not "
                            "match the canonical water baseline.",
                            state_id=state_id,
                            supplied_previous_root_zone_depletion_mm=(
                                calculated_previous_root_zone_depletion_mm
                            ),
                            current_previous_root_zone_depletion_mm=current_depletion,
                        )
                    if observed_at.date() != target_date:
                        raise WaterBaselineMismatchError(
                            "Daily advancement observed_at must match target_date.",
                            state_id=state_id,
                            observed_at=observed_at.isoformat(),
                            target_date=target_date.isoformat(),
                        )
                    if observed_at <= self._as_utc(base_row.observed_at):
                        raise OutOfOrderWaterObservationError(
                            state_id,
                            supplied_observed_at=observed_at,
                            current_observed_at=self._as_utc(base_row.observed_at),
                        )
                    disease_row = self._latest_row(
                        session,
                        DiseaseObservationModel,
                        state_id,
                    )
                    if disease_row is None:
                        raise DailyAdvancementDiseaseRequiredError(state_id)

                    applied_event_id: str | None = None
                    already_accounted_for = False
                    if normalized_event is not None and reported_event_id is not None:
                        self._get_or_create_irrigation_event(
                            session,
                            state_id=state_id,
                            event=normalized_event,
                            recorded_at=computed_at_value,
                        )
                        existing_water = self._water_for_irrigation_event(
                            session,
                            state_id=state_id,
                            event_id=reported_event_id,
                        )
                        if existing_water is not None:
                            already_accounted_for = True
                            if effective_irrigation_mm_value != 0.0:
                                raise WaterUpdateConcurrencyConflictError(
                                    state_id,
                                    reported_event_id,
                                )
                        else:
                            self._validate_effective_matches_event(
                                state_id=state_id,
                                irrigation_event_id=reported_event_id,
                                event_amount_mm=normalized_event.amount_mm,
                                effective_irrigation_mm=(
                                    effective_irrigation_mm_value
                                ),
                            )
                            applied_event_id = reported_event_id
                    elif effective_irrigation_mm_value != 0.0:
                        raise ValueError(
                            "effective_irrigation_mm must be 0 when no irrigation "
                            "event is reported."
                        )

                    water_observation_id = self._new_id("water_obs")
                    growth_observation_id = self._new_id("growth_obs")
                    next_sequence = base_row.water_sequence + 1
                    canonical_water_state = water_state.model_copy(
                        update={
                            "water_observation_id": water_observation_id,
                            "water_sequence": next_sequence,
                            "base_water_observation_id": base_row.observation_id,
                            "base_water_sequence": base_row.water_sequence,
                            "previous_root_zone_depletion_mm": current_depletion,
                            "water_update_id": water_update_id_value,
                            "reported_irrigation_event_id": reported_event_id,
                            "applied_irrigation_event_id": applied_event_id,
                            "effective_irrigation_mm": (
                                effective_irrigation_mm_value
                            ),
                            "irrigation_event_already_accounted_for": (
                                reported_event_id is not None
                                and already_accounted_for
                                and effective_irrigation_mm_value == 0.0
                            ),
                            "observed_at": observed_at,
                            "computed_at": computed_at_value,
                        },
                        deep=True,
                    )
                    session.add(
                        GrowthObservationModel(
                            observation_id=growth_observation_id,
                            state_id=state_id,
                            observed_at=observed_at,
                            computed_at=computed_at_value,
                            observation_time_basis=(
                                canonical_water_state.observation_time_basis.value
                            ),
                            current_date=growth_state.current_date,
                            days_since_planting=growth_state.days_since_planting,
                            growth_stage=growth_state.growth_stage.value,
                            stage_progress=growth_state.stage_progress,
                            payload_json=self._dump(growth_state),
                        )
                    )
                    session.add(
                        WaterObservationModel(
                            observation_id=water_observation_id,
                            state_id=state_id,
                            observed_at=observed_at,
                            computed_at=computed_at_value,
                            observation_time_basis=(
                                canonical_water_state.observation_time_basis.value
                            ),
                            growth_observation_id=growth_observation_id,
                            water_sequence=next_sequence,
                            base_water_observation_id=base_row.observation_id,
                            base_water_sequence=base_row.water_sequence,
                            water_update_id=water_update_id_value,
                            request_fingerprint=request_fingerprint_value,
                            weather_payload_json=weather_payload,
                            previous_root_zone_depletion_mm=current_depletion,
                            raw_root_zone_depletion_mm=(
                                canonical_water_state.raw_root_zone_depletion_mm
                            ),
                            root_zone_depletion_mm=(
                                canonical_water_state.root_zone_depletion_mm
                            ),
                            water_surplus_mm=canonical_water_state.water_surplus_mm,
                            depletion_beyond_taw_mm=(
                                canonical_water_state.depletion_beyond_taw_mm
                            ),
                            irrigation_event_id=applied_event_id,
                            reported_irrigation_event_id=reported_event_id,
                            effective_irrigation_mm=effective_irrigation_mm_value,
                            payload_json=self._dump(canonical_water_state),
                        )
                    )
                    session.flush()
                    updated = session.execute(
                        update(CropCycleModel)
                        .where(
                            CropCycleModel.state_id == state_id,
                            CropCycleModel.water_sequence == base_row.water_sequence,
                        )
                        .values(
                            water_sequence=next_sequence,
                            latest_water_observation_id=water_observation_id,
                            latest_observed_at=observed_at,
                            latest_computed_at=computed_at_value,
                        )
                    )
                    if updated.rowcount != 1:
                        raise WaterStateConcurrencyConflictError(state_id)
                    water_row = session.get(
                        WaterObservationModel,
                        water_observation_id,
                    )
                    growth_row = session.get(
                        GrowthObservationModel,
                        growth_observation_id,
                    )
                    if water_row is None or growth_row is None:
                        raise PersistenceIntegrityError()
                    twin_state = self._create_or_reuse_snapshot_for_rows(
                        session,
                        cycle=cycle,
                        disease_row=disease_row,
                        growth_row=growth_row,
                        water_row=water_row,
                    )
                    snapshot_id = twin_state.snapshot_id
                    if snapshot_id is None:
                        raise PersistenceIntegrityError(
                            "Daily advancement snapshot ID was not persisted."
                        )
                    session.add(
                        DailyAdvancementModel(
                            daily_advancement_record_id=self._new_id(
                                "daily_advancement"
                            ),
                            state_id=state_id,
                            advancement_id=advancement_id_value,
                            request_fingerprint=request_fingerprint_value,
                            target_date=target_date,
                            base_water_observation_id=base_row.observation_id,
                            base_water_sequence=base_row.water_sequence,
                            disease_observation_id=disease_row.observation_id,
                            growth_observation_id=growth_observation_id,
                            water_observation_id=water_observation_id,
                            snapshot_id=snapshot_id,
                            water_sequence=next_sequence,
                            created_at=computed_at_value,
                        )
                    )
                    session.flush()
                    return AdvanceOneDayResponse(
                        state_id=state_id,
                        advancement_id=advancement_id_value,
                        target_date=target_date,
                        advancement_created=True,
                        water_state=canonical_water_state.model_copy(deep=True),
                        twin_state=twin_state,
                    )
        except IntegrityError as exc:
            return self._handle_daily_advancement_integrity_error(
                state_id=state_id,
                advancement_id=advancement_id_value,
                request_fingerprint=request_fingerprint_value,
                target_date=target_date,
                original_error=exc,
            )


def _daily_advancement_for_id(
        self,
        session: Session,
        *,
        state_id: str,
        advancement_id: str,
    ) -> DailyAdvancementModel | None:
        return session.scalars(
            select(DailyAdvancementModel)
            .where(
                DailyAdvancementModel.state_id == state_id,
                DailyAdvancementModel.advancement_id == advancement_id,
            )
            .limit(1)
        ).first()


def _daily_advancement_for_target_date(
        self,
        session: Session,
        *,
        state_id: str,
        target_date: date,
    ) -> DailyAdvancementModel | None:
        return session.scalars(
            select(DailyAdvancementModel)
            .where(
                DailyAdvancementModel.state_id == state_id,
                DailyAdvancementModel.target_date == target_date,
            )
            .limit(1)
        ).first()


def _daily_response_from_row_or_raise(
        self,
        session: Session,
        row: DailyAdvancementModel,
        *,
        state_id: str,
        advancement_id: str,
        request_fingerprint: str,
        advancement_created: bool,
        snapshot_created: bool,
    ) -> AdvanceOneDayResponse:
        if row.state_id != state_id:
            raise StateNotFoundError(state_id)
        if row.request_fingerprint != request_fingerprint:
            raise DailyAdvancementPayloadConflictError(
                state_id,
                advancement_id,
                existing_fingerprint=row.request_fingerprint,
                request_fingerprint=request_fingerprint,
            )
        water_row = session.get(WaterObservationModel, row.water_observation_id)
        snapshot = session.get(TwinStateSnapshotModel, row.snapshot_id)
        if water_row is None or snapshot is None:
            raise PersistenceIntegrityError(
                "Daily advancement ledger references missing outputs."
            )
        return AdvanceOneDayResponse(
            state_id=state_id,
            advancement_id=row.advancement_id,
            target_date=row.target_date,
            advancement_created=advancement_created,
            water_state=self._water_state_from_row(water_row).model_copy(deep=True),
            twin_state=self._snapshot_update_response(
                session,
                state_id=state_id,
                snapshot=snapshot,
                snapshot_created=snapshot_created,
            ),
        )


def _handle_daily_advancement_integrity_error(
        self,
        *,
        state_id: str,
        advancement_id: str,
        request_fingerprint: str,
        target_date: date,
        original_error: IntegrityError,
    ) -> AdvanceOneDayResponse:
        with self._session_factory() as session:
            self._get_cycle_or_raise(session, state_id)
            existing = self._daily_advancement_for_id(
                session,
                state_id=state_id,
                advancement_id=advancement_id,
            )
            if existing is not None:
                return self._daily_response_from_row_or_raise(
                    session,
                    existing,
                    state_id=state_id,
                    advancement_id=advancement_id,
                    request_fingerprint=request_fingerprint,
                    advancement_created=False,
                    snapshot_created=False,
                )
            target_existing = self._daily_advancement_for_target_date(
                session,
                state_id=state_id,
                target_date=target_date,
            )
            if target_existing is not None:
                raise DailyAdvancementTargetConflictError(
                    state_id,
                    target_date=target_date,
                    existing_advancement_id=target_existing.advancement_id,
                ) from original_error
        raise WaterStateConcurrencyConflictError(state_id) from original_error


__all__ = [
    "get_daily_advancement",
    "get_daily_advancement_id_for_target_date",
    "cache_daily_advancement",
    "_daily_advancement_for_id",
    "_daily_advancement_for_target_date",
    "_daily_response_from_row_or_raise",
    "_handle_daily_advancement_integrity_error",
]
