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


def update_current_state(self, state_id: str) -> UpdateTwinStateResponse:
        source_fingerprint: str | None = None
        try:
            with self._session_factory() as session:
                with session.begin():
                    cycle = self._get_cycle_or_raise(session, state_id)
                    disease_row = self._latest_row(
                        session,
                        DiseaseObservationModel,
                        state_id,
                    )
                    water_row = self._canonical_water_row(session, cycle)
                    growth_row = (
                        None
                        if water_row is None
                        else session.get(
                            GrowthObservationModel,
                            water_row.growth_observation_id,
                        )
                    )

                    missing: list[str] = []
                    if disease_row is None:
                        missing.append("latest_disease_state")
                    if growth_row is None:
                        missing.append("latest_growth_state")
                    if water_row is None:
                        missing.append("latest_water_state")
                    if missing:
                        raise IncompleteStateError(missing)
                    if growth_row is None or growth_row.state_id != state_id:
                        raise PersistenceIntegrityError(
                            "Canonical water observation is missing its paired "
                            "growth observation."
                        )

                    source_fingerprint = snapshot_source_fingerprint(
                        state_id=state_id,
                        disease_observation_id=disease_row.observation_id,
                        growth_observation_id=growth_row.observation_id,
                        water_observation_id=water_row.observation_id,
                    )
                    existing_snapshot = self._snapshot_for_source_fingerprint(
                        session,
                        state_id=state_id,
                        source_fingerprint=source_fingerprint,
                    )
                    if existing_snapshot is not None:
                        return self._snapshot_update_response(
                            session,
                            state_id=state_id,
                            snapshot=existing_snapshot,
                            snapshot_created=False,
                        )

                    disease = self._payload_as(disease_row, DiseasePredictionResponse)
                    growth = self._payload_as(growth_row, GrowthStageResponse)
                    water = self._water_state_from_row(water_row)
                    computed_at = utc_now()
                    current_state = TwinCurrentState(
                        crop_type=CropType(cycle.crop_type),
                        growth_stage=growth.growth_stage,
                        days_since_planting=growth.days_since_planting,
                        predicted_label=disease.predicted_label,
                        disease_category=disease.disease_category,
                        confidence_calibrated=disease.confidence_calibrated,
                        uncertainty_score=disease.uncertainty_score,
                        uncertainty_band=disease.uncertainty_band,
                        eto_computed=water.eto_computed,
                        eto_method=water.eto_method,
                        kc=water.kc,
                        etc=water.etc,
                        taw=water.taw,
                        raw_threshold=water.raw_threshold,
                        raw_root_zone_depletion_mm=water.raw_root_zone_depletion_mm,
                        root_zone_depletion_mm=water.root_zone_depletion_mm,
                        root_zone_depletion=water.root_zone_depletion,
                        water_surplus_mm=water.water_surplus_mm,
                        depletion_beyond_taw_mm=water.depletion_beyond_taw_mm,
                        estimated_moisture_state=water.estimated_moisture_state,
                        stress_band=water.stress_band,
                        observed_at=water.observed_at,
                        computed_at=computed_at,
                        observation_time_basis=water.observation_time_basis,
                        last_update_time=computed_at,
                    )
                    snapshot = TwinStateSnapshotModel(
                        snapshot_id=self._new_id("snapshot"),
                        state_id=state_id,
                        observed_at=self._as_utc(water.observed_at),
                        computed_at=computed_at,
                        observation_time_basis=water.observation_time_basis.value,
                        source_fingerprint=source_fingerprint,
                        disease_observation_id=disease_row.observation_id,
                        growth_observation_id=growth_row.observation_id,
                        water_observation_id=water_row.observation_id,
                        water_sequence=water_row.water_sequence,
                        crop_type=current_state.crop_type.value,
                        growth_stage=current_state.growth_stage.value,
                        days_since_planting=current_state.days_since_planting,
                        predicted_label=current_state.predicted_label,
                        disease_category=current_state.disease_category.value,
                        confidence_calibrated=current_state.confidence_calibrated,
                        uncertainty_score=current_state.uncertainty_score,
                        uncertainty_band=current_state.uncertainty_band.value,
                        eto_computed=current_state.eto_computed,
                        eto_method=current_state.eto_method.value,
                        kc=current_state.kc,
                        etc=current_state.etc,
                        taw=current_state.taw,
                        raw_threshold=current_state.raw_threshold,
                        raw_root_zone_depletion_mm=(
                            current_state.raw_root_zone_depletion_mm
                        ),
                        root_zone_depletion_mm=current_state.root_zone_depletion_mm,
                        water_surplus_mm=current_state.water_surplus_mm,
                        depletion_beyond_taw_mm=current_state.depletion_beyond_taw_mm,
                        estimated_moisture_state=(
                            current_state.estimated_moisture_state.value
                        ),
                        stress_band=current_state.stress_band.value,
                        payload_json=self._dump(current_state),
                    )
                    session.add(snapshot)
                    cycle.latest_observed_at = self._as_utc(water.observed_at)
                    cycle.latest_computed_at = computed_at
                    session.flush()
                    return self._snapshot_update_response(
                        session,
                        state_id=state_id,
                        snapshot=snapshot,
                        snapshot_created=True,
                    )
        except IntegrityError as exc:
            if source_fingerprint is None:
                raise PersistenceIntegrityError() from exc
            with self._session_factory() as session:
                self._get_cycle_or_raise(session, state_id)
                existing_snapshot = self._snapshot_for_source_fingerprint(
                    session,
                    state_id=state_id,
                    source_fingerprint=source_fingerprint,
                )
                if existing_snapshot is not None:
                    return self._snapshot_update_response(
                        session,
                        state_id=state_id,
                        snapshot=existing_snapshot,
                        snapshot_created=False,
                    )
            raise WaterStateConcurrencyConflictError(state_id) from exc


def get_current_state(self, state_id: str) -> TwinCurrentState:
        with self._session_factory() as session:
            self._get_cycle_or_raise(session, state_id)
            snapshot = self._latest_snapshot(session, state_id)
            if snapshot is None:
                raise MissingCachedOutputError(state_id, "current_state")
            return self._payload_as(snapshot, TwinCurrentState).model_copy(deep=True)


def get_history_response(self, state_id: str) -> SessionHistoryResponse:
        with self._session_factory() as session:
            self._get_cycle_or_raise(session, state_id)
            return SessionHistoryResponse(
                state_id=state_id,
                history=self._history_events(session, state_id),
            )


def _create_or_reuse_snapshot_for_rows(
        self,
        session: Session,
        *,
        cycle: CropCycleModel,
        disease_row: DiseaseObservationModel,
        growth_row: GrowthObservationModel,
        water_row: WaterObservationModel,
    ) -> UpdateTwinStateResponse:
        state_id = cycle.state_id
        source_fingerprint = snapshot_source_fingerprint(
            state_id=state_id,
            disease_observation_id=disease_row.observation_id,
            growth_observation_id=growth_row.observation_id,
            water_observation_id=water_row.observation_id,
        )
        existing_snapshot = self._snapshot_for_source_fingerprint(
            session,
            state_id=state_id,
            source_fingerprint=source_fingerprint,
        )
        if existing_snapshot is not None:
            return self._snapshot_update_response(
                session,
                state_id=state_id,
                snapshot=existing_snapshot,
                snapshot_created=False,
            )

        disease = self._payload_as(disease_row, DiseasePredictionResponse)
        growth = self._payload_as(growth_row, GrowthStageResponse)
        water = self._water_state_from_row(water_row)
        computed_at = utc_now()
        current_state = TwinCurrentState(
            crop_type=CropType(cycle.crop_type),
            growth_stage=growth.growth_stage,
            days_since_planting=growth.days_since_planting,
            predicted_label=disease.predicted_label,
            disease_category=disease.disease_category,
            confidence_calibrated=disease.confidence_calibrated,
            uncertainty_score=disease.uncertainty_score,
            uncertainty_band=disease.uncertainty_band,
            eto_computed=water.eto_computed,
            eto_method=water.eto_method,
            kc=water.kc,
            etc=water.etc,
            taw=water.taw,
            raw_threshold=water.raw_threshold,
            raw_root_zone_depletion_mm=water.raw_root_zone_depletion_mm,
            root_zone_depletion_mm=water.root_zone_depletion_mm,
            root_zone_depletion=water.root_zone_depletion,
            water_surplus_mm=water.water_surplus_mm,
            depletion_beyond_taw_mm=water.depletion_beyond_taw_mm,
            estimated_moisture_state=water.estimated_moisture_state,
            stress_band=water.stress_band,
            observed_at=water.observed_at,
            computed_at=computed_at,
            observation_time_basis=water.observation_time_basis,
            last_update_time=computed_at,
        )
        snapshot = TwinStateSnapshotModel(
            snapshot_id=self._new_id("snapshot"),
            state_id=state_id,
            observed_at=self._as_utc(water.observed_at),
            computed_at=computed_at,
            observation_time_basis=water.observation_time_basis.value,
            source_fingerprint=source_fingerprint,
            disease_observation_id=disease_row.observation_id,
            growth_observation_id=growth_row.observation_id,
            water_observation_id=water_row.observation_id,
            water_sequence=water_row.water_sequence,
            crop_type=current_state.crop_type.value,
            growth_stage=current_state.growth_stage.value,
            days_since_planting=current_state.days_since_planting,
            predicted_label=current_state.predicted_label,
            disease_category=current_state.disease_category.value,
            confidence_calibrated=current_state.confidence_calibrated,
            uncertainty_score=current_state.uncertainty_score,
            uncertainty_band=current_state.uncertainty_band.value,
            eto_computed=current_state.eto_computed,
            eto_method=current_state.eto_method.value,
            kc=current_state.kc,
            etc=current_state.etc,
            taw=current_state.taw,
            raw_threshold=current_state.raw_threshold,
            raw_root_zone_depletion_mm=current_state.raw_root_zone_depletion_mm,
            root_zone_depletion_mm=current_state.root_zone_depletion_mm,
            water_surplus_mm=current_state.water_surplus_mm,
            depletion_beyond_taw_mm=current_state.depletion_beyond_taw_mm,
            estimated_moisture_state=current_state.estimated_moisture_state.value,
            stress_band=current_state.stress_band.value,
            payload_json=self._dump(current_state),
        )
        session.add(snapshot)
        cycle.latest_observed_at = self._as_utc(water.observed_at)
        cycle.latest_computed_at = computed_at
        session.flush()
        return self._snapshot_update_response(
            session,
            state_id=state_id,
            snapshot=snapshot,
            snapshot_created=True,
        )


__all__ = [
    "update_current_state",
    "get_current_state",
    "get_history_response",
    "_create_or_reuse_snapshot_for_rows",
]
