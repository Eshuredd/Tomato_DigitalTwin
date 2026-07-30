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


def _get_record_unlocked(self, state_id: str) -> TwinSessionRecord:
        record = self._sessions.get(state_id)
        if record is None:
            raise StateNotFoundError(state_id)
        return record


def create_session(
        self,
        request: CreateSessionRequest,
        *,
        state_id: str | None = None,
        elevation_m: float | None = None,
        created_at: datetime | None = None,
    ) -> SessionResponse:
        with self._lock:
            if state_id is None:
                state_id = f"state_{uuid.uuid4().hex}"
            if state_id in self._sessions:
                raise ValueError(f"State '{state_id}' already exists.")
            if created_at is None:
                created_at = utc_now()
            else:
                created_at = ensure_utc_datetime(created_at, field_name="created_at")
            location = request.location.model_copy(deep=True)
            if elevation_m is not None:
                location.elevation_m = elevation_m
            elif location.elevation_m is None:
                location.elevation_m = None

            record = TwinSessionRecord(
                state_id=state_id,
                crop_type=request.crop_type,
                planting_date=request.planting_date,
                location=location,
                soil_texture=request.soil_texture,
                created_at=created_at,
            )
            self._sessions[state_id] = record
            self._latest_water_observation_id[state_id] = None
            self._water_sequence[state_id] = 0
            return SessionResponse(
                state_id=record.state_id,
                crop_type=record.crop_type,
                planting_date=record.planting_date,
                location=record.location.model_copy(deep=True),
                soil_texture=record.soil_texture,
                created_at=record.created_at,
            )


def get_record(self, state_id: str) -> TwinSessionRecord:
        with self._lock:
            record = self._get_record_unlocked(state_id)
            return record.model_copy(deep=True)


def get_session_state_response(self, state_id: str) -> SessionStateResponse:
        with self._lock:
            record = self._get_record_unlocked(state_id)
            current_state = self.get_current_state(state_id)
            return SessionStateResponse(
                state_id=record.state_id,
                crop_type=record.crop_type,
                planting_date=record.planting_date,
                location=record.location.model_copy(deep=True),
                soil_texture=record.soil_texture,
                current_state=current_state,
            )


def clear(self) -> None:
        with self._lock:
            self._sessions.clear()
            self._farms.clear()
            self._plots.clear()
            self._actual_actions.clear()
            self._irrigation_events.clear()
            self._water_by_irrigation_event_id.clear()
            self._water_by_update_id.clear()
            self._water_by_observation_id.clear()
            self._water_growth_observation_id.clear()
            self._latest_water_observation_id.clear()
            self._water_sequence.clear()
            self._latest_disease_observation_id.clear()
            self._latest_growth_observation_id.clear()
            self._disease_by_observation_id.clear()
            self._growth_by_observation_id.clear()
            self._snapshot_by_fingerprint.clear()
            self._snapshot_sources.clear()
            self._daily_advancements.clear()
            self._daily_advancement_by_target_date.clear()
            self._recommendations_by_id.clear()
            self._disease_history.clear()
            self._growth_history.clear()
            self._growth_observation_metadata.clear()
            self._water_history.clear()
            self._water_observation_metadata.clear()


def count(self) -> int:
        with self._lock:
            return len(self._sessions)


__all__ = [
    "_get_record_unlocked",
    "create_session",
    "get_record",
    "get_session_state_response",
    "clear",
    "count",
]
