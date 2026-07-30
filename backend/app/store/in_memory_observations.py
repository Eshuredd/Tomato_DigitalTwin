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


def cache_disease_state(
        self, state_id: str, disease_state: DiseasePredictionResponse
    ) -> DiseasePredictionResponse:
        with self._lock:
            record = self._get_record_unlocked(state_id)
            if disease_state.state_id != state_id:
                raise ValueError("disease_state.state_id does not match state_id.")
            observation_id = f"disease_obs_{uuid.uuid4().hex}"
            record.latest_disease_state = disease_state.model_copy(deep=True)
            self._latest_disease_observation_id[state_id] = observation_id
            self._disease_by_observation_id[observation_id] = (
                state_id,
                record.latest_disease_state.model_copy(deep=True),
            )
            self._disease_history.setdefault(state_id, []).append(
                record.latest_disease_state.model_copy(deep=True)
            )
            return record.latest_disease_state.model_copy(deep=True)


def cache_growth_state(
        self,
        state_id: str,
        growth_state: GrowthStageResponse,
        *,
        observed_at: datetime | None = None,
        observation_time_basis: ObservationTimeBasis | None = None,
        computed_at: datetime | None = None,
    ) -> GrowthStageResponse:
        with self._lock:
            record = self._get_record_unlocked(state_id)
            if growth_state.state_id != state_id:
                raise ValueError("growth_state.state_id does not match state_id.")
            if observed_at is not None:
                observed_at_value = ensure_utc_datetime(
                    observed_at,
                    field_name="observed_at",
                )
            else:
                observed_at_value = datetime.combine(
                    growth_state.current_date,
                    datetime.min.time(),
                    tzinfo=timezone.utc,
                )
            if computed_at is not None:
                computed_at_value = ensure_utc_datetime(
                    computed_at,
                    field_name="computed_at",
                )
            else:
                computed_at_value = utc_now()
            if (
                observation_time_basis is not None
                and not isinstance(observation_time_basis, ObservationTimeBasis)
            ):
                raise ValueError(
                    "observation_time_basis must be an ObservationTimeBasis."
                )
            basis_value = (
                ObservationTimeBasis.DATE_ONLY_UTC_START
                if observation_time_basis is None
                else observation_time_basis
            )
            observation_id = f"growth_obs_{uuid.uuid4().hex}"
            record.latest_growth_state = growth_state.model_copy(deep=True)
            self._latest_growth_observation_id[state_id] = observation_id
            self._growth_by_observation_id[observation_id] = (
                state_id,
                record.latest_growth_state.model_copy(deep=True),
            )
            self._growth_history.setdefault(state_id, []).append(
                record.latest_growth_state.model_copy(deep=True)
            )
            self._growth_observation_metadata.setdefault(state_id, []).append(
                (observed_at_value, basis_value, computed_at_value)
            )
            return record.latest_growth_state.model_copy(deep=True)


__all__ = [
    "cache_disease_state",
    "cache_growth_state",
]
