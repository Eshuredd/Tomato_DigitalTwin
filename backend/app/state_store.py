from __future__ import annotations

import threading
import uuid
from datetime import date, datetime, timezone
import hashlib

from pydantic import BaseModel, Field

from app.schemas import (
    ActualActionCreateRequest,
    ActualActionResponse,
    CreateSessionRequest,
    CreateCropCycleRequest,
    DiseasePredictionResponse,
    FarmCreateRequest,
    FarmResponse,
    GrowthStageResponse,
    LastIrrigationEvent,
    Location,
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
    CropType,
    HistoryEvent,
    SoilTexture,
    ObservationTimeBasis,
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


class DuplicateIrrigationEventApplicationError(Exception):
    def __init__(self, irrigation_event_id: str) -> None:
        super().__init__(
            f"Irrigation event '{irrigation_event_id}' has already been applied."
        )
        self.irrigation_event_id = irrigation_event_id


class IrrigationEventStateMismatchError(Exception):
    def __init__(
        self,
        irrigation_event_id: str,
        *,
        expected_state_id: str,
        actual_state_id: str,
    ) -> None:
        super().__init__(
            f"Irrigation event '{irrigation_event_id}' belongs to state "
            f"'{actual_state_id}', not '{expected_state_id}'."
        )
        self.irrigation_event_id = irrigation_event_id
        self.expected_state_id = expected_state_id
        self.actual_state_id = actual_state_id


class IrrigationEventPayloadConflictError(Exception):
    def __init__(self, irrigation_event_id: str, *, field: str) -> None:
        super().__init__(
            f"Irrigation event '{irrigation_event_id}' conflicts on {field}."
        )
        self.irrigation_event_id = irrigation_event_id
        self.field = field


class RelatedRecommendationNotFoundError(Exception):
    def __init__(self, recommendation_id: str) -> None:
        super().__init__(f"Recommendation '{recommendation_id}' was not found.")
        self.recommendation_id = recommendation_id


class RecommendationStateMismatchError(Exception):
    def __init__(
        self,
        recommendation_id: str,
        *,
        expected_state_id: str,
        actual_state_id: str,
    ) -> None:
        super().__init__(
            f"Recommendation '{recommendation_id}' belongs to state "
            f"'{actual_state_id}', not '{expected_state_id}'."
        )
        self.recommendation_id = recommendation_id
        self.expected_state_id = expected_state_id
        self.actual_state_id = actual_state_id


class DuplicateActualActionError(Exception):
    def __init__(self, actual_action_id: str) -> None:
        super().__init__(f"Actual action '{actual_action_id}' already exists.")
        self.actual_action_id = actual_action_id


class PersistenceIntegrityError(Exception):
    def __init__(self, message: str = "Persistence integrity check failed.") -> None:
        super().__init__(message)


class TwinSessionRecord(BaseModel):
    state_id: str
    plot_id: str | None = None
    crop_type: CropType
    planting_date: date
    location: Location
    soil_texture: SoilTexture
    created_at: datetime
    status: str = "active"
    latest_disease_state: DiseasePredictionResponse | None = None
    latest_growth_state: GrowthStageResponse | None = None
    latest_water_state: WaterStateResponse | None = None
    current_state: TwinCurrentState | None = None
    state_history: list[HistoryEvent] = Field(default_factory=list)
    latest_simulation: SimulateActionsResponse | None = None
    latest_recommendation: RecommendationResponse | None = None


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc_datetime(value: datetime, *, field_name: str) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{field_name} must be timezone-aware.")
    return value.astimezone(timezone.utc)


def derive_irrigation_event_id(
    *,
    state_id: str,
    timestamp: datetime,
    amount_mm: float,
) -> str:
    timestamp_utc = ensure_utc_datetime(
        timestamp,
        field_name="last_irrigation_event.timestamp",
    )
    normalized_amount = f"{float(amount_mm):.6f}"
    source = f"{state_id}|{timestamp_utc.isoformat()}|{normalized_amount}"
    digest = hashlib.sha256(source.encode("utf-8")).hexdigest()[:32]
    return f"irrigation_{digest}"


def with_irrigation_event_id(
    state_id: str,
    event: LastIrrigationEvent,
) -> LastIrrigationEvent:
    if not isinstance(event, LastIrrigationEvent):
        raise ValueError("last_irrigation_event must be a LastIrrigationEvent.")
    irrigation_event_id = event.irrigation_event_id or derive_irrigation_event_id(
        state_id=state_id,
        timestamp=event.timestamp,
        amount_mm=event.amount_mm,
    )
    return event.model_copy(update={"irrigation_event_id": irrigation_event_id})


def normalize_irrigation_event(
    state_id: str,
    event: LastIrrigationEvent,
) -> LastIrrigationEvent:
    return with_irrigation_event_id(state_id, event)


def irrigation_event_payload_conflict_field(
    existing: LastIrrigationEvent,
    candidate: LastIrrigationEvent,
) -> str | None:
    existing_id = existing.irrigation_event_id
    candidate_id = candidate.irrigation_event_id
    if existing_id != candidate_id:
        return "irrigation_event_id"
    if ensure_utc_datetime(
        existing.timestamp,
        field_name="last_irrigation_event.timestamp",
    ) != ensure_utc_datetime(
        candidate.timestamp,
        field_name="last_irrigation_event.timestamp",
    ):
        return "timestamp"
    if f"{float(existing.amount_mm):.6f}" != f"{float(candidate.amount_mm):.6f}":
        return "amount_mm"
    if existing.source != candidate.source:
        return "source"
    return None


class InMemoryTwinStateStore:
    def __init__(self, max_history: int = 10) -> None:
        self._sessions: dict[str, TwinSessionRecord] = {}
        self._farms: dict[str, FarmResponse] = {}
        self._plots: dict[str, PlotResponse] = {}
        self._actual_actions: dict[str, list[ActualActionResponse]] = {}
        self._irrigation_events: dict[str, tuple[str, LastIrrigationEvent]] = {}
        self._water_by_irrigation_event_id: dict[str, WaterStateResponse] = {}
        self._recommendations_by_id: dict[str, tuple[str, RecommendationResponse]] = {}
        self._disease_history: dict[str, list[DiseasePredictionResponse]] = {}
        self._growth_history: dict[str, list[GrowthStageResponse]] = {}
        self._growth_observation_metadata: dict[
            str,
            list[tuple[datetime, ObservationTimeBasis, datetime]],
        ] = {}
        self._water_history: dict[str, list[WaterStateResponse]] = {}
        self._max_history = max_history
        self._lock = threading.RLock()

    def _get_record_unlocked(self, state_id: str) -> TwinSessionRecord:
        record = self._sessions.get(state_id)
        if record is None:
            raise StateNotFoundError(state_id)
        return record

    def _validate_irrigation_event_unlocked(
        self,
        state_id: str,
        event: LastIrrigationEvent,
    ) -> LastIrrigationEvent:
        normalized = normalize_irrigation_event(state_id, event)
        event_id = normalized.irrigation_event_id
        if event_id is None:
            raise ValueError("irrigation_event_id is required.")

        existing = self._irrigation_events.get(event_id)
        if existing is None:
            return normalized

        existing_state_id, existing_event = existing
        if existing_state_id != state_id:
            raise IrrigationEventStateMismatchError(
                event_id,
                expected_state_id=state_id,
                actual_state_id=existing_state_id,
            )

        conflict_field = irrigation_event_payload_conflict_field(
            existing_event,
            normalized,
        )
        if conflict_field is not None:
            raise IrrigationEventPayloadConflictError(
                event_id,
                field=conflict_field,
            )

        return normalized

    def _record_irrigation_event_unlocked(
        self,
        state_id: str,
        event: LastIrrigationEvent,
    ) -> LastIrrigationEvent:
        normalized = self._validate_irrigation_event_unlocked(state_id, event)
        event_id = normalized.irrigation_event_id
        if event_id is None:
            raise ValueError("irrigation_event_id is required.")
        self._irrigation_events.setdefault(
            event_id,
            (state_id, normalized.model_copy(deep=True)),
        )
        return normalized

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
            record.latest_growth_state = growth_state.model_copy(deep=True)
            self._growth_history.setdefault(state_id, []).append(
                record.latest_growth_state.model_copy(deep=True)
            )
            self._growth_observation_metadata.setdefault(state_id, []).append(
                (observed_at_value, basis_value, computed_at_value)
            )
            return record.latest_growth_state.model_copy(deep=True)

    def cache_water_state(
        self,
        state_id: str,
        water_state: WaterStateResponse,
        *,
        weather_payload: dict[str, object] | None = None,
        previous_root_zone_depletion_mm: float | None = None,
        irrigation_event: LastIrrigationEvent | None = None,
    ) -> WaterStateResponse:
        with self._lock:
            record = self._get_record_unlocked(state_id)
            if water_state.state_id != state_id:
                raise ValueError("water_state.state_id does not match state_id.")
            if irrigation_event is not None:
                normalized_event = self._record_irrigation_event_unlocked(
                    state_id,
                    irrigation_event,
                )
                event_id = normalized_event.irrigation_event_id
                if event_id is None:
                    raise ValueError("irrigation_event_id is required.")
                if event_id in self._water_by_irrigation_event_id:
                    raise DuplicateIrrigationEventApplicationError(event_id)
            record.latest_water_state = water_state.model_copy(deep=True)
            self._water_history.setdefault(state_id, []).append(
                record.latest_water_state.model_copy(deep=True)
            )
            if irrigation_event is not None and event_id is not None:
                self._water_by_irrigation_event_id[event_id] = (
                    record.latest_water_state.model_copy(deep=True)
                )
            return record.latest_water_state.model_copy(deep=True)

    def cache_water_update(
        self,
        state_id: str,
        growth_state: GrowthStageResponse,
        water_state: WaterStateResponse,
        *,
        weather_payload: dict[str, object] | None = None,
        previous_root_zone_depletion_mm: float | None = None,
        irrigation_event: LastIrrigationEvent | None = None,
    ) -> WaterStateResponse:
        with self._lock:
            record = self._get_record_unlocked(state_id)
            if growth_state.state_id != state_id:
                raise ValueError("growth_state.state_id does not match state_id.")
            if water_state.state_id != state_id:
                raise ValueError("water_state.state_id does not match state_id.")
            canonical_water_state = water_state.model_copy(
                update={
                    "observed_at": ensure_utc_datetime(
                        water_state.observed_at,
                        field_name="observed_at",
                    ),
                    "computed_at": utc_now(),
                },
                deep=True,
            )

            event_id: str | None = None
            if irrigation_event is not None:
                normalized_event = self._record_irrigation_event_unlocked(
                    state_id,
                    irrigation_event,
                )
                event_id = normalized_event.irrigation_event_id
                if event_id is None:
                    raise ValueError("irrigation_event_id is required.")
                existing_water = self._water_by_irrigation_event_id.get(event_id)
                if existing_water is not None:
                    return existing_water.model_copy(deep=True)

            record.latest_growth_state = growth_state.model_copy(deep=True)
            self._growth_history.setdefault(state_id, []).append(
                record.latest_growth_state.model_copy(deep=True)
            )
            self._growth_observation_metadata.setdefault(state_id, []).append(
                (
                    canonical_water_state.observed_at,
                    canonical_water_state.observation_time_basis,
                    canonical_water_state.computed_at,
                )
            )

            record.latest_water_state = canonical_water_state.model_copy(deep=True)
            self._water_history.setdefault(state_id, []).append(
                record.latest_water_state.model_copy(deep=True)
            )
            if event_id is not None:
                self._water_by_irrigation_event_id[event_id] = (
                    record.latest_water_state.model_copy(deep=True)
                )
            return record.latest_water_state.model_copy(deep=True)

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

            now = utc_now()
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
                raw_root_zone_depletion_mm=water.raw_root_zone_depletion_mm,
                root_zone_depletion_mm=water.root_zone_depletion_mm,
                root_zone_depletion=water.root_zone_depletion,
                water_surplus_mm=water.water_surplus_mm,
                depletion_beyond_taw_mm=water.depletion_beyond_taw_mm,
                estimated_moisture_state=water.estimated_moisture_state,
                stress_band=water.stress_band,
                observed_at=water.observed_at,
                computed_at=now,
                observation_time_basis=water.observation_time_basis,
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
            return SessionResponse(
                state_id=record.state_id,
                crop_type=record.crop_type,
                planting_date=record.planting_date,
                location=record.location.model_copy(deep=True),
                soil_texture=record.soil_texture,
                created_at=record.created_at,
            )

    def has_applied_irrigation_event(
        self,
        state_id: str,
        irrigation_event_id: str,
        *,
        irrigation_event: LastIrrigationEvent | None = None,
    ) -> bool:
        with self._lock:
            self._get_record_unlocked(state_id)
            if irrigation_event is not None:
                normalized_event = self._validate_irrigation_event_unlocked(
                    state_id,
                    irrigation_event,
                )
                if normalized_event.irrigation_event_id != irrigation_event_id:
                    raise IrrigationEventPayloadConflictError(
                        irrigation_event_id,
                        field="irrigation_event_id",
                    )
            existing = self._irrigation_events.get(irrigation_event_id)
            if existing is None:
                return False
            existing_state_id, _existing_event = existing
            if existing_state_id != state_id:
                raise IrrigationEventStateMismatchError(
                    irrigation_event_id,
                    expected_state_id=state_id,
                    actual_state_id=existing_state_id,
                )
            return irrigation_event_id in self._water_by_irrigation_event_id

    def get_water_state_for_irrigation_event(
        self,
        state_id: str,
        irrigation_event: LastIrrigationEvent,
    ) -> WaterStateResponse | None:
        with self._lock:
            self._get_record_unlocked(state_id)
            normalized_event = self._validate_irrigation_event_unlocked(
                state_id,
                irrigation_event,
            )
            event_id = normalized_event.irrigation_event_id
            if event_id is None:
                raise ValueError("irrigation_event_id is required.")
            water_state = self._water_by_irrigation_event_id.get(event_id)
            return water_state.model_copy(deep=True) if water_state is not None else None

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

    def clear(self) -> None:
        with self._lock:
            self._sessions.clear()
            self._farms.clear()
            self._plots.clear()
            self._actual_actions.clear()
            self._irrigation_events.clear()
            self._water_by_irrigation_event_id.clear()
            self._recommendations_by_id.clear()
            self._disease_history.clear()
            self._growth_history.clear()
            self._growth_observation_metadata.clear()
            self._water_history.clear()

    def count(self) -> int:
        with self._lock:
            return len(self._sessions)


state_store = InMemoryTwinStateStore()
