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
            water_row = self._canonical_water_row(session, cycle)
            water = (
                self._water_state_from_row(water_row)
                if water_row is not None
                else None
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


def clear(self) -> None:
        with self._session_factory() as session:
            with session.begin():
                session.execute(
                    update(WaterObservationModel).values(irrigation_event_id=None)
                )
                for model in (
                    DailyAdvancementModel,
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


__all__ = [
    "create_schema",
    "create_session",
    "get_record",
    "get_session_state_response",
    "clear",
    "count",
    "create_farm",
    "list_farms",
    "get_farm",
    "create_plot",
    "list_plots",
    "get_plot",
    "create_crop_cycle_for_plot",
]
