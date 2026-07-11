from __future__ import annotations

import threading
import uuid
from datetime import date, datetime, timezone

from pydantic import BaseModel, Field

from app.schemas import (
    CreateSessionRequest,
    DiseasePredictionResponse,
    GrowthStageResponse,
    Location,
    RecommendationResponse,
    SessionHistoryResponse,
    SessionResponse,
    SessionStateResponse,
    SimulateActionsResponse,
    TwinCurrentState,
    UpdateTwinStateResponse,
    WaterStateResponse,
    CropType,
    HistoryEvent,
    SoilTexture,
)


class StateNotFoundError(Exception):
    def __init__(self, state_id: str) -> None:
        super().__init__(f"State '{state_id}' not found.")


class IncompleteStateError(Exception):
    def __init__(self, missing: list[str]) -> None:
        missing_list = ", ".join(missing)
        super().__init__(f"Cannot update current state; missing cached outputs: {missing_list}.")
        self.missing = missing


class MissingCachedOutputError(Exception):
    def __init__(self, state_id: str, output_name: str) -> None:
        super().__init__(f"State '{state_id}' is missing cached output: {output_name}.")
        self.state_id = state_id
        self.output_name = output_name


class TwinSessionRecord(BaseModel):
    state_id: str
    crop_type: CropType
    planting_date: date
    location: Location
    soil_texture: SoilTexture
    created_at: datetime
    latest_disease_state: DiseasePredictionResponse | None = None
    latest_growth_state: GrowthStageResponse | None = None
    latest_water_state: WaterStateResponse | None = None
    current_state: TwinCurrentState | None = None
    state_history: list[HistoryEvent] = Field(default_factory=list)
    latest_simulation: SimulateActionsResponse | None = None
    latest_recommendation: RecommendationResponse | None = None


class InMemoryTwinStateStore:
    def __init__(self, max_history: int = 10) -> None:
        self._sessions: dict[str, TwinSessionRecord] = {}
        self._max_history = max_history
        self._lock = threading.RLock()

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
            if created_at is None:
                created_at = datetime.now(timezone.utc)
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

    def cache_disease_state(
        self, state_id: str, disease_state: DiseasePredictionResponse
    ) -> DiseasePredictionResponse:
        with self._lock:
            record = self._get_record_unlocked(state_id)
            if disease_state.state_id != state_id:
                raise ValueError("disease_state.state_id does not match state_id.")
            record.latest_disease_state = disease_state.model_copy(deep=True)
            return record.latest_disease_state.model_copy(deep=True)

    def cache_growth_state(
        self, state_id: str, growth_state: GrowthStageResponse
    ) -> GrowthStageResponse:
        with self._lock:
            record = self._get_record_unlocked(state_id)
            if growth_state.state_id != state_id:
                raise ValueError("growth_state.state_id does not match state_id.")
            record.latest_growth_state = growth_state.model_copy(deep=True)
            return record.latest_growth_state.model_copy(deep=True)

    def cache_water_state(
        self, state_id: str, water_state: WaterStateResponse
    ) -> WaterStateResponse:
        with self._lock:
            record = self._get_record_unlocked(state_id)
            if water_state.state_id != state_id:
                raise ValueError("water_state.state_id does not match state_id.")
            record.latest_water_state = water_state.model_copy(deep=True)
            return record.latest_water_state.model_copy(deep=True)

    def cache_simulation(
        self, state_id: str, simulation: SimulateActionsResponse
    ) -> SimulateActionsResponse:
        with self._lock:
            record = self._get_record_unlocked(state_id)
            if simulation.state_id != state_id:
                raise ValueError("simulation.state_id does not match state_id.")
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
            record.latest_recommendation = recommendation.model_copy(deep=True)
            return record.latest_recommendation.model_copy(deep=True)

    def update_current_state(self, state_id: str) -> UpdateTwinStateResponse:
        with self._lock:
            record = self._get_record_unlocked(state_id)
            missing: list[str] = []
            if record.latest_disease_state is None:
                missing.append("latest_disease_state")
            if record.latest_growth_state is None:
                missing.append("latest_growth_state")
            if record.latest_water_state is None:
                missing.append("latest_water_state")
            if missing:
                raise IncompleteStateError(missing)

            disease = record.latest_disease_state
            growth = record.latest_growth_state
            water = record.latest_water_state

            now = datetime.now(timezone.utc)
            current_state = TwinCurrentState(
                crop_type=record.crop_type,
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
                root_zone_depletion=water.root_zone_depletion,
                estimated_moisture_state=water.estimated_moisture_state,
                stress_band=water.stress_band,
                last_update_time=now,
            )
            record.current_state = current_state.model_copy(deep=True)
            record.latest_simulation = None
            record.latest_recommendation = None

            history_event = HistoryEvent(
                timestamp=now,
                growth_stage=current_state.growth_stage,
                predicted_label=current_state.predicted_label,
                root_zone_depletion=current_state.root_zone_depletion,
                stress_band=current_state.stress_band,
            )
            record.state_history.append(history_event)
            record.state_history = record.state_history[-self._max_history :]

            return UpdateTwinStateResponse(
                state_id=state_id,
                current_state=record.current_state.model_copy(deep=True),
                state_history_count=len(record.state_history),
            )

    def get_current_state(self, state_id: str) -> TwinCurrentState:
        with self._lock:
            record = self._get_record_unlocked(state_id)
            if record.current_state is None:
                raise MissingCachedOutputError(state_id, "current_state")
            return record.current_state.model_copy(deep=True)

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

    def get_history_response(self, state_id: str) -> SessionHistoryResponse:
        with self._lock:
            record = self._get_record_unlocked(state_id)
            history = [event.model_copy(deep=True) for event in record.state_history]
            return SessionHistoryResponse(state_id=state_id, history=history)

    def clear(self) -> None:
        with self._lock:
            self._sessions.clear()

    def count(self) -> int:
        with self._lock:
            return len(self._sessions)


state_store = InMemoryTwinStateStore()
