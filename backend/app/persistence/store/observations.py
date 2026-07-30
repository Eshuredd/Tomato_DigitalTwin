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


def cache_disease_state(
        self,
        state_id: str,
        disease_state: DiseasePredictionResponse,
    ) -> DiseasePredictionResponse:
        if disease_state.state_id != state_id:
            raise ValueError("disease_state.state_id does not match state_id.")
        predicted_at = self._as_utc(disease_state.predicted_at)
        payload = disease_state.model_copy(
            update={"predicted_at": predicted_at},
            deep=True,
        )
        with self._session_factory() as session:
            with session.begin():
                self._get_cycle_or_raise(session, state_id)
                session.add(
                    DiseaseObservationModel(
                        observation_id=self._new_id("disease_obs"),
                        state_id=state_id,
                        observed_at=predicted_at,
                        computed_at=predicted_at,
                        observation_time_basis=ObservationTimeBasis.SERVER_RECEIVED.value,
                        predicted_label=payload.predicted_label,
                        disease_category=payload.disease_category.value,
                        confidence_calibrated=payload.confidence_calibrated,
                        uncertainty_score=payload.uncertainty_score,
                        uncertainty_band=payload.uncertainty_band.value,
                        payload_json=self._dump(payload),
                    )
                )
        return payload.model_copy(deep=True)


def cache_growth_state(
        self,
        state_id: str,
        growth_state: GrowthStageResponse,
        *,
        observed_at: datetime | None = None,
        observation_time_basis: ObservationTimeBasis | None = None,
        computed_at: datetime | None = None,
    ) -> GrowthStageResponse:
        if growth_state.state_id != state_id:
            raise ValueError("growth_state.state_id does not match state_id.")
        observed_at_value = (
            datetime.combine(
                growth_state.current_date,
                datetime.min.time(),
                tzinfo=timezone.utc,
            )
            if observed_at is None
            else ensure_utc_datetime(observed_at, field_name="observed_at")
        )
        basis_value = (
            ObservationTimeBasis.DATE_ONLY_UTC_START
            if observation_time_basis is None
            else observation_time_basis
        )
        if not isinstance(basis_value, ObservationTimeBasis):
            raise ValueError("observation_time_basis must be an ObservationTimeBasis.")
        computed_at_value = (
            utc_now()
            if computed_at is None
            else ensure_utc_datetime(computed_at, field_name="computed_at")
        )
        with self._session_factory() as session:
            with session.begin():
                self._get_cycle_or_raise(session, state_id)
                session.add(
                    GrowthObservationModel(
                        observation_id=self._new_id("growth_obs"),
                        state_id=state_id,
                        observed_at=observed_at_value,
                        computed_at=computed_at_value,
                        observation_time_basis=basis_value.value,
                        current_date=growth_state.current_date,
                        days_since_planting=growth_state.days_since_planting,
                        growth_stage=growth_state.growth_stage.value,
                        stage_progress=growth_state.stage_progress,
                        payload_json=self._dump(growth_state),
                    )
                )
        return growth_state.model_copy(deep=True)


__all__ = [
    "cache_disease_state",
    "cache_growth_state",
]
