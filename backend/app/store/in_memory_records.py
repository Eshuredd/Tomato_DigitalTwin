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


def create_farm(
        self,
        request: FarmCreateRequest,
        *,
        farm_id: str | None = None,
        created_at: datetime | None = None,
    ) -> FarmResponse:
        with self._lock:
            farm_id = farm_id or f"farm_{uuid.uuid4().hex}"
            if farm_id in self._farms:
                raise ValueError(f"Farm '{farm_id}' already exists.")
            timestamp = (
                utc_now()
                if created_at is None
                else ensure_utc_datetime(created_at, field_name="created_at")
            )
            farm = FarmResponse(
                farm_id=farm_id,
                name=request.name,
                created_at=timestamp,
                updated_at=timestamp,
            )
            self._farms[farm_id] = farm
            return farm.model_copy(deep=True)


def list_farms(self) -> list[FarmResponse]:
        with self._lock:
            return [
                farm.model_copy(deep=True)
                for farm in sorted(self._farms.values(), key=lambda item: item.created_at)
            ]


def get_farm(self, farm_id: str) -> FarmResponse:
        with self._lock:
            farm = self._farms.get(farm_id)
            if farm is None:
                raise StateNotFoundError(farm_id)
            return farm.model_copy(deep=True)


def create_plot(
        self,
        farm_id: str,
        request: PlotCreateRequest,
        *,
        plot_id: str | None = None,
        created_at: datetime | None = None,
    ) -> PlotResponse:
        with self._lock:
            if farm_id not in self._farms:
                raise StateNotFoundError(farm_id)
            plot_id = plot_id or f"plot_{uuid.uuid4().hex}"
            if plot_id in self._plots:
                raise ValueError(f"Plot '{plot_id}' already exists.")
            timestamp = (
                utc_now()
                if created_at is None
                else ensure_utc_datetime(created_at, field_name="created_at")
            )
            plot = PlotResponse(
                plot_id=plot_id,
                farm_id=farm_id,
                name=request.name,
                location=request.location.model_copy(deep=True),
                soil_texture=request.soil_texture,
                created_at=timestamp,
                updated_at=timestamp,
            )
            self._plots[plot_id] = plot
            return plot.model_copy(deep=True)


def list_plots(self, farm_id: str) -> list[PlotResponse]:
        with self._lock:
            if farm_id not in self._farms:
                raise StateNotFoundError(farm_id)
            plots = [
                plot
                for plot in self._plots.values()
                if plot.farm_id == farm_id
            ]
            return [
                plot.model_copy(deep=True)
                for plot in sorted(plots, key=lambda item: item.created_at)
            ]


def get_plot(self, plot_id: str) -> PlotResponse:
        with self._lock:
            plot = self._plots.get(plot_id)
            if plot is None:
                raise StateNotFoundError(plot_id)
            return plot.model_copy(deep=True)


def create_crop_cycle_for_plot(
        self,
        plot_id: str,
        request: CreateCropCycleRequest,
        *,
        state_id: str | None = None,
        created_at: datetime | None = None,
    ) -> SessionResponse:
        with self._lock:
            plot = self._plots.get(plot_id)
            if plot is None:
                raise StateNotFoundError(plot_id)
            state_id = state_id or f"state_{uuid.uuid4().hex}"
            if state_id in self._sessions:
                raise ValueError(f"State '{state_id}' already exists.")
            timestamp = (
                utc_now()
                if created_at is None
                else ensure_utc_datetime(created_at, field_name="created_at")
            )
            record = TwinSessionRecord(
                state_id=state_id,
                plot_id=plot_id,
                crop_type=request.crop_type,
                planting_date=request.planting_date,
                location=plot.location.model_copy(deep=True),
                soil_texture=plot.soil_texture,
                created_at=timestamp,
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


def record_actual_action(
        self,
        state_id: str,
        request: ActualActionCreateRequest,
        *,
        actual_action_id: str | None = None,
        recorded_at: datetime | None = None,
    ) -> ActualActionResponse:
        with self._lock:
            self._get_record_unlocked(state_id)
            self._validate_related_recommendation_unlocked(
                state_id,
                request.related_recommendation_id,
            )
            action_id = actual_action_id or f"actual_{uuid.uuid4().hex}"
            timestamp = (
                utc_now()
                if recorded_at is None
                else ensure_utc_datetime(recorded_at, field_name="recorded_at")
            )
            actions = self._actual_actions.setdefault(state_id, [])
            if any(
                existing.actual_action_id == action_id
                for state_actions in self._actual_actions.values()
                for existing in state_actions
            ):
                raise DuplicateActualActionError(action_id)
            action = ActualActionResponse(
                actual_action_id=action_id,
                state_id=state_id,
                related_recommendation_id=request.related_recommendation_id,
                action=request.action,
                performed_at=request.performed_at,
                amount_mm=request.amount_mm,
                notes=request.notes,
                recorded_at=timestamp,
            )
            actions.append(action)
            return action.model_copy(deep=True)


def list_actual_actions(
        self,
        state_id: str,
        *,
        limit: int = 50,
    ) -> list[ActualActionResponse]:
        with self._lock:
            self._get_record_unlocked(state_id)
            bounded_limit = min(max(int(limit), 1), 200)
            actions = sorted(
                self._actual_actions.get(state_id, []),
                key=lambda item: item.performed_at,
            )
            return [
                action.model_copy(deep=True)
                for action in actions[-bounded_limit:]
            ]


__all__ = [
    "create_farm",
    "list_farms",
    "get_farm",
    "create_plot",
    "list_plots",
    "get_plot",
    "create_crop_cycle_for_plot",
    "record_actual_action",
    "list_actual_actions",
]
