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


def record_actual_action(
        self,
        state_id: str,
        request: ActualActionCreateRequest,
        *,
        actual_action_id: str | None = None,
        recorded_at: datetime | None = None,
    ) -> ActualActionResponse:
        action_id = actual_action_id or self._new_id("actual")
        recorded_at_value = self._timestamp_or_now(recorded_at, "recorded_at")
        action = ActualActionResponse(
            actual_action_id=action_id,
            state_id=state_id,
            related_recommendation_id=request.related_recommendation_id,
            action=request.action,
            performed_at=request.performed_at,
            amount_mm=request.amount_mm,
            notes=request.notes,
            recorded_at=recorded_at_value,
        )
        try:
            with self._session_factory() as session:
                with session.begin():
                    self._get_cycle_or_raise(session, state_id)
                    self._validate_related_recommendation(
                        session,
                        state_id=state_id,
                        recommendation_id=request.related_recommendation_id,
                    )
                    if session.get(ActualActionModel, action_id) is not None:
                        raise DuplicateActualActionError(action_id)
                    session.add(
                        ActualActionModel(
                            actual_action_id=action_id,
                            state_id=state_id,
                            related_recommendation_id=request.related_recommendation_id,
                            action=request.action.value,
                            performed_at=self._as_utc(request.performed_at),
                            amount_mm=request.amount_mm,
                            notes=request.notes,
                            recorded_at=recorded_at_value,
                            payload_json=self._dump(action),
                        )
                    )
        except IntegrityError as exc:
            with self._session_factory() as session:
                if session.get(ActualActionModel, action_id) is not None:
                    raise DuplicateActualActionError(action_id) from exc
            raise PersistenceIntegrityError() from exc
        return action


def list_actual_actions(
        self,
        state_id: str,
        *,
        limit: int = 50,
    ) -> list[ActualActionResponse]:
        bounded_limit = min(max(int(limit), 1), 200)
        with self._session_factory() as session:
            self._get_cycle_or_raise(session, state_id)
            rows = session.scalars(
                select(ActualActionModel)
                .where(ActualActionModel.state_id == state_id)
                .order_by(desc(ActualActionModel.performed_at))
                .limit(bounded_limit)
            ).all()
            return [
                self._payload_as(row, ActualActionResponse)
                for row in reversed(rows)
            ]


__all__ = [
    "record_actual_action",
    "list_actual_actions",
]
