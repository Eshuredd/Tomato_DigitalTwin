from __future__ import annotations

from datetime import datetime, timezone
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
    DuplicateActualActionError,
    DuplicateIrrigationEventApplicationError,
    IncompleteStateError,
    IrrigationEventPayloadConflictError,
    IrrigationEventStateMismatchError,
    MissingCachedOutputError,
    PersistenceIntegrityError,
    RecommendationStateMismatchError,
    RelatedRecommendationNotFoundError,
    StateNotFoundError,
    TwinSessionRecord,
    ensure_utc_datetime,
    irrigation_event_payload_conflict_field,
    normalize_irrigation_event,
    utc_now,
)

_ModelT = TypeVar("_ModelT", bound=BaseModel)


class SQLAlchemyTwinStateStore:
    def __init__(
        self,
        *,
        database_url: str | None = None,
        session_factory: SessionFactory | None = None,
        max_history: int = 10,
        auto_create: bool = False,
    ) -> None:
        if session_factory is None:
            if database_url is None:
                raise ValueError("database_url is required when session_factory is omitted.")
            self._engine = create_database_engine(database_url)
            if auto_create:
                create_tables(self._engine)
            self._session_factory = create_session_factory(self._engine)
        else:
            self._engine = None
            self._session_factory = session_factory
        self._max_history = max_history

    def create_schema(self) -> None:
        if self._engine is not None:
            create_tables(self._engine)

    def create_session(
        self,
        request: CreateSessionRequest,
        *,
        state_id: str | None = None,
        elevation_m: float | None = None,
        created_at: datetime | None = None,
    ) -> SessionResponse:
        state_id = state_id or self._new_id("state")
        timestamp = self._timestamp_or_now(created_at, "created_at")
        location = request.location.model_copy(deep=True)
        if elevation_m is not None:
            location.elevation_m = elevation_m
        cycle = CropCycleModel(
            state_id=state_id,
            plot_id=None,
            crop_type=request.crop_type.value,
            planting_date=request.planting_date,
            standalone_location_name=location.name,
            standalone_latitude=location.latitude,
            standalone_longitude=location.longitude,
            standalone_elevation_m=location.elevation_m,
            standalone_soil_texture=request.soil_texture.value,
            created_at=timestamp,
            status="active",
        )
        try:
            with self._session_factory() as session:
                with session.begin():
                    session.add(cycle)
        except IntegrityError as exc:
            raise ValueError(f"State '{state_id}' already exists.") from exc

        return SessionResponse(
            state_id=state_id,
            crop_type=request.crop_type,
            planting_date=request.planting_date,
            location=location.model_copy(deep=True),
            soil_texture=request.soil_texture,
            created_at=timestamp,
        )

    def get_record(self, state_id: str) -> TwinSessionRecord:
        with self._session_factory() as session:
            cycle = self._get_cycle_or_raise(session, state_id)
            disease = self._latest_payload(
                session,
                DiseaseObservationModel,
                state_id,
                DiseasePredictionResponse,
            )
            growth = self._latest_payload(
                session,
                GrowthObservationModel,
                state_id,
                GrowthStageResponse,
            )
            water = self._latest_payload(
                session,
                WaterObservationModel,
                state_id,
                WaterStateResponse,
            )
            snapshot = self._latest_snapshot(session, state_id)
            current_state = (
                self._payload_as(snapshot, TwinCurrentState)
                if snapshot is not None
                else None
            )
            latest_simulation = self._latest_valid_simulation_payload(
                session,
                state_id,
                snapshot.snapshot_id if snapshot is not None else None,
            )
            latest_recommendation = self._latest_valid_recommendation_payload(
                session,
                state_id,
                snapshot.snapshot_id if snapshot is not None else None,
                self._latest_valid_simulation_id(
                    session,
                    state_id,
                    snapshot.snapshot_id if snapshot is not None else None,
                ),
            )
            history = self._history_events(session, state_id)

            return TwinSessionRecord(
                state_id=cycle.state_id,
                plot_id=cycle.plot_id,
                crop_type=CropType(cycle.crop_type),
                planting_date=cycle.planting_date,
                location=self._cycle_location(cycle),
                soil_texture=SoilTexture(cycle.standalone_soil_texture),
                created_at=self._as_utc(cycle.created_at),
                status=cycle.status,
                latest_disease_state=disease,
                latest_growth_state=growth,
                latest_water_state=water,
                current_state=current_state,
                state_history=history,
                latest_simulation=latest_simulation,
                latest_recommendation=latest_recommendation,
            )

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

    def cache_water_state(
        self,
        state_id: str,
        water_state: WaterStateResponse,
        *,
        weather_payload: dict[str, object] | None = None,
        previous_root_zone_depletion_mm: float | None = None,
        irrigation_event: LastIrrigationEvent | None = None,
    ) -> WaterStateResponse:
        if water_state.state_id != state_id:
            raise ValueError("water_state.state_id does not match state_id.")
        normalized_event = (
            normalize_irrigation_event(state_id, irrigation_event)
            if irrigation_event is not None
            else None
        )
        event_id = normalized_event.irrigation_event_id if normalized_event else None
        observation_id = self._new_id("water_obs")
        try:
            with self._session_factory() as session:
                with session.begin():
                    cycle = self._get_cycle_or_raise(session, state_id)
                    if normalized_event is not None and event_id is not None:
                        self._get_or_create_irrigation_event(
                            session,
                            state_id=state_id,
                            event=normalized_event,
                            recorded_at=utc_now(),
                        )
                        if self._water_for_irrigation_event(
                            session,
                            state_id=state_id,
                            event_id=event_id,
                        ) is not None:
                            raise DuplicateIrrigationEventApplicationError(event_id)

                    water_row = WaterObservationModel(
                        observation_id=observation_id,
                        state_id=state_id,
                        observed_at=self._as_utc(water_state.observed_at),
                        computed_at=self._as_utc(water_state.computed_at),
                        observation_time_basis=water_state.observation_time_basis.value,
                        weather_payload_json=weather_payload,
                        previous_root_zone_depletion_mm=previous_root_zone_depletion_mm,
                        raw_root_zone_depletion_mm=water_state.raw_root_zone_depletion_mm,
                        root_zone_depletion_mm=water_state.root_zone_depletion_mm,
                        water_surplus_mm=water_state.water_surplus_mm,
                        depletion_beyond_taw_mm=water_state.depletion_beyond_taw_mm,
                        irrigation_event_id=event_id,
                        payload_json=self._dump(water_state),
                    )
                    session.add(water_row)
                    cycle.latest_observed_at = self._as_utc(water_state.observed_at)
                    cycle.latest_computed_at = self._as_utc(water_state.computed_at)
        except IntegrityError as exc:
            if normalized_event is not None and event_id is not None:
                self._existing_water_after_irrigation_integrity_error(
                    state_id=state_id,
                    event=normalized_event,
                )
                raise DuplicateIrrigationEventApplicationError(event_id) from exc
            raise PersistenceIntegrityError() from exc
        return water_state.model_copy(deep=True)

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
        if growth_state.state_id != state_id:
            raise ValueError("growth_state.state_id does not match state_id.")
        if water_state.state_id != state_id:
            raise ValueError("water_state.state_id does not match state_id.")

        normalized_event = (
            normalize_irrigation_event(state_id, irrigation_event)
            if irrigation_event is not None
            else None
        )
        event_id = normalized_event.irrigation_event_id if normalized_event else None
        observed_at = self._as_utc(water_state.observed_at)
        computed_at = utc_now()
        canonical_water_state = water_state.model_copy(
            update={"observed_at": observed_at, "computed_at": computed_at},
            deep=True,
        )
        try:
            with self._session_factory() as session:
                with session.begin():
                    cycle = self._get_cycle_or_raise(session, state_id)
                    if normalized_event is not None and event_id is not None:
                        self._get_or_create_irrigation_event(
                            session,
                            state_id=state_id,
                            event=normalized_event,
                            recorded_at=computed_at,
                        )
                        existing_water = self._water_for_irrigation_event(
                            session,
                            state_id=state_id,
                            event_id=event_id,
                        )
                        if existing_water is not None:
                            return self._payload_as(
                                existing_water,
                                WaterStateResponse,
                            ).model_copy(deep=True)

                    session.add(
                        GrowthObservationModel(
                            observation_id=self._new_id("growth_obs"),
                            state_id=state_id,
                            observed_at=observed_at,
                            computed_at=computed_at,
                            observation_time_basis=(
                                canonical_water_state.observation_time_basis.value
                            ),
                            current_date=growth_state.current_date,
                            days_since_planting=growth_state.days_since_planting,
                            growth_stage=growth_state.growth_stage.value,
                            stage_progress=growth_state.stage_progress,
                            payload_json=self._dump(growth_state),
                        )
                    )
                    session.add(
                        WaterObservationModel(
                            observation_id=self._new_id("water_obs"),
                            state_id=state_id,
                            observed_at=observed_at,
                            computed_at=computed_at,
                            observation_time_basis=(
                                canonical_water_state.observation_time_basis.value
                            ),
                            weather_payload_json=weather_payload,
                            previous_root_zone_depletion_mm=(
                                previous_root_zone_depletion_mm
                            ),
                            raw_root_zone_depletion_mm=(
                                canonical_water_state.raw_root_zone_depletion_mm
                            ),
                            root_zone_depletion_mm=(
                                canonical_water_state.root_zone_depletion_mm
                            ),
                            water_surplus_mm=canonical_water_state.water_surplus_mm,
                            depletion_beyond_taw_mm=(
                                canonical_water_state.depletion_beyond_taw_mm
                            ),
                            irrigation_event_id=event_id,
                            payload_json=self._dump(canonical_water_state),
                        )
                    )
                    cycle.latest_observed_at = observed_at
                    cycle.latest_computed_at = computed_at
        except IntegrityError as exc:
            if normalized_event is not None:
                return self._existing_water_after_irrigation_integrity_error(
                    state_id=state_id,
                    event=normalized_event,
                )
            raise PersistenceIntegrityError() from exc

        return canonical_water_state.model_copy(deep=True)

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

    def update_current_state(self, state_id: str) -> UpdateTwinStateResponse:
        with self._session_factory() as session:
            with session.begin():
                cycle = self._get_cycle_or_raise(session, state_id)
                disease_row = self._latest_row(session, DiseaseObservationModel, state_id)
                growth_row = self._latest_row(session, GrowthObservationModel, state_id)
                water_row = self._latest_row(session, WaterObservationModel, state_id)

                missing: list[str] = []
                if disease_row is None:
                    missing.append("latest_disease_state")
                if growth_row is None:
                    missing.append("latest_growth_state")
                if water_row is None:
                    missing.append("latest_water_state")
                if missing:
                    raise IncompleteStateError(missing)

                disease = self._payload_as(disease_row, DiseasePredictionResponse)
                growth = self._payload_as(growth_row, GrowthStageResponse)
                water = self._payload_as(water_row, WaterStateResponse)
                computed_at = utc_now()
                current_state = TwinCurrentState(
                    crop_type=CropType(cycle.crop_type),
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
                    computed_at=computed_at,
                    observation_time_basis=water.observation_time_basis,
                    last_update_time=computed_at,
                )
                snapshot = TwinStateSnapshotModel(
                    snapshot_id=self._new_id("snapshot"),
                    state_id=state_id,
                    observed_at=self._as_utc(water.observed_at),
                    computed_at=computed_at,
                    observation_time_basis=water.observation_time_basis.value,
                    disease_observation_id=disease_row.observation_id,
                    growth_observation_id=growth_row.observation_id,
                    water_observation_id=water_row.observation_id,
                    crop_type=current_state.crop_type.value,
                    growth_stage=current_state.growth_stage.value,
                    days_since_planting=current_state.days_since_planting,
                    predicted_label=current_state.predicted_label,
                    disease_category=current_state.disease_category.value,
                    confidence_calibrated=current_state.confidence_calibrated,
                    uncertainty_score=current_state.uncertainty_score,
                    uncertainty_band=current_state.uncertainty_band.value,
                    eto_computed=current_state.eto_computed,
                    eto_method=current_state.eto_method.value,
                    kc=current_state.kc,
                    etc=current_state.etc,
                    taw=current_state.taw,
                    raw_threshold=current_state.raw_threshold,
                    raw_root_zone_depletion_mm=current_state.raw_root_zone_depletion_mm,
                    root_zone_depletion_mm=current_state.root_zone_depletion_mm,
                    water_surplus_mm=current_state.water_surplus_mm,
                    depletion_beyond_taw_mm=current_state.depletion_beyond_taw_mm,
                    estimated_moisture_state=current_state.estimated_moisture_state.value,
                    stress_band=current_state.stress_band.value,
                    payload_json=self._dump(current_state),
                )
                session.add(snapshot)
                cycle.latest_observed_at = self._as_utc(water.observed_at)
                cycle.latest_computed_at = computed_at
                session.flush()
                snapshot_count = self._snapshot_count(session, state_id)

        return UpdateTwinStateResponse(
            state_id=state_id,
            current_state=current_state.model_copy(deep=True),
            state_history_count=snapshot_count,
        )

    def get_current_state(self, state_id: str) -> TwinCurrentState:
        with self._session_factory() as session:
            self._get_cycle_or_raise(session, state_id)
            snapshot = self._latest_snapshot(session, state_id)
            if snapshot is None:
                raise MissingCachedOutputError(state_id, "current_state")
            return self._payload_as(snapshot, TwinCurrentState).model_copy(deep=True)

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

    def get_session_state_response(self, state_id: str) -> SessionStateResponse:
        with self._session_factory() as session:
            cycle = self._get_cycle_or_raise(session, state_id)
            snapshot = self._latest_snapshot(session, state_id)
            if snapshot is None:
                raise MissingCachedOutputError(state_id, "current_state")
            return SessionStateResponse(
                state_id=cycle.state_id,
                crop_type=CropType(cycle.crop_type),
                planting_date=cycle.planting_date,
                location=self._cycle_location(cycle),
                soil_texture=SoilTexture(cycle.standalone_soil_texture),
                current_state=self._payload_as(snapshot, TwinCurrentState),
            )

    def get_history_response(self, state_id: str) -> SessionHistoryResponse:
        with self._session_factory() as session:
            self._get_cycle_or_raise(session, state_id)
            return SessionHistoryResponse(
                state_id=state_id,
                history=self._history_events(session, state_id),
            )

    def clear(self) -> None:
        with self._session_factory() as session:
            with session.begin():
                session.execute(
                    update(WaterObservationModel).values(irrigation_event_id=None)
                )
                for model in (
                    ActualActionModel,
                    RecommendationRunModel,
                    SimulationRunModel,
                    TwinStateSnapshotModel,
                    WaterObservationModel,
                    IrrigationEventModel,
                    GrowthObservationModel,
                    DiseaseObservationModel,
                    CropCycleModel,
                    PlotModel,
                    FarmModel,
                ):
                    session.execute(delete(model))

    def count(self) -> int:
        with self._session_factory() as session:
            return int(session.scalar(select(func.count()).select_from(CropCycleModel)) or 0)

    def create_farm(
        self,
        request: FarmCreateRequest,
        *,
        farm_id: str | None = None,
        created_at: datetime | None = None,
    ) -> FarmResponse:
        farm_id = farm_id or self._new_id("farm")
        timestamp = self._timestamp_or_now(created_at, "created_at")
        try:
            with self._session_factory() as session:
                with session.begin():
                    session.add(
                        FarmModel(
                            farm_id=farm_id,
                            name=request.name,
                            created_at=timestamp,
                            updated_at=timestamp,
                        )
                    )
        except IntegrityError as exc:
            raise ValueError(f"Farm '{farm_id}' already exists.") from exc
        return FarmResponse(
            farm_id=farm_id,
            name=request.name,
            created_at=timestamp,
            updated_at=timestamp,
        )

    def list_farms(self) -> list[FarmResponse]:
        with self._session_factory() as session:
            rows = session.scalars(select(FarmModel).order_by(FarmModel.created_at)).all()
            return [self._farm_response(row) for row in rows]

    def get_farm(self, farm_id: str) -> FarmResponse:
        with self._session_factory() as session:
            row = session.get(FarmModel, farm_id)
            if row is None:
                raise StateNotFoundError(farm_id)
            return self._farm_response(row)

    def create_plot(
        self,
        farm_id: str,
        request: PlotCreateRequest,
        *,
        plot_id: str | None = None,
        created_at: datetime | None = None,
    ) -> PlotResponse:
        plot_id = plot_id or self._new_id("plot")
        timestamp = self._timestamp_or_now(created_at, "created_at")
        try:
            with self._session_factory() as session:
                with session.begin():
                    if session.get(FarmModel, farm_id) is None:
                        raise StateNotFoundError(farm_id)
                    session.add(
                        PlotModel(
                            plot_id=plot_id,
                            farm_id=farm_id,
                            name=request.name,
                            location_name=request.location.name,
                            latitude=request.location.latitude,
                            longitude=request.location.longitude,
                            elevation_m=self._required_elevation(request.location),
                            soil_texture=request.soil_texture.value,
                            created_at=timestamp,
                            updated_at=timestamp,
                        )
                    )
        except IntegrityError as exc:
            raise ValueError(f"Plot '{plot_id}' already exists.") from exc
        return PlotResponse(
            plot_id=plot_id,
            farm_id=farm_id,
            name=request.name,
            location=request.location.model_copy(deep=True),
            soil_texture=request.soil_texture,
            created_at=timestamp,
            updated_at=timestamp,
        )

    def list_plots(self, farm_id: str) -> list[PlotResponse]:
        with self._session_factory() as session:
            if session.get(FarmModel, farm_id) is None:
                raise StateNotFoundError(farm_id)
            rows = session.scalars(
                select(PlotModel)
                .where(PlotModel.farm_id == farm_id)
                .order_by(PlotModel.created_at)
            ).all()
            return [self._plot_response(row) for row in rows]

    def get_plot(self, plot_id: str) -> PlotResponse:
        with self._session_factory() as session:
            row = session.get(PlotModel, plot_id)
            if row is None:
                raise StateNotFoundError(plot_id)
            return self._plot_response(row)

    def create_crop_cycle_for_plot(
        self,
        plot_id: str,
        request: CreateCropCycleRequest,
        *,
        state_id: str | None = None,
        created_at: datetime | None = None,
    ) -> SessionResponse:
        state_id = state_id or self._new_id("state")
        timestamp = self._timestamp_or_now(created_at, "created_at")
        with self._session_factory() as session:
            with session.begin():
                plot = session.get(PlotModel, plot_id)
                if plot is None:
                    raise StateNotFoundError(plot_id)
                cycle = CropCycleModel(
                    state_id=state_id,
                    plot_id=plot_id,
                    crop_type=request.crop_type.value,
                    planting_date=request.planting_date,
                    standalone_location_name=plot.location_name,
                    standalone_latitude=plot.latitude,
                    standalone_longitude=plot.longitude,
                    standalone_elevation_m=plot.elevation_m,
                    standalone_soil_texture=plot.soil_texture,
                    created_at=timestamp,
                    status="active",
                )
                try:
                    session.add(cycle)
                    session.flush()
                except IntegrityError as exc:
                    raise ValueError(f"State '{state_id}' already exists.") from exc
                location = self._cycle_location(cycle)
                soil_texture = SoilTexture(cycle.standalone_soil_texture)
        return SessionResponse(
            state_id=state_id,
            crop_type=request.crop_type,
            planting_date=request.planting_date,
            location=location,
            soil_texture=soil_texture,
            created_at=timestamp,
        )

    def has_applied_irrigation_event(
        self,
        state_id: str,
        irrigation_event_id: str,
        *,
        irrigation_event: LastIrrigationEvent | None = None,
    ) -> bool:
        with self._session_factory() as session:
            self._get_cycle_or_raise(session, state_id)
            event = session.get(IrrigationEventModel, irrigation_event_id)
            if event is None:
                return False
            normalized_event = (
                normalize_irrigation_event(state_id, irrigation_event)
                if irrigation_event is not None
                else None
            )
            if normalized_event is None:
                if event.state_id != state_id:
                    raise IrrigationEventStateMismatchError(
                        irrigation_event_id,
                        expected_state_id=state_id,
                        actual_state_id=event.state_id,
                    )
            else:
                if normalized_event.irrigation_event_id != irrigation_event_id:
                    raise IrrigationEventPayloadConflictError(
                        irrigation_event_id,
                        field="irrigation_event_id",
                    )
                self._validate_irrigation_event_row(
                    event,
                    state_id=state_id,
                    event=normalized_event,
                )
            return (
                self._water_for_irrigation_event(
                    session,
                    state_id=state_id,
                    event_id=irrigation_event_id,
                )
                is not None
            )

    def get_water_state_for_irrigation_event(
        self,
        state_id: str,
        irrigation_event: LastIrrigationEvent,
    ) -> WaterStateResponse | None:
        normalized_event = normalize_irrigation_event(state_id, irrigation_event)
        event_id = normalized_event.irrigation_event_id
        if event_id is None:
            raise ValueError("irrigation_event_id is required.")
        with self._session_factory() as session:
            self._get_cycle_or_raise(session, state_id)
            event = session.get(IrrigationEventModel, event_id)
            if event is None:
                return None
            self._validate_irrigation_event_row(
                event,
                state_id=state_id,
                event=normalized_event,
            )
            water = self._water_for_irrigation_event(
                session,
                state_id=state_id,
                event_id=event_id,
            )
            if water is None:
                return None
            return self._payload_as(water, WaterStateResponse).model_copy(deep=True)

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

    def _validate_irrigation_event_row(
        self,
        row: IrrigationEventModel,
        *,
        state_id: str,
        event: LastIrrigationEvent,
    ) -> None:
        event_id = event.irrigation_event_id
        if event_id is None:
            raise ValueError("irrigation_event_id is required.")
        if row.state_id != state_id:
            raise IrrigationEventStateMismatchError(
                event_id,
                expected_state_id=state_id,
                actual_state_id=row.state_id,
            )

        existing_event = LastIrrigationEvent(
            irrigation_event_id=row.irrigation_event_id,
            timestamp=self._as_utc(row.occurred_at),
            amount_mm=row.amount_mm,
            source=row.source,
        )
        conflict_field = irrigation_event_payload_conflict_field(
            existing_event,
            event,
        )
        if conflict_field is not None:
            raise IrrigationEventPayloadConflictError(
                event_id,
                field=conflict_field,
            )

    def _get_or_create_irrigation_event(
        self,
        session: Session,
        *,
        state_id: str,
        event: LastIrrigationEvent,
        recorded_at: datetime,
    ) -> IrrigationEventModel:
        normalized_event = normalize_irrigation_event(state_id, event)
        event_id = normalized_event.irrigation_event_id
        if event_id is None:
            raise ValueError("irrigation_event_id is required.")

        row = session.get(IrrigationEventModel, event_id)
        if row is not None:
            self._validate_irrigation_event_row(
                row,
                state_id=state_id,
                event=normalized_event,
            )
            return row

        row = IrrigationEventModel(
            irrigation_event_id=event_id,
            state_id=state_id,
            occurred_at=self._as_utc(normalized_event.timestamp),
            amount_mm=normalized_event.amount_mm,
            source=normalized_event.source.value,
            recorded_at=recorded_at,
            payload_json=self._dump(normalized_event),
        )
        session.add(row)
        session.flush()
        return row

    def _water_for_irrigation_event(
        self,
        session: Session,
        *,
        state_id: str,
        event_id: str,
    ) -> WaterObservationModel | None:
        return session.scalars(
            select(WaterObservationModel)
            .where(
                WaterObservationModel.state_id == state_id,
                WaterObservationModel.irrigation_event_id == event_id,
            )
            .limit(1)
        ).first()

    def _existing_water_after_irrigation_integrity_error(
        self,
        *,
        state_id: str,
        event: LastIrrigationEvent,
    ) -> WaterStateResponse:
        normalized_event = normalize_irrigation_event(state_id, event)
        event_id = normalized_event.irrigation_event_id
        if event_id is None:
            raise ValueError("irrigation_event_id is required.")
        with self._session_factory() as session:
            self._get_cycle_or_raise(session, state_id)
            row = session.get(IrrigationEventModel, event_id)
            if row is None:
                raise PersistenceIntegrityError()
            self._validate_irrigation_event_row(
                row,
                state_id=state_id,
                event=normalized_event,
            )
            water = self._water_for_irrigation_event(
                session,
                state_id=state_id,
                event_id=event_id,
            )
            if water is None:
                raise PersistenceIntegrityError()
            return self._payload_as(water, WaterStateResponse).model_copy(deep=True)

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

    @staticmethod
    def _new_id(prefix: str) -> str:
        return f"{prefix}_{uuid.uuid4().hex}"

    @staticmethod
    def _dump(model: BaseModel) -> dict[str, object]:
        return model.model_dump(mode="json")

    @staticmethod
    def _as_utc(value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    @staticmethod
    def _timestamp_or_now(value: datetime | None, field_name: str) -> datetime:
        return utc_now() if value is None else ensure_utc_datetime(value, field_name=field_name)

    @staticmethod
    def _required_elevation(location: Location) -> float:
        if location.elevation_m is None:
            raise ValueError("location.elevation_m is required for persistent plots.")
        return location.elevation_m

    @staticmethod
    def _payload_as(row: object, schema: type[_ModelT]) -> _ModelT:
        payload = getattr(row, "payload_json")
        return schema.model_validate(payload)

    @staticmethod
    def _cycle_location(cycle: CropCycleModel) -> Location:
        return Location(
            name=cycle.standalone_location_name,
            latitude=cycle.standalone_latitude,
            longitude=cycle.standalone_longitude,
            elevation_m=cycle.standalone_elevation_m,
        )

    def _get_cycle_or_raise(self, session: Session, state_id: str) -> CropCycleModel:
        cycle = session.get(CropCycleModel, state_id)
        if cycle is None:
            raise StateNotFoundError(state_id)
        return cycle

    def _latest_row(
        self,
        session: Session,
        model: type,
        state_id: str,
    ) -> object | None:
        return session.scalars(
            select(model)
            .where(model.state_id == state_id)
            .order_by(desc(model.computed_at))
            .limit(1)
        ).first()

    def _latest_payload(
        self,
        session: Session,
        model: type,
        state_id: str,
        schema: type[_ModelT],
    ) -> _ModelT | None:
        row = self._latest_row(session, model, state_id)
        return self._payload_as(row, schema) if row is not None else None

    def _latest_snapshot(
        self,
        session: Session,
        state_id: str,
    ) -> TwinStateSnapshotModel | None:
        return session.scalars(
            select(TwinStateSnapshotModel)
            .where(TwinStateSnapshotModel.state_id == state_id)
            .order_by(desc(TwinStateSnapshotModel.computed_at))
            .limit(1)
        ).first()

    def _latest_valid_simulation_row(
        self,
        session: Session,
        state_id: str,
        snapshot_id: str,
    ) -> SimulationRunModel | None:
        return session.scalars(
            select(SimulationRunModel)
            .where(
                SimulationRunModel.state_id == state_id,
                SimulationRunModel.source_snapshot_id == snapshot_id,
            )
            .order_by(desc(SimulationRunModel.computed_at))
            .limit(1)
        ).first()

    def _latest_valid_simulation_id(
        self,
        session: Session,
        state_id: str,
        snapshot_id: str | None,
    ) -> str | None:
        if snapshot_id is None:
            return None
        simulation = self._latest_valid_simulation_row(session, state_id, snapshot_id)
        return simulation.simulation_id if simulation is not None else None

    def _latest_valid_simulation_payload(
        self,
        session: Session,
        state_id: str,
        snapshot_id: str | None,
    ) -> SimulateActionsResponse | None:
        if snapshot_id is None:
            return None
        simulation = self._latest_valid_simulation_row(session, state_id, snapshot_id)
        return (
            self._payload_as(simulation, SimulateActionsResponse)
            if simulation is not None
            else None
        )

    def _latest_valid_recommendation_row(
        self,
        session: Session,
        state_id: str,
        snapshot_id: str,
        simulation_id: str,
    ) -> RecommendationRunModel | None:
        return session.scalars(
            select(RecommendationRunModel)
            .where(
                RecommendationRunModel.state_id == state_id,
                RecommendationRunModel.source_snapshot_id == snapshot_id,
                RecommendationRunModel.source_simulation_id == simulation_id,
            )
            .order_by(desc(RecommendationRunModel.computed_at))
            .limit(1)
        ).first()

    def _latest_valid_recommendation_payload(
        self,
        session: Session,
        state_id: str,
        snapshot_id: str | None,
        simulation_id: str | None,
    ) -> RecommendationResponse | None:
        if snapshot_id is None or simulation_id is None:
            return None
        row = self._latest_valid_recommendation_row(
            session,
            state_id,
            snapshot_id,
            simulation_id,
        )
        return self._payload_as(row, RecommendationResponse) if row is not None else None

    def _history_events(
        self,
        session: Session,
        state_id: str,
    ) -> list[HistoryEvent]:
        rows = session.scalars(
            select(TwinStateSnapshotModel)
            .where(TwinStateSnapshotModel.state_id == state_id)
            .order_by(desc(TwinStateSnapshotModel.computed_at))
            .limit(self._max_history)
        ).all()
        events: list[HistoryEvent] = []
        for row in reversed(rows):
            current = self._payload_as(row, TwinCurrentState)
            events.append(
                HistoryEvent(
                    timestamp=current.computed_at,
                    growth_stage=current.growth_stage,
                    predicted_label=current.predicted_label,
                    root_zone_depletion=current.root_zone_depletion,
                    stress_band=current.stress_band,
                )
            )
        return events

    def _snapshot_count(self, session: Session, state_id: str) -> int:
        return int(
            session.scalar(
                select(func.count())
                .select_from(TwinStateSnapshotModel)
                .where(TwinStateSnapshotModel.state_id == state_id)
            )
            or 0
        )

    @staticmethod
    def _farm_response(row: FarmModel) -> FarmResponse:
        return FarmResponse(
            farm_id=row.farm_id,
            name=row.name,
            created_at=SQLAlchemyTwinStateStore._as_utc(row.created_at),
            updated_at=SQLAlchemyTwinStateStore._as_utc(row.updated_at),
        )

    @staticmethod
    def _plot_response(row: PlotModel) -> PlotResponse:
        return PlotResponse(
            plot_id=row.plot_id,
            farm_id=row.farm_id,
            name=row.name,
            location=Location(
                name=row.location_name,
                latitude=row.latitude,
                longitude=row.longitude,
                elevation_m=row.elevation_m,
            ),
            soil_texture=SoilTexture(row.soil_texture),
            created_at=SQLAlchemyTwinStateStore._as_utc(row.created_at),
            updated_at=SQLAlchemyTwinStateStore._as_utc(row.updated_at),
        )
