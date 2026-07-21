from __future__ import annotations

from datetime import datetime
from typing import Protocol, TYPE_CHECKING

from app.schemas import (
    ActualActionCreateRequest,
    ActualActionResponse,
    CreateCropCycleRequest,
    CreateSessionRequest,
    DiseasePredictionResponse,
    FarmCreateRequest,
    FarmResponse,
    GrowthStageResponse,
    LastIrrigationEvent,
    ObservationTimeBasis,
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
)

if TYPE_CHECKING:
    from app.state_store import TwinSessionRecord


class TwinStateStore(Protocol):
    def create_session(
        self,
        request: CreateSessionRequest,
        *,
        state_id: str | None = None,
        elevation_m: float | None = None,
        created_at: datetime | None = None,
    ) -> SessionResponse: ...

    def get_record(self, state_id: str) -> TwinSessionRecord: ...

    def cache_disease_state(
        self,
        state_id: str,
        disease_state: DiseasePredictionResponse,
    ) -> DiseasePredictionResponse: ...

    def cache_growth_state(
        self,
        state_id: str,
        growth_state: GrowthStageResponse,
        *,
        observed_at: datetime | None = None,
        observation_time_basis: ObservationTimeBasis | None = None,
        computed_at: datetime | None = None,
    ) -> GrowthStageResponse: ...

    def cache_water_state(
        self,
        state_id: str,
        water_state: WaterStateResponse,
        *,
        weather_payload: dict[str, object] | None = None,
        previous_root_zone_depletion_mm: float | None = None,
        irrigation_event: LastIrrigationEvent | None = None,
    ) -> WaterStateResponse: ...

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
        reported_irrigation_event: LastIrrigationEvent | None = None,
        effective_irrigation_mm: float = 0.0,
        computed_at: datetime | None = None,
    ) -> WaterStateResponse: ...

    def cache_simulation(
        self,
        state_id: str,
        simulation: SimulateActionsResponse,
    ) -> SimulateActionsResponse: ...

    def cache_recommendation(
        self,
        state_id: str,
        recommendation: RecommendationResponse,
    ) -> RecommendationResponse: ...

    def update_current_state(self, state_id: str) -> UpdateTwinStateResponse: ...

    def get_current_state(self, state_id: str) -> TwinCurrentState: ...

    def get_latest_simulation(self, state_id: str) -> SimulateActionsResponse: ...

    def get_latest_recommendation(self, state_id: str) -> RecommendationResponse: ...

    def get_session_state_response(self, state_id: str) -> SessionStateResponse: ...

    def get_history_response(self, state_id: str) -> SessionHistoryResponse: ...

    def clear(self) -> None: ...

    def count(self) -> int: ...

    def create_farm(
        self,
        request: FarmCreateRequest,
        *,
        farm_id: str | None = None,
        created_at: datetime | None = None,
    ) -> FarmResponse: ...

    def list_farms(self) -> list[FarmResponse]: ...

    def get_farm(self, farm_id: str) -> FarmResponse: ...

    def create_plot(
        self,
        farm_id: str,
        request: PlotCreateRequest,
        *,
        plot_id: str | None = None,
        created_at: datetime | None = None,
    ) -> PlotResponse: ...

    def list_plots(self, farm_id: str) -> list[PlotResponse]: ...

    def get_plot(self, plot_id: str) -> PlotResponse: ...

    def create_crop_cycle_for_plot(
        self,
        plot_id: str,
        request: CreateCropCycleRequest,
        *,
        state_id: str | None = None,
        created_at: datetime | None = None,
    ) -> SessionResponse: ...

    def has_applied_irrigation_event(
        self,
        state_id: str,
        irrigation_event_id: str,
        *,
        irrigation_event: LastIrrigationEvent | None = None,
    ) -> bool: ...

    def get_water_state_for_update(
        self,
        state_id: str,
        water_update_id: str,
        request_fingerprint: str,
    ) -> WaterStateResponse | None: ...

    def record_actual_action(
        self,
        state_id: str,
        request: ActualActionCreateRequest,
        *,
        actual_action_id: str | None = None,
        recorded_at: datetime | None = None,
    ) -> ActualActionResponse: ...

    def list_actual_actions(
        self,
        state_id: str,
        *,
        limit: int = 50,
    ) -> list[ActualActionResponse]: ...
