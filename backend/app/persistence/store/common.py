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


def _new_id(prefix: str) -> str:
        return f"{prefix}_{uuid.uuid4().hex}"


def _validate_water_update_id(water_update_id: str) -> str:
        if not isinstance(water_update_id, str):
            raise ValueError("water_update_id must be a string.")
        normalized = water_update_id.strip()
        if not normalized:
            raise ValueError("water_update_id must be non-empty.")
        if len(normalized) > 160:
            raise ValueError("water_update_id must be at most 160 characters.")
        return normalized


def _validate_request_fingerprint(request_fingerprint: str) -> str:
        if not isinstance(request_fingerprint, str):
            raise ValueError("request_fingerprint must be a string.")
        normalized = request_fingerprint.strip()
        if not normalized:
            raise ValueError("request_fingerprint must be non-empty.")
        if len(normalized) > 128:
            raise ValueError("request_fingerprint must be at most 128 characters.")
        return normalized


def _validate_non_empty_bounded_string(
        value: str,
        *,
        field_name: str,
        max_length: int,
    ) -> str:
        if not isinstance(value, str):
            raise ValueError(f"{field_name} must be a string.")
        normalized = value.strip()
        if not normalized:
            raise ValueError(f"{field_name} must be non-empty.")
        if len(normalized) > max_length:
            raise ValueError(f"{field_name} must be at most {max_length} characters.")
        return normalized


def _validate_effective_irrigation_mm(value: float) -> float:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("effective_irrigation_mm must be a finite number.")
        result = float(value)
        if not math.isfinite(result):
            raise ValueError("effective_irrigation_mm must be a finite number.")
        if result < 0.0:
            raise ValueError("effective_irrigation_mm must be >= 0.")
        return result


def _validate_base_sequence(value: int | None, *, field_name: str) -> int:
        if value is None:
            raise ValueError(f"{field_name} is required.")
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValueError(f"{field_name} must be an integer.")
        if value < 0:
            raise ValueError(f"{field_name} must be >= 0.")
        return value


def _validate_effective_matches_event(
        *,
        state_id: str,
        irrigation_event_id: str,
        event_amount_mm: float,
        effective_irrigation_mm: float,
    ) -> None:
        if math.isclose(
            float(event_amount_mm),
            float(effective_irrigation_mm),
            rel_tol=0.0,
            abs_tol=1e-9,
        ):
            return
        raise PersistenceIntegrityError(
            "Water update effective irrigation does not match the current "
            f"application state for irrigation event '{irrigation_event_id}' "
            f"on state '{state_id}'."
        )


def _legacy_water_state_fingerprint(
        *,
        state_id: str,
        water_update_id: str,
        water_state: WaterStateResponse,
    ) -> str:
        payload = {
            "legacy_cache_water_state": True,
            "state_id": state_id,
            "water_update_id": water_update_id,
            "water_state": water_state.model_dump(mode="json"),
        }
        canonical = json.dumps(
            payload,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _dump(model: BaseModel) -> dict[str, object]:
        return model.model_dump(mode="json")


def _as_utc(value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


def _timestamp_or_now(value: datetime | None, field_name: str) -> datetime:
        return utc_now() if value is None else ensure_utc_datetime(value, field_name=field_name)


def _required_elevation(location: Location) -> float:
        if location.elevation_m is None:
            raise ValueError("location.elevation_m is required for persistent plots.")
        return location.elevation_m


def _payload_as(row: object, schema: type[_ModelT]) -> _ModelT:
        payload = getattr(row, "payload_json")
        return schema.model_validate(payload)


def _water_state_from_row(self, row: WaterObservationModel) -> WaterStateResponse:
        payload = self._payload_as(row, WaterStateResponse)
        return payload.model_copy(
            update={
                "water_observation_id": row.observation_id,
                "water_sequence": row.water_sequence,
                "base_water_observation_id": row.base_water_observation_id,
                "base_water_sequence": row.base_water_sequence,
                "previous_root_zone_depletion_mm": (
                    0.0
                    if row.previous_root_zone_depletion_mm is None
                    else row.previous_root_zone_depletion_mm
                ),
                "water_update_id": row.water_update_id,
                "reported_irrigation_event_id": row.reported_irrigation_event_id,
                "applied_irrigation_event_id": row.irrigation_event_id,
                "effective_irrigation_mm": row.effective_irrigation_mm,
                "irrigation_event_already_accounted_for": (
                    row.reported_irrigation_event_id is not None
                    and row.irrigation_event_id is None
                    and row.effective_irrigation_mm == 0.0
                ),
                "observed_at": self._as_utc(row.observed_at),
                "computed_at": self._as_utc(row.computed_at),
            },
            deep=True,
        )


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


def _canonical_water_row(
        self,
        session: Session,
        cycle: CropCycleModel,
    ) -> WaterObservationModel | None:
        if cycle.water_sequence == 0:
            return None
        row: WaterObservationModel | None = None
        if cycle.latest_water_observation_id is not None:
            row = session.get(
                WaterObservationModel,
                cycle.latest_water_observation_id,
            )
        if row is None:
            row = session.scalars(
                select(WaterObservationModel)
                .where(
                    WaterObservationModel.state_id == cycle.state_id,
                    WaterObservationModel.water_sequence == cycle.water_sequence,
                )
                .limit(1)
            ).first()
        if row is None:
            raise PersistenceIntegrityError(
                "Crop cycle canonical water pointer references a missing observation."
            )
        if row.state_id != cycle.state_id or row.water_sequence != cycle.water_sequence:
            raise PersistenceIntegrityError(
                "Crop cycle canonical water pointer does not match its sequence."
            )
        return row


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


def _snapshot_for_source_fingerprint(
        self,
        session: Session,
        *,
        state_id: str,
        source_fingerprint: str,
    ) -> TwinStateSnapshotModel | None:
        return session.scalars(
            select(TwinStateSnapshotModel)
            .where(
                TwinStateSnapshotModel.state_id == state_id,
                TwinStateSnapshotModel.source_fingerprint == source_fingerprint,
            )
            .limit(1)
        ).first()


def _snapshot_update_response(
        self,
        session: Session,
        *,
        state_id: str,
        snapshot: TwinStateSnapshotModel,
        snapshot_created: bool,
    ) -> UpdateTwinStateResponse:
        return UpdateTwinStateResponse(
            state_id=state_id,
            current_state=self._payload_as(snapshot, TwinCurrentState).model_copy(
                deep=True,
            ),
            state_history_count=self._snapshot_count(session, state_id),
            snapshot_id=snapshot.snapshot_id,
            snapshot_created=snapshot_created,
        )


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


def _farm_response(row: FarmModel) -> FarmResponse:
        return FarmResponse(
            farm_id=row.farm_id,
            name=row.name,
            created_at=_as_utc(row.created_at),
            updated_at=_as_utc(row.updated_at),
        )


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
            created_at=_as_utc(row.created_at),
            updated_at=_as_utc(row.updated_at),
        )


__all__ = [
    "_new_id",
    "_validate_water_update_id",
    "_validate_request_fingerprint",
    "_validate_non_empty_bounded_string",
    "_validate_effective_irrigation_mm",
    "_validate_base_sequence",
    "_validate_effective_matches_event",
    "_legacy_water_state_fingerprint",
    "_dump",
    "_as_utc",
    "_timestamp_or_now",
    "_required_elevation",
    "_payload_as",
    "_water_state_from_row",
    "_cycle_location",
    "_get_cycle_or_raise",
    "_latest_row",
    "_latest_payload",
    "_canonical_water_row",
    "_latest_snapshot",
    "_snapshot_for_source_fingerprint",
    "_snapshot_update_response",
    "_latest_valid_simulation_row",
    "_latest_valid_simulation_id",
    "_latest_valid_simulation_payload",
    "_latest_valid_recommendation_row",
    "_latest_valid_recommendation_payload",
    "_history_events",
    "_snapshot_count",
    "_farm_response",
    "_plot_response",
]
