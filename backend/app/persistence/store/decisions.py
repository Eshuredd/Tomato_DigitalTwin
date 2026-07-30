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


def cache_simulation(
        self,
        state_id: str,
        simulation: SimulateActionsResponse,
    ) -> SimulateActionsResponse:
        if simulation.state_id != state_id:
            raise ValueError("simulation.state_id does not match state_id.")
        with self._session_factory() as session:
            with session.begin():
                self._get_cycle_or_raise(session, state_id)
                snapshot = self._latest_snapshot(session, state_id)
                if snapshot is None:
                    raise MissingCachedOutputError(state_id, "current_state")
                session.add(
                    SimulationRunModel(
                        simulation_id=self._new_id("simulation"),
                        state_id=state_id,
                        source_snapshot_id=snapshot.snapshot_id,
                        observed_at=self._as_utc(snapshot.observed_at),
                        computed_at=self._as_utc(simulation.simulated_at),
                        payload_json=self._dump(simulation),
                    )
                )
        return simulation.model_copy(deep=True)


def cache_recommendation(
        self,
        state_id: str,
        recommendation: RecommendationResponse,
    ) -> RecommendationResponse:
        if recommendation.state_id != state_id:
            raise ValueError("recommendation.state_id does not match state_id.")
        recommendation_id = recommendation.recommendation_id or self._new_id(
            "recommendation"
        )
        payload = recommendation.model_copy(
            update={"recommendation_id": recommendation_id},
            deep=True,
        )
        with self._session_factory() as session:
            with session.begin():
                self._get_cycle_or_raise(session, state_id)
                snapshot = self._latest_snapshot(session, state_id)
                if snapshot is None:
                    raise MissingCachedOutputError(state_id, "current_state")
                simulation = self._latest_valid_simulation_row(
                    session,
                    state_id,
                    snapshot.snapshot_id,
                )
                if simulation is None:
                    raise MissingCachedOutputError(state_id, "latest_simulation")
                session.add(
                    RecommendationRunModel(
                        recommendation_id=recommendation_id,
                        state_id=state_id,
                        source_snapshot_id=snapshot.snapshot_id,
                        source_simulation_id=simulation.simulation_id,
                        observed_at=self._as_utc(snapshot.observed_at),
                        computed_at=self._as_utc(payload.recommended_at),
                        payload_json=self._dump(payload),
                    )
                )
        return payload.model_copy(deep=True)


def get_latest_simulation(self, state_id: str) -> SimulateActionsResponse:
        with self._session_factory() as session:
            self._get_cycle_or_raise(session, state_id)
            snapshot = self._latest_snapshot(session, state_id)
            if snapshot is None:
                raise MissingCachedOutputError(state_id, "current_state")
            simulation = self._latest_valid_simulation_row(
                session,
                state_id,
                snapshot.snapshot_id,
            )
            if simulation is None:
                raise MissingCachedOutputError(state_id, "latest_simulation")
            return self._payload_as(simulation, SimulateActionsResponse).model_copy(deep=True)


def get_latest_recommendation(self, state_id: str) -> RecommendationResponse:
        with self._session_factory() as session:
            self._get_cycle_or_raise(session, state_id)
            snapshot = self._latest_snapshot(session, state_id)
            if snapshot is None:
                raise MissingCachedOutputError(state_id, "current_state")
            simulation = self._latest_valid_simulation_row(
                session,
                state_id,
                snapshot.snapshot_id,
            )
            if simulation is None:
                raise MissingCachedOutputError(state_id, "latest_simulation")
            recommendation = self._latest_valid_recommendation_row(
                session,
                state_id,
                snapshot.snapshot_id,
                simulation.simulation_id,
            )
            if recommendation is None:
                raise MissingCachedOutputError(state_id, "latest_recommendation")
            return self._payload_as(recommendation, RecommendationResponse).model_copy(deep=True)


def _validate_related_recommendation(
        self,
        session: Session,
        *,
        state_id: str,
        recommendation_id: str | None,
    ) -> None:
        if recommendation_id is None:
            return

        row = session.get(RecommendationRunModel, recommendation_id)
        if row is None:
            raise RelatedRecommendationNotFoundError(recommendation_id)
        if row.state_id != state_id:
            raise RecommendationStateMismatchError(
                recommendation_id,
                expected_state_id=state_id,
                actual_state_id=row.state_id,
            )


__all__ = [
    "cache_simulation",
    "cache_recommendation",
    "get_latest_simulation",
    "get_latest_recommendation",
    "_validate_related_recommendation",
]
