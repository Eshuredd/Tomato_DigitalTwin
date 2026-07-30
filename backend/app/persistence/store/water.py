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


def get_canonical_water_baseline(
        self,
        state_id: str,
    ) -> WaterBaseline | None:
        with self._session_factory() as session:
            cycle = self._get_cycle_or_raise(session, state_id)
            row = self._canonical_water_row(session, cycle)
            if row is None:
                return None
            return WaterBaseline(
                water_observation_id=row.observation_id,
                water_sequence=row.water_sequence,
                current_date=self._as_utc(row.observed_at).date(),
                observed_at=self._as_utc(row.observed_at),
                root_zone_depletion_mm=row.root_zone_depletion_mm,
                water_update_id=row.water_update_id,
            )


def cache_water_state(
        self,
        state_id: str,
        water_state: WaterStateResponse,
        *,
        weather_payload: dict[str, object] | None = None,
        previous_root_zone_depletion_mm: float | None = None,
        irrigation_event: LastIrrigationEvent | None = None,
    ) -> WaterStateResponse:
        """Deprecated compatibility shim; canonical writes require cache_water_update."""
        raise RuntimeError(
            "cache_water_state is deprecated and cannot advance the canonical "
            "water chain; use cache_water_update with paired growth state."
        )


def cache_water_update(
        self,
        state_id: str,
        growth_state: GrowthStageResponse,
        water_state: WaterStateResponse,
        *,
        water_update_id: str,
        request_fingerprint: str,
        weather_payload: dict[str, object] | None = None,
        previous_root_zone_depletion_mm: float | None = None,
        expected_base_water_observation_id: str | None = None,
        expected_base_water_sequence: int | None = None,
        calculated_previous_root_zone_depletion_mm: float | None = None,
        reported_irrigation_event: LastIrrigationEvent | None = None,
        effective_irrigation_mm: float = 0.0,
        computed_at: datetime | None = None,
    ) -> WaterStateResponse:
        if growth_state.state_id != state_id:
            raise ValueError("growth_state.state_id does not match state_id.")
        if water_state.state_id != state_id:
            raise ValueError("water_state.state_id does not match state_id.")

        water_update_id_value = self._validate_water_update_id(water_update_id)
        request_fingerprint_value = self._validate_request_fingerprint(
            request_fingerprint,
        )
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
        observed_at = self._as_utc(water_state.observed_at)
        computed_at_value = (
            utc_now()
            if computed_at is None
            else ensure_utc_datetime(computed_at, field_name="computed_at")
        )
        canonical_water_state = water_state.model_copy(
            update={
                "observed_at": observed_at,
                "computed_at": computed_at_value,
            },
            deep=True,
        )
        try:
            with self._session_factory() as session:
                with session.begin():
                    cycle = self._get_cycle_or_raise(session, state_id)
                    existing_update = self._water_for_update(
                        session,
                        state_id=state_id,
                        water_update_id=water_update_id_value,
                    )
                    if existing_update is not None:
                        return self._water_state_for_update_row_or_raise(
                            existing_update,
                            state_id=state_id,
                            water_update_id=water_update_id_value,
                            request_fingerprint=request_fingerprint_value,
                        )

                    base_row = self._canonical_water_row(session, cycle)
                    current_base_id = None if base_row is None else base_row.observation_id
                    current_base_sequence = 0 if base_row is None else base_row.water_sequence
                    current_depletion = (
                        0.0 if base_row is None else float(base_row.root_zone_depletion_mm)
                    )
                    supplied_sequence = (
                        current_base_sequence
                        if expected_base_water_sequence is None
                        else self._validate_base_sequence(
                            expected_base_water_sequence,
                            field_name="expected_base_water_sequence",
                        )
                    )
                    supplied_id = (
                        current_base_id
                        if expected_base_water_sequence is None
                        else expected_base_water_observation_id
                    )
                    self._validate_expected_water_baseline(
                        session,
                        state_id=state_id,
                        supplied_base_water_observation_id=supplied_id,
                        supplied_base_water_sequence=supplied_sequence,
                        current_base_water_observation_id=current_base_id,
                        current_base_water_sequence=current_base_sequence,
                    )
                    calculated_previous = (
                        water_state.previous_root_zone_depletion_mm
                        if calculated_previous_root_zone_depletion_mm is None
                        else float(calculated_previous_root_zone_depletion_mm)
                    )
                    if not math.isclose(
                        calculated_previous,
                        current_depletion,
                        rel_tol=0.0,
                        abs_tol=1e-9,
                    ):
                        raise WaterBaselineMismatchError(
                            "Calculated previous_root_zone_depletion_mm does not "
                            "match the canonical water baseline.",
                            state_id=state_id,
                            supplied_previous_root_zone_depletion_mm=calculated_previous,
                            current_previous_root_zone_depletion_mm=current_depletion,
                        )
                    if base_row is not None:
                        base_observed_at = self._as_utc(base_row.observed_at)
                        if observed_at < base_observed_at:
                            raise OutOfOrderWaterObservationError(
                                state_id,
                                supplied_observed_at=observed_at,
                                current_observed_at=base_observed_at,
                            )
                        if observed_at == base_observed_at:
                            raise WaterObservationTimeConflictError(
                                state_id,
                                supplied_observed_at=observed_at,
                                current_observed_at=base_observed_at,
                                observation_time_basis=(
                                    canonical_water_state.observation_time_basis
                                ),
                            )

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
                                existing_update = self._water_for_update(
                                    session,
                                    state_id=state_id,
                                    water_update_id=water_update_id_value,
                                )
                                if existing_update is not None:
                                    return self._water_state_for_update_row_or_raise(
                                        existing_update,
                                        state_id=state_id,
                                        water_update_id=water_update_id_value,
                                        request_fingerprint=(
                                            request_fingerprint_value
                                        ),
                                    )
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

                    canonical_water_state = canonical_water_state.model_copy(
                        update={
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
                        },
                        deep=True,
                    )
                    observation_id = self._new_id("water_obs")
                    growth_observation_id = self._new_id("growth_obs")
                    next_sequence = current_base_sequence + 1
                    canonical_water_state = canonical_water_state.model_copy(
                        update={
                            "water_observation_id": observation_id,
                            "water_sequence": next_sequence,
                            "base_water_observation_id": current_base_id,
                            "base_water_sequence": current_base_sequence,
                            "previous_root_zone_depletion_mm": current_depletion,
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
                            observation_id=observation_id,
                            state_id=state_id,
                            observed_at=observed_at,
                            computed_at=computed_at_value,
                            observation_time_basis=(
                                canonical_water_state.observation_time_basis.value
                            ),
                            growth_observation_id=growth_observation_id,
                            water_sequence=next_sequence,
                            base_water_observation_id=current_base_id,
                            base_water_sequence=current_base_sequence,
                            water_update_id=water_update_id_value,
                            request_fingerprint=request_fingerprint_value,
                            weather_payload_json=weather_payload,
                            previous_root_zone_depletion_mm=(
                                current_depletion
                            ),
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
                            effective_irrigation_mm=(
                                effective_irrigation_mm_value
                            ),
                            payload_json=self._dump(canonical_water_state),
                        )
                    )
                    session.flush()
                    updated = session.execute(
                        update(CropCycleModel)
                        .where(
                            CropCycleModel.state_id == state_id,
                            CropCycleModel.water_sequence == current_base_sequence,
                        )
                        .values(
                            water_sequence=next_sequence,
                            latest_water_observation_id=observation_id,
                            latest_observed_at=observed_at,
                            latest_computed_at=computed_at_value,
                        )
                    )
                    if updated.rowcount != 1:
                        raise WaterStateConcurrencyConflictError(state_id)
                    cycle.latest_observed_at = observed_at
                    cycle.latest_computed_at = computed_at_value
        except IntegrityError as exc:
            return self._handle_water_update_integrity_error(
                state_id=state_id,
                water_update_id=water_update_id_value,
                request_fingerprint=request_fingerprint_value,
                reported_irrigation_event=normalized_event,
                effective_irrigation_mm=effective_irrigation_mm_value,
                original_error=exc,
            )

        return canonical_water_state.model_copy(deep=True)


def has_applied_irrigation_event(
        self,
        state_id: str,
        irrigation_event_id: str,
        *,
        irrigation_event: LastIrrigationEvent | None = None,
    ) -> bool:
        with self._session_factory() as session:
            self._get_cycle_or_raise(session, state_id)
            event = session.get(IrrigationEventModel, irrigation_event_id)
            if event is None:
                return False
            normalized_event = (
                normalize_irrigation_event(state_id, irrigation_event)
                if irrigation_event is not None
                else None
            )
            if normalized_event is None:
                if event.state_id != state_id:
                    raise IrrigationEventStateMismatchError(
                        irrigation_event_id,
                        expected_state_id=state_id,
                        actual_state_id=event.state_id,
                    )
            else:
                if normalized_event.irrigation_event_id != irrigation_event_id:
                    raise IrrigationEventPayloadConflictError(
                        irrigation_event_id,
                        field="irrigation_event_id",
                    )
                self._validate_irrigation_event_row(
                    event,
                    state_id=state_id,
                    event=normalized_event,
                )
            return (
                self._water_for_irrigation_event(
                    session,
                    state_id=state_id,
                    event_id=irrigation_event_id,
                )
                is not None
            )


def get_water_state_for_update(
        self,
        state_id: str,
        water_update_id: str,
        request_fingerprint: str,
    ) -> WaterStateResponse | None:
        water_update_id_value = self._validate_water_update_id(water_update_id)
        request_fingerprint_value = self._validate_request_fingerprint(
            request_fingerprint,
        )
        with self._session_factory() as session:
            self._get_cycle_or_raise(session, state_id)
            water = self._water_for_update(
                session,
                state_id=state_id,
                water_update_id=water_update_id_value,
            )
            if water is None:
                return None
            return self._water_state_for_update_row_or_raise(
                water,
                state_id=state_id,
                water_update_id=water_update_id_value,
                request_fingerprint=request_fingerprint_value,
            )


def _validate_irrigation_event_row(
        self,
        row: IrrigationEventModel,
        *,
        state_id: str,
        event: LastIrrigationEvent,
    ) -> None:
        event_id = event.irrigation_event_id
        if event_id is None:
            raise ValueError("irrigation_event_id is required.")
        if row.state_id != state_id:
            raise IrrigationEventStateMismatchError(
                event_id,
                expected_state_id=state_id,
                actual_state_id=row.state_id,
            )

        existing_event = LastIrrigationEvent(
            irrigation_event_id=row.irrigation_event_id,
            timestamp=self._as_utc(row.occurred_at),
            amount_mm=row.amount_mm,
            source=row.source,
        )
        conflict_field = irrigation_event_payload_conflict_field(
            existing_event,
            event,
        )
        if conflict_field is not None:
            raise IrrigationEventPayloadConflictError(
                event_id,
                field=conflict_field,
            )


def _get_or_create_irrigation_event(
        self,
        session: Session,
        *,
        state_id: str,
        event: LastIrrigationEvent,
        recorded_at: datetime,
    ) -> IrrigationEventModel:
        normalized_event = normalize_irrigation_event(state_id, event)
        event_id = normalized_event.irrigation_event_id
        if event_id is None:
            raise ValueError("irrigation_event_id is required.")

        row = session.get(IrrigationEventModel, event_id)
        if row is not None:
            self._validate_irrigation_event_row(
                row,
                state_id=state_id,
                event=normalized_event,
            )
            return row

        row = IrrigationEventModel(
            irrigation_event_id=event_id,
            state_id=state_id,
            occurred_at=self._as_utc(normalized_event.timestamp),
            amount_mm=normalized_event.amount_mm,
            source=normalized_event.source.value,
            recorded_at=recorded_at,
            payload_json=self._dump(normalized_event),
        )
        session.add(row)
        session.flush()
        return row


def _water_for_irrigation_event(
        self,
        session: Session,
        *,
        state_id: str,
        event_id: str,
    ) -> WaterObservationModel | None:
        return session.scalars(
            select(WaterObservationModel)
            .where(
                WaterObservationModel.state_id == state_id,
                WaterObservationModel.irrigation_event_id == event_id,
            )
            .limit(1)
        ).first()


def _water_for_update(
        self,
        session: Session,
        *,
        state_id: str,
        water_update_id: str,
    ) -> WaterObservationModel | None:
        return session.scalars(
            select(WaterObservationModel)
            .where(
                WaterObservationModel.state_id == state_id,
                WaterObservationModel.water_update_id == water_update_id,
            )
            .limit(1)
        ).first()


def _water_state_for_update_row_or_raise(
        self,
        row: WaterObservationModel,
        *,
        state_id: str,
        water_update_id: str,
        request_fingerprint: str,
    ) -> WaterStateResponse:
        if row.state_id != state_id:
            raise StateNotFoundError(state_id)
        if row.request_fingerprint != request_fingerprint:
            raise WaterUpdatePayloadConflictError(
                state_id,
                water_update_id,
                existing_fingerprint=row.request_fingerprint,
                request_fingerprint=request_fingerprint,
            )
        return self._water_state_from_row(row).model_copy(deep=True)


def _validate_expected_water_baseline(
        self,
        session: Session,
        *,
        state_id: str,
        supplied_base_water_observation_id: str | None,
        supplied_base_water_sequence: int,
        current_base_water_observation_id: str | None,
        current_base_water_sequence: int,
    ) -> None:
        if supplied_base_water_sequence == 0 and supplied_base_water_observation_id is not None:
            raise WaterBaselineMismatchError(
                "base_water_observation_id must be null for base sequence 0.",
                state_id=state_id,
                supplied_base_water_observation_id=supplied_base_water_observation_id,
                supplied_base_water_sequence=supplied_base_water_sequence,
            )
        if supplied_base_water_sequence > 0 and supplied_base_water_observation_id is None:
            raise WaterBaselineMismatchError(
                "base_water_observation_id is required for non-zero base sequence.",
                state_id=state_id,
                supplied_base_water_sequence=supplied_base_water_sequence,
            )
        if supplied_base_water_observation_id is not None:
            row = session.get(WaterObservationModel, supplied_base_water_observation_id)
            if row is None:
                raise WaterBaselineMismatchError(
                    "Referenced base water observation was not found.",
                    state_id=state_id,
                    supplied_base_water_observation_id=supplied_base_water_observation_id,
                    supplied_base_water_sequence=supplied_base_water_sequence,
                )
            if row.state_id != state_id:
                raise WaterBaselineMismatchError(
                    "Referenced base water observation belongs to another state.",
                    state_id=state_id,
                    supplied_base_water_observation_id=supplied_base_water_observation_id,
                    supplied_base_water_sequence=supplied_base_water_sequence,
                )
            if row.water_sequence != supplied_base_water_sequence:
                raise WaterBaselineMismatchError(
                    "Referenced base water observation sequence does not match.",
                    state_id=state_id,
                    supplied_base_water_observation_id=supplied_base_water_observation_id,
                    supplied_base_water_sequence=supplied_base_water_sequence,
                )
        if (
            supplied_base_water_observation_id != current_base_water_observation_id
            or supplied_base_water_sequence != current_base_water_sequence
        ):
            raise StaleWaterBaselineError(
                state_id,
                supplied_base_water_observation_id=supplied_base_water_observation_id,
                supplied_base_water_sequence=supplied_base_water_sequence,
                current_base_water_observation_id=current_base_water_observation_id,
                current_base_water_sequence=current_base_water_sequence,
            )


def _handle_water_update_integrity_error(
        self,
        *,
        state_id: str,
        water_update_id: str,
        request_fingerprint: str,
        reported_irrigation_event: LastIrrigationEvent | None,
        effective_irrigation_mm: float,
        original_error: IntegrityError,
    ) -> WaterStateResponse:
        with self._session_factory() as session:
            self._get_cycle_or_raise(session, state_id)
            existing_update = self._water_for_update(
                session,
                state_id=state_id,
                water_update_id=water_update_id,
            )
            if existing_update is not None:
                return self._water_state_for_update_row_or_raise(
                    existing_update,
                    state_id=state_id,
                    water_update_id=water_update_id,
                    request_fingerprint=request_fingerprint,
                )

            if reported_irrigation_event is not None:
                event_id = reported_irrigation_event.irrigation_event_id
                if event_id is None:
                    raise ValueError("irrigation_event_id is required.")
                event_row = session.get(IrrigationEventModel, event_id)
                if event_row is not None:
                    self._validate_irrigation_event_row(
                        event_row,
                        state_id=state_id,
                        event=reported_irrigation_event,
                    )
                    existing_application = self._water_for_irrigation_event(
                        session,
                        state_id=state_id,
                        event_id=event_id,
                    )
                    if (
                        existing_application is not None
                        and effective_irrigation_mm != 0.0
                    ):
                        raise WaterUpdateConcurrencyConflictError(
                            state_id,
                            event_id,
                        ) from original_error

        raise WaterStateConcurrencyConflictError(state_id) from original_error


def _existing_water_after_irrigation_integrity_error(
        self,
        *,
        state_id: str,
        event: LastIrrigationEvent,
    ) -> WaterStateResponse:
        normalized_event = normalize_irrigation_event(state_id, event)
        event_id = normalized_event.irrigation_event_id
        if event_id is None:
            raise ValueError("irrigation_event_id is required.")
        with self._session_factory() as session:
            self._get_cycle_or_raise(session, state_id)
            row = session.get(IrrigationEventModel, event_id)
            if row is None:
                raise PersistenceIntegrityError()
            self._validate_irrigation_event_row(
                row,
                state_id=state_id,
                event=normalized_event,
            )
            water = self._water_for_irrigation_event(
                session,
                state_id=state_id,
                event_id=event_id,
            )
            if water is None:
                raise PersistenceIntegrityError()
            return self._water_state_from_row(water).model_copy(deep=True)


__all__ = [
    "get_canonical_water_baseline",
    "cache_water_state",
    "cache_water_update",
    "has_applied_irrigation_event",
    "get_water_state_for_update",
    "_validate_irrigation_event_row",
    "_get_or_create_irrigation_event",
    "_water_for_irrigation_event",
    "_water_for_update",
    "_water_state_for_update_row_or_raise",
    "_validate_expected_water_baseline",
    "_handle_water_update_integrity_error",
    "_existing_water_after_irrigation_integrity_error",
]
