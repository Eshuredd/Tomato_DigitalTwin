from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import threading
import uuid

from app.schemas import (
    ActualActionCreateRequest,
    ActualActionResponse,
    AdvanceOneDayResponse,
    CreateSessionRequest,
    CreateCropCycleRequest,
    DiseasePredictionResponse,
    FarmCreateRequest,
    FarmResponse,
    GrowthStageResponse,
    LastIrrigationEvent,
    PlotCreateRequest,
    PlotResponse,
    RecommendationResponse,
    SessionHistoryResponse,
    SessionResponse,
    SessionStateResponse,
    SimulateActionsResponse,
    TwinCurrentState,
    UpdateTwinStateResponse,
    WaterStateResponse,
    HistoryEvent,
    ObservationTimeBasis,
)
from app.store.errors import (
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
    StaleWaterBaselineError,
    StateNotFoundError,
    WaterBaselineMismatchError,
    WaterObservationTimeConflictError,
    WaterStateConcurrencyConflictError,
    WaterUpdateConcurrencyConflictError,
    WaterUpdatePayloadConflictError,
)
from app.store.identity import (
    _depletion_matches,
    _validate_base_sequence,
    _validate_effective_irrigation_mm,
    _validate_effective_matches_event,
    _validate_non_empty_bounded_string,
    _validate_request_fingerprint,
    _validate_water_update_id,
    ensure_utc_datetime,
    irrigation_event_payload_conflict_field,
    normalize_irrigation_event,
    snapshot_source_fingerprint,
    utc_now,
)
from app.store.types import SnapshotSourceIdentity, TwinSessionRecord, WaterBaseline


def _validate_related_recommendation_unlocked(
        self,
        state_id: str,
        recommendation_id: str | None,
    ) -> None:
        if recommendation_id is None:
            return

        existing = self._recommendations_by_id.get(recommendation_id)
        if existing is None:
            raise RelatedRecommendationNotFoundError(recommendation_id)

        recommendation_state_id, _recommendation = existing
        if recommendation_state_id != state_id:
            raise RecommendationStateMismatchError(
                recommendation_id,
                expected_state_id=state_id,
                actual_state_id=recommendation_state_id,
            )


def cache_simulation(
        self, state_id: str, simulation: SimulateActionsResponse
    ) -> SimulateActionsResponse:
        with self._lock:
            record = self._get_record_unlocked(state_id)
            if simulation.state_id != state_id:
                raise ValueError("simulation.state_id does not match state_id.")
            if record.current_state is None:
                raise MissingCachedOutputError(state_id, "current_state")
            record.latest_simulation = simulation.model_copy(deep=True)
            record.latest_recommendation = None
            return record.latest_simulation.model_copy(deep=True)


def cache_recommendation(
        self, state_id: str, recommendation: RecommendationResponse
    ) -> RecommendationResponse:
        with self._lock:
            record = self._get_record_unlocked(state_id)
            if recommendation.state_id != state_id:
                raise ValueError("recommendation.state_id does not match state_id.")
            if record.latest_simulation is None:
                raise MissingCachedOutputError(state_id, "latest_simulation")
            recommendation_id = (
                recommendation.recommendation_id
                or f"recommendation_{uuid.uuid4().hex}"
            )
            record.latest_recommendation = recommendation.model_copy(
                update={"recommendation_id": recommendation_id},
                deep=True,
            )
            self._recommendations_by_id[recommendation_id] = (
                state_id,
                record.latest_recommendation.model_copy(deep=True),
            )
            return record.latest_recommendation.model_copy(deep=True)


def get_latest_simulation(self, state_id: str) -> SimulateActionsResponse:
        with self._lock:
            record = self._get_record_unlocked(state_id)
            if record.latest_simulation is None:
                raise MissingCachedOutputError(state_id, "latest_simulation")
            return record.latest_simulation.model_copy(deep=True)


def get_latest_recommendation(self, state_id: str) -> RecommendationResponse:
        with self._lock:
            record = self._get_record_unlocked(state_id)
            if record.latest_recommendation is None:
                raise MissingCachedOutputError(state_id, "latest_recommendation")
            return record.latest_recommendation.model_copy(deep=True)


__all__ = [
    "_validate_related_recommendation_unlocked",
    "cache_simulation",
    "cache_recommendation",
    "get_latest_simulation",
    "get_latest_recommendation",
]
