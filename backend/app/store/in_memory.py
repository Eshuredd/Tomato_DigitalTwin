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


class InMemoryTwinStateStore:
    def __init__(self, max_history: int = 10) -> None:
        self._sessions: dict[str, TwinSessionRecord] = {}
        self._farms: dict[str, FarmResponse] = {}
        self._plots: dict[str, PlotResponse] = {}
        self._actual_actions: dict[str, list[ActualActionResponse]] = {}
        self._irrigation_events: dict[str, tuple[str, LastIrrigationEvent]] = {}
        self._water_by_irrigation_event_id: dict[str, WaterStateResponse] = {}
        self._water_by_update_id: dict[tuple[str, str], tuple[str, WaterStateResponse]] = {}
        self._water_by_observation_id: dict[str, tuple[str, WaterStateResponse]] = {}
        self._water_growth_observation_id: dict[str, str] = {}
        self._latest_water_observation_id: dict[str, str | None] = {}
        self._water_sequence: dict[str, int] = {}
        self._latest_disease_observation_id: dict[str, str] = {}
        self._latest_growth_observation_id: dict[str, str] = {}
        self._disease_by_observation_id: dict[str, tuple[str, DiseasePredictionResponse]] = {}
        self._growth_by_observation_id: dict[str, tuple[str, GrowthStageResponse]] = {}
        self._snapshot_by_fingerprint: dict[tuple[str, str], tuple[str, TwinCurrentState, str]] = {}
        self._snapshot_sources: dict[str, SnapshotSourceIdentity] = {}
        self._daily_advancements: dict[
            tuple[str, str],
            tuple[str, date, str, AdvanceOneDayResponse],
        ] = {}
        self._daily_advancement_by_target_date: dict[
            tuple[str, date],
            str,
        ] = {}
        self._recommendations_by_id: dict[str, tuple[str, RecommendationResponse]] = {}
        self._disease_history: dict[str, list[DiseasePredictionResponse]] = {}
        self._growth_history: dict[str, list[GrowthStageResponse]] = {}
        self._growth_observation_metadata: dict[
            str,
            list[tuple[datetime, ObservationTimeBasis, datetime]],
        ] = {}
        self._water_history: dict[str, list[WaterStateResponse]] = {}
        self._water_observation_metadata: dict[str, list[dict[str, object]]] = {}
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

    def _daily_advancement_rollback_snapshot_unlocked(
        self,
        state_id: str,
        record: TwinSessionRecord,
    ) -> dict[str, object]:
        return {
            "latest_growth_state": (
                None
                if record.latest_growth_state is None
                else record.latest_growth_state.model_copy(deep=True)
            ),
            "latest_water_state": (
                None
                if record.latest_water_state is None
                else record.latest_water_state.model_copy(deep=True)
            ),
            "current_state": (
                None
                if record.current_state is None
                else record.current_state.model_copy(deep=True)
            ),
            "latest_simulation": (
                None
                if record.latest_simulation is None
                else record.latest_simulation.model_copy(deep=True)
            ),
            "latest_recommendation": (
                None
                if record.latest_recommendation is None
                else record.latest_recommendation.model_copy(deep=True)
            ),
            "state_history": list(record.state_history),
            "_irrigation_events": self._irrigation_events.copy(),
            "_water_by_irrigation_event_id": self._water_by_irrigation_event_id.copy(),
            "_water_by_update_id": self._water_by_update_id.copy(),
            "_water_by_observation_id": self._water_by_observation_id.copy(),
            "_water_growth_observation_id": self._water_growth_observation_id.copy(),
            "_latest_water_observation_id": self._latest_water_observation_id.copy(),
            "_water_sequence": self._water_sequence.copy(),
            "_latest_growth_observation_id": self._latest_growth_observation_id.copy(),
            "_growth_by_observation_id": self._growth_by_observation_id.copy(),
            "_snapshot_by_fingerprint": self._snapshot_by_fingerprint.copy(),
            "_snapshot_sources": self._snapshot_sources.copy(),
            "_daily_advancements": self._daily_advancements.copy(),
            "_daily_advancement_by_target_date": (
                self._daily_advancement_by_target_date.copy()
            ),
            "_growth_history": {
                key: list(value) for key, value in self._growth_history.items()
            },
            "_growth_observation_metadata": {
                key: list(value)
                for key, value in self._growth_observation_metadata.items()
            },
            "_water_history": {
                key: list(value) for key, value in self._water_history.items()
            },
            "_water_observation_metadata": {
                key: list(value)
                for key, value in self._water_observation_metadata.items()
            },
        }

    def _restore_daily_advancement_rollback_snapshot_unlocked(
        self,
        record: TwinSessionRecord,
        snapshot: dict[str, object],
    ) -> None:
        record.latest_growth_state = snapshot["latest_growth_state"]
        record.latest_water_state = snapshot["latest_water_state"]
        record.current_state = snapshot["current_state"]
        record.latest_simulation = snapshot["latest_simulation"]
        record.latest_recommendation = snapshot["latest_recommendation"]
        record.state_history = list(snapshot["state_history"])
        for name in (
            "_irrigation_events",
            "_water_by_irrigation_event_id",
            "_water_by_update_id",
            "_water_by_observation_id",
            "_water_growth_observation_id",
            "_latest_water_observation_id",
            "_water_sequence",
            "_latest_growth_observation_id",
            "_growth_by_observation_id",
            "_snapshot_by_fingerprint",
            "_snapshot_sources",
            "_daily_advancements",
            "_daily_advancement_by_target_date",
            "_growth_history",
            "_growth_observation_metadata",
            "_water_history",
            "_water_observation_metadata",
        ):
            setattr(self, name, snapshot[name])

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

    def get_canonical_water_baseline(
        self,
        state_id: str,
    ) -> WaterBaseline | None:
        with self._lock:
            self._get_record_unlocked(state_id)
            observation_id = self._latest_water_observation_id.get(state_id)
            if observation_id is None:
                return None
            _row_state_id, water = self._water_by_observation_id[observation_id]
            if water.water_observation_id is None:
                raise PersistenceIntegrityError("Canonical water observation is missing an ID.")
            return WaterBaseline(
                water_observation_id=water.water_observation_id,
                water_sequence=water.water_sequence,
                current_date=ensure_utc_datetime(
                    water.observed_at,
                    field_name="observed_at",
                ).date(),
                observed_at=ensure_utc_datetime(
                    water.observed_at,
                    field_name="observed_at",
                ),
                root_zone_depletion_mm=water.root_zone_depletion_mm,
                water_update_id=water.water_update_id or "",
            )

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

    def cache_water_state(
        self,
        state_id: str,
        water_state: WaterStateResponse,
        *,
        weather_payload: dict[str, object] | None = None,
        previous_root_zone_depletion_mm: float | None = None,
        irrigation_event: LastIrrigationEvent | None = None,
    ) -> WaterStateResponse:
        """Deprecated compatibility shim; canonical writes require cache_water_update."""
        raise RuntimeError(
            "cache_water_state is deprecated and cannot advance the canonical "
            "water chain; use cache_water_update with paired growth state."
        )

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
        expected_base_water_observation_id: str | None = None,
        expected_base_water_sequence: int | None = None,
        calculated_previous_root_zone_depletion_mm: float | None = None,
        reported_irrigation_event: LastIrrigationEvent | None = None,
        effective_irrigation_mm: float = 0.0,
        computed_at: datetime | None = None,
    ) -> WaterStateResponse:
        with self._lock:
            record = self._get_record_unlocked(state_id)
            if growth_state.state_id != state_id:
                raise ValueError("growth_state.state_id does not match state_id.")
            if water_state.state_id != state_id:
                raise ValueError("water_state.state_id does not match state_id.")
            water_update_id_value = _validate_water_update_id(water_update_id)
            request_fingerprint_value = _validate_request_fingerprint(
                request_fingerprint,
            )
            existing = self._water_by_update_id.get(
                (state_id, water_update_id_value),
            )
            if existing is not None:
                existing_fingerprint, existing_water = existing
                if existing_fingerprint != request_fingerprint_value:
                    raise WaterUpdatePayloadConflictError(
                        state_id,
                        water_update_id_value,
                        existing_fingerprint=existing_fingerprint,
                        request_fingerprint=request_fingerprint_value,
                    )
                return existing_water.model_copy(deep=True)

            current_baseline = self.get_canonical_water_baseline(state_id)
            current_base_id = (
                None
                if current_baseline is None
                else current_baseline.water_observation_id
            )
            current_base_sequence = (
                0 if current_baseline is None else current_baseline.water_sequence
            )
            current_depletion = (
                0.0
                if current_baseline is None
                else current_baseline.root_zone_depletion_mm
            )
            supplied_sequence = (
                current_base_sequence
                if expected_base_water_sequence is None
                else _validate_base_sequence(
                    expected_base_water_sequence,
                    field_name="expected_base_water_sequence",
                )
            )
            supplied_id = (
                current_base_id
                if expected_base_water_sequence is None
                else expected_base_water_observation_id
            )
            self._validate_expected_water_baseline_unlocked(
                state_id=state_id,
                supplied_base_water_observation_id=supplied_id,
                supplied_base_water_sequence=supplied_sequence,
                current_base_water_observation_id=current_base_id,
                current_base_water_sequence=current_base_sequence,
            )
            calculated_previous = (
                water_state.previous_root_zone_depletion_mm
                if calculated_previous_root_zone_depletion_mm is None
                else float(calculated_previous_root_zone_depletion_mm)
            )
            if not _depletion_matches(calculated_previous, current_depletion):
                raise WaterBaselineMismatchError(
                    "Calculated previous_root_zone_depletion_mm does not match "
                    "the canonical water baseline.",
                    state_id=state_id,
                    supplied_previous_root_zone_depletion_mm=calculated_previous,
                    current_previous_root_zone_depletion_mm=current_depletion,
                )

            effective_irrigation_mm_value = _validate_effective_irrigation_mm(
                effective_irrigation_mm,
            )
            observed_at_value = ensure_utc_datetime(
                water_state.observed_at,
                field_name="observed_at",
            )
            if current_baseline is not None:
                if observed_at_value < current_baseline.observed_at:
                    raise OutOfOrderWaterObservationError(
                        state_id,
                        supplied_observed_at=observed_at_value,
                        current_observed_at=current_baseline.observed_at,
                    )
                if observed_at_value == current_baseline.observed_at:
                    raise WaterObservationTimeConflictError(
                        state_id,
                        supplied_observed_at=observed_at_value,
                        current_observed_at=current_baseline.observed_at,
                        observation_time_basis=water_state.observation_time_basis,
                    )

            observation_id = f"water_obs_{uuid.uuid4().hex}"
            growth_observation_id = f"growth_obs_{uuid.uuid4().hex}"
            next_sequence = current_base_sequence + 1
            canonical_water_state = water_state.model_copy(
                update={
                    "water_observation_id": observation_id,
                    "water_sequence": next_sequence,
                    "base_water_observation_id": current_base_id,
                    "base_water_sequence": current_base_sequence,
                    "previous_root_zone_depletion_mm": current_depletion,
                    "observed_at": observed_at_value,
                    "computed_at": (
                        utc_now()
                        if computed_at is None
                        else ensure_utc_datetime(
                            computed_at,
                            field_name="computed_at",
                        )
                    ),
                },
                deep=True,
            )

            reported_event_id: str | None = None
            applied_event_id: str | None = None
            already_accounted_for = False
            if reported_irrigation_event is not None:
                normalized_event = self._record_irrigation_event_unlocked(
                    state_id,
                    reported_irrigation_event,
                )
                reported_event_id = normalized_event.irrigation_event_id
                if reported_event_id is None:
                    raise ValueError("irrigation_event_id is required.")
                already_accounted_for = (
                    reported_event_id in self._water_by_irrigation_event_id
                )
                if already_accounted_for:
                    if effective_irrigation_mm_value != 0.0:
                        raise WaterUpdateConcurrencyConflictError(
                            state_id,
                            reported_event_id,
                        )
                else:
                    _validate_effective_matches_event(
                        state_id=state_id,
                        irrigation_event_id=reported_event_id,
                        event_amount_mm=normalized_event.amount_mm,
                        effective_irrigation_mm=effective_irrigation_mm_value,
                    )
                    applied_event_id = reported_event_id
            elif effective_irrigation_mm_value != 0.0:
                raise ValueError(
                    "effective_irrigation_mm must be 0 when no irrigation event "
                    "is reported."
                )

            canonical_water_state = canonical_water_state.model_copy(
                update={
                    "water_update_id": water_update_id_value,
                    "reported_irrigation_event_id": reported_event_id,
                    "applied_irrigation_event_id": applied_event_id,
                    "effective_irrigation_mm": effective_irrigation_mm_value,
                    "irrigation_event_already_accounted_for": (
                        reported_event_id is not None
                        and already_accounted_for
                        and effective_irrigation_mm_value == 0.0
                    ),
                },
                deep=True,
            )


            record.latest_growth_state = growth_state.model_copy(deep=True)
            self._latest_growth_observation_id[state_id] = growth_observation_id
            self._growth_by_observation_id[growth_observation_id] = (
                state_id,
                record.latest_growth_state.model_copy(deep=True),
            )
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
            self._latest_water_observation_id[state_id] = observation_id
            self._water_sequence[state_id] = next_sequence
            self._water_history.setdefault(state_id, []).append(
                record.latest_water_state.model_copy(deep=True)
            )
            self._water_by_update_id[(state_id, water_update_id_value)] = (
                request_fingerprint_value,
                record.latest_water_state.model_copy(deep=True),
            )
            self._water_by_observation_id[observation_id] = (
                state_id,
                record.latest_water_state.model_copy(deep=True),
            )
            self._water_growth_observation_id[observation_id] = growth_observation_id
            self._water_observation_metadata.setdefault(state_id, []).append(
                {
                    "water_observation_id": observation_id,
                    "growth_observation_id": growth_observation_id,
                    "water_sequence": next_sequence,
                    "base_water_observation_id": current_base_id,
                    "base_water_sequence": current_base_sequence,
                    "water_update_id": water_update_id_value,
                    "request_fingerprint": request_fingerprint_value,
                    "reported_irrigation_event_id": reported_event_id,
                    "irrigation_event_id": applied_event_id,
                    "effective_irrigation_mm": effective_irrigation_mm_value,
                }
            )
            if applied_event_id is not None:
                self._water_by_irrigation_event_id[applied_event_id] = (
                    record.latest_water_state.model_copy(deep=True)
                )
            return record.latest_water_state.model_copy(deep=True)

    def _validate_expected_water_baseline_unlocked(
        self,
        *,
        state_id: str,
        supplied_base_water_observation_id: str | None,
        supplied_base_water_sequence: int,
        current_base_water_observation_id: str | None,
        current_base_water_sequence: int,
    ) -> None:
        if supplied_base_water_sequence == 0 and supplied_base_water_observation_id is not None:
            raise WaterBaselineMismatchError(
                "base_water_observation_id must be null for base sequence 0.",
                state_id=state_id,
                supplied_base_water_observation_id=supplied_base_water_observation_id,
                supplied_base_water_sequence=supplied_base_water_sequence,
            )
        if supplied_base_water_sequence > 0 and supplied_base_water_observation_id is None:
            raise WaterBaselineMismatchError(
                "base_water_observation_id is required for non-zero base sequence.",
                state_id=state_id,
                supplied_base_water_sequence=supplied_base_water_sequence,
            )
        if supplied_base_water_observation_id is not None:
            existing = self._water_by_observation_id.get(supplied_base_water_observation_id)
            if existing is None:
                raise WaterBaselineMismatchError(
                    "Referenced base water observation was not found.",
                    state_id=state_id,
                    supplied_base_water_observation_id=supplied_base_water_observation_id,
                    supplied_base_water_sequence=supplied_base_water_sequence,
                )
            existing_state_id, existing_water = existing
            if existing_state_id != state_id:
                raise WaterBaselineMismatchError(
                    "Referenced base water observation belongs to another state.",
                    state_id=state_id,
                    supplied_base_water_observation_id=supplied_base_water_observation_id,
                    supplied_base_water_sequence=supplied_base_water_sequence,
                )
            if existing_water.water_sequence != supplied_base_water_sequence:
                raise WaterBaselineMismatchError(
                    "Referenced base water observation sequence does not match.",
                    state_id=state_id,
                    supplied_base_water_observation_id=supplied_base_water_observation_id,
                    supplied_base_water_sequence=supplied_base_water_sequence,
                )
        if (
            supplied_base_water_observation_id != current_base_water_observation_id
            or supplied_base_water_sequence != current_base_water_sequence
        ):
            raise StaleWaterBaselineError(
                state_id,
                supplied_base_water_observation_id=supplied_base_water_observation_id,
                supplied_base_water_sequence=supplied_base_water_sequence,
                current_base_water_observation_id=current_base_water_observation_id,
                current_base_water_sequence=current_base_water_sequence,
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

            disease_observation_id = self._latest_disease_observation_id.get(state_id)
            water_observation_id = self._latest_water_observation_id.get(state_id)
            if disease_observation_id is None:
                missing.append("latest_disease_state")
            if water_observation_id is None:
                missing.append("latest_water_state")
            if missing:
                raise IncompleteStateError(missing)
            growth_observation_id = self._water_growth_observation_id.get(
                water_observation_id,
            )
            if growth_observation_id is None:
                raise PersistenceIntegrityError(
                    "Canonical water observation is missing paired growth observation."
                )
            growth_entry = self._growth_by_observation_id.get(growth_observation_id)
            if growth_entry is None or growth_entry[0] != state_id:
                raise PersistenceIntegrityError(
                    "Paired growth observation was not found for this state."
                )
            fingerprint = snapshot_source_fingerprint(
                state_id=state_id,
                disease_observation_id=disease_observation_id,
                growth_observation_id=growth_observation_id,
                water_observation_id=water_observation_id,
            )
            existing = self._snapshot_by_fingerprint.get((state_id, fingerprint))
            if existing is not None:
                snapshot_id, current_state, _fingerprint = existing
                record.current_state = current_state.model_copy(deep=True)
                return UpdateTwinStateResponse(
                    state_id=state_id,
                    current_state=current_state.model_copy(deep=True),
                    state_history_count=len(record.state_history),
                    snapshot_id=snapshot_id,
                    snapshot_created=False,
                )

            disease = record.latest_disease_state
            growth = growth_entry[1]
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
            snapshot_id = f"snapshot_{uuid.uuid4().hex}"

            history_event = HistoryEvent(
                timestamp=now,
                growth_stage=current_state.growth_stage,
                predicted_label=current_state.predicted_label,
                root_zone_depletion=current_state.root_zone_depletion,
                stress_band=current_state.stress_band,
            )
            record.state_history.append(history_event)
            record.state_history = record.state_history[-self._max_history :]
            self._snapshot_by_fingerprint[(state_id, fingerprint)] = (
                snapshot_id,
                record.current_state.model_copy(deep=True),
                fingerprint,
            )
            self._snapshot_sources[snapshot_id] = SnapshotSourceIdentity(
                state_id=state_id,
                disease_observation_id=disease_observation_id,
                growth_observation_id=growth_observation_id,
                water_observation_id=water_observation_id,
            )

            return UpdateTwinStateResponse(
                state_id=state_id,
                current_state=record.current_state.model_copy(deep=True),
                state_history_count=len(record.state_history),
                snapshot_id=snapshot_id,
                snapshot_created=True,
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

    def get_water_state_for_update(
        self,
        state_id: str,
        water_update_id: str,
        request_fingerprint: str,
    ) -> WaterStateResponse | None:
        with self._lock:
            self._get_record_unlocked(state_id)
            water_update_id_value = _validate_water_update_id(water_update_id)
            request_fingerprint_value = _validate_request_fingerprint(
                request_fingerprint,
            )
            existing = self._water_by_update_id.get(
                (state_id, water_update_id_value),
            )
            if existing is None:
                return None
            existing_fingerprint, water_state = existing
            if existing_fingerprint != request_fingerprint_value:
                raise WaterUpdatePayloadConflictError(
                    state_id,
                    water_update_id_value,
                    existing_fingerprint=existing_fingerprint,
                    request_fingerprint=request_fingerprint_value,
                )
            return water_state.model_copy(deep=True)

    def get_daily_advancement(
        self,
        state_id: str,
        advancement_id: str,
        request_fingerprint: str,
    ) -> AdvanceOneDayResponse | None:
        with self._lock:
            self._get_record_unlocked(state_id)
            advancement_id_value = _validate_non_empty_bounded_string(
                advancement_id,
                field_name="advancement_id",
                max_length=120,
            )
            request_fingerprint_value = _validate_request_fingerprint(
                request_fingerprint,
            )
            existing = self._daily_advancements.get(
                (state_id, advancement_id_value),
            )
            if existing is None:
                return None
            existing_fingerprint, _target_date, _record_id, response = existing
            if existing_fingerprint != request_fingerprint_value:
                raise DailyAdvancementPayloadConflictError(
                    state_id,
                    advancement_id_value,
                    existing_fingerprint=existing_fingerprint,
                    request_fingerprint=request_fingerprint_value,
                )
            return self._daily_retry_response(response)

    def cache_daily_advancement(
        self,
        *,
        state_id: str,
        advancement_id: str,
        request_fingerprint: str,
        target_date: date,
        growth_state: GrowthStageResponse,
        water_state: WaterStateResponse,
        water_update_id: str,
        weather_payload: dict[str, object],
        expected_base_water_observation_id: str,
        expected_base_water_sequence: int,
        calculated_previous_root_zone_depletion_mm: float,
        reported_irrigation_event: LastIrrigationEvent | None,
        effective_irrigation_mm: float,
        computed_at: datetime,
    ) -> AdvanceOneDayResponse:
        with self._lock:
            record = self._get_record_unlocked(state_id)
            advancement_id_value = _validate_non_empty_bounded_string(
                advancement_id,
                field_name="advancement_id",
                max_length=120,
            )
            request_fingerprint_value = _validate_request_fingerprint(
                request_fingerprint,
            )
            existing = self._daily_advancements.get(
                (state_id, advancement_id_value),
            )
            if existing is not None:
                existing_fingerprint, _target_date, _record_id, response = existing
                if existing_fingerprint != request_fingerprint_value:
                    raise DailyAdvancementPayloadConflictError(
                        state_id,
                        advancement_id_value,
                        existing_fingerprint=existing_fingerprint,
                        request_fingerprint=request_fingerprint_value,
                    )
                return self._daily_retry_response(response)

            existing_target = self._daily_advancement_by_target_date.get(
                (state_id, target_date),
            )
            if existing_target is not None:
                raise DailyAdvancementTargetConflictError(
                    state_id,
                    target_date=target_date,
                    existing_advancement_id=existing_target,
                )

            current_baseline = self.get_canonical_water_baseline(state_id)
            if current_baseline is None:
                raise DailyAdvancementBaselineRequiredError(state_id)
            expected_date = current_baseline.current_date + timedelta(days=1)
            if target_date != expected_date:
                raise DailyAdvancementDateConflictError(
                    state_id,
                    requested_target_date=target_date,
                    expected_target_date=expected_date,
                    canonical_base_date=current_baseline.current_date,
                    base_water_observation_id=current_baseline.water_observation_id,
                    base_water_sequence=current_baseline.water_sequence,
                )
            self._validate_expected_water_baseline_unlocked(
                state_id=state_id,
                supplied_base_water_observation_id=expected_base_water_observation_id,
                supplied_base_water_sequence=_validate_base_sequence(
                    expected_base_water_sequence,
                    field_name="expected_base_water_sequence",
                ),
                current_base_water_observation_id=(
                    current_baseline.water_observation_id
                ),
                current_base_water_sequence=current_baseline.water_sequence,
            )
            if not _depletion_matches(
                calculated_previous_root_zone_depletion_mm,
                current_baseline.root_zone_depletion_mm,
            ):
                raise WaterBaselineMismatchError(
                    "Calculated previous_root_zone_depletion_mm does not match "
                    "the canonical water baseline.",
                    state_id=state_id,
                    supplied_previous_root_zone_depletion_mm=(
                        calculated_previous_root_zone_depletion_mm
                    ),
                    current_previous_root_zone_depletion_mm=(
                        current_baseline.root_zone_depletion_mm
                    ),
                )
            if record.latest_disease_state is None:
                raise DailyAdvancementDiseaseRequiredError(state_id)
            disease_observation_id = self._latest_disease_observation_id.get(state_id)
            if disease_observation_id is None:
                raise DailyAdvancementDiseaseRequiredError(state_id)

            effective_irrigation_mm_value = _validate_effective_irrigation_mm(
                effective_irrigation_mm,
            )
            observed_at_value = ensure_utc_datetime(
                water_state.observed_at,
                field_name="observed_at",
            )
            if observed_at_value.date() != target_date:
                raise WaterBaselineMismatchError(
                    "Daily advancement observed_at must match target_date.",
                    state_id=state_id,
                    observed_at=observed_at_value.isoformat(),
                    target_date=target_date.isoformat(),
                )
            if observed_at_value <= current_baseline.observed_at:
                raise OutOfOrderWaterObservationError(
                    state_id,
                    supplied_observed_at=observed_at_value,
                    current_observed_at=current_baseline.observed_at,
                )

            reported_event_id: str | None = None
            applied_event_id: str | None = None
            already_accounted_for = False
            normalized_event: LastIrrigationEvent | None = None
            if reported_irrigation_event is not None:
                normalized_event = self._validate_irrigation_event_unlocked(
                    state_id,
                    reported_irrigation_event,
                )
                reported_event_id = normalized_event.irrigation_event_id
                if reported_event_id is None:
                    raise ValueError("irrigation_event_id is required.")
                already_accounted_for = (
                    reported_event_id in self._water_by_irrigation_event_id
                )
                if already_accounted_for:
                    if effective_irrigation_mm_value != 0.0:
                        raise WaterUpdateConcurrencyConflictError(
                            state_id,
                            reported_event_id,
                        )
                else:
                    _validate_effective_matches_event(
                        state_id=state_id,
                        irrigation_event_id=reported_event_id,
                        event_amount_mm=normalized_event.amount_mm,
                        effective_irrigation_mm=effective_irrigation_mm_value,
                    )
                    applied_event_id = reported_event_id
            elif effective_irrigation_mm_value != 0.0:
                raise ValueError(
                    "effective_irrigation_mm must be 0 when no irrigation event "
                    "is reported."
                )

            computed_at_value = ensure_utc_datetime(
                computed_at,
                field_name="computed_at",
            )
            water_update_id_value = _validate_water_update_id(water_update_id)
            observation_id = f"water_obs_{uuid.uuid4().hex}"
            growth_observation_id = f"growth_obs_{uuid.uuid4().hex}"
            next_sequence = current_baseline.water_sequence + 1
            canonical_water_state = water_state.model_copy(
                update={
                    "water_observation_id": observation_id,
                    "water_sequence": next_sequence,
                    "base_water_observation_id": current_baseline.water_observation_id,
                    "base_water_sequence": current_baseline.water_sequence,
                    "previous_root_zone_depletion_mm": (
                        current_baseline.root_zone_depletion_mm
                    ),
                    "water_update_id": water_update_id_value,
                    "reported_irrigation_event_id": reported_event_id,
                    "applied_irrigation_event_id": applied_event_id,
                    "effective_irrigation_mm": effective_irrigation_mm_value,
                    "irrigation_event_already_accounted_for": (
                        reported_event_id is not None
                        and already_accounted_for
                        and effective_irrigation_mm_value == 0.0
                    ),
                    "observed_at": observed_at_value,
                    "computed_at": computed_at_value,
                },
                deep=True,
            )

            rollback_snapshot = self._daily_advancement_rollback_snapshot_unlocked(
                state_id,
                record,
            )
            if normalized_event is not None and reported_event_id is not None:
                self._irrigation_events.setdefault(
                    reported_event_id,
                    (state_id, normalized_event.model_copy(deep=True)),
                )

            record.latest_growth_state = growth_state.model_copy(deep=True)
            self._latest_growth_observation_id[state_id] = growth_observation_id
            self._growth_by_observation_id[growth_observation_id] = (
                state_id,
                record.latest_growth_state.model_copy(deep=True),
            )
            self._growth_history.setdefault(state_id, []).append(
                record.latest_growth_state.model_copy(deep=True)
            )
            self._growth_observation_metadata.setdefault(state_id, []).append(
                (
                    observed_at_value,
                    canonical_water_state.observation_time_basis,
                    computed_at_value,
                )
            )

            record.latest_water_state = canonical_water_state.model_copy(deep=True)
            self._latest_water_observation_id[state_id] = observation_id
            self._water_sequence[state_id] = next_sequence
            self._water_history.setdefault(state_id, []).append(
                record.latest_water_state.model_copy(deep=True)
            )
            self._water_by_update_id[(state_id, water_update_id_value)] = (
                request_fingerprint_value,
                record.latest_water_state.model_copy(deep=True),
            )
            self._water_by_observation_id[observation_id] = (
                state_id,
                record.latest_water_state.model_copy(deep=True),
            )
            self._water_growth_observation_id[observation_id] = growth_observation_id
            self._water_observation_metadata.setdefault(state_id, []).append(
                {
                    "water_observation_id": observation_id,
                    "growth_observation_id": growth_observation_id,
                    "water_sequence": next_sequence,
                    "base_water_observation_id": current_baseline.water_observation_id,
                    "base_water_sequence": current_baseline.water_sequence,
                    "water_update_id": water_update_id_value,
                    "request_fingerprint": request_fingerprint_value,
                    "reported_irrigation_event_id": reported_event_id,
                    "irrigation_event_id": applied_event_id,
                    "effective_irrigation_mm": effective_irrigation_mm_value,
                    "daily_advancement_id": advancement_id_value,
                }
            )
            if applied_event_id is not None:
                self._water_by_irrigation_event_id[applied_event_id] = (
                    record.latest_water_state.model_copy(deep=True)
                )

            try:
                twin_state = self._create_or_reuse_snapshot_unlocked(
                    state_id=state_id,
                    disease_observation_id=disease_observation_id,
                    growth_observation_id=growth_observation_id,
                    water_observation_id=observation_id,
                )
            except Exception:
                self._restore_daily_advancement_rollback_snapshot_unlocked(
                    record,
                    rollback_snapshot,
                )
                raise
            try:
                response = AdvanceOneDayResponse(
                    state_id=state_id,
                    advancement_id=advancement_id_value,
                    target_date=target_date,
                    advancement_created=True,
                    water_state=record.latest_water_state.model_copy(deep=True),
                    twin_state=twin_state,
                )
                self._daily_advancements[(state_id, advancement_id_value)] = (
                    request_fingerprint_value,
                    target_date,
                    f"daily_advancement_{uuid.uuid4().hex}",
                    response.model_copy(deep=True),
                )
                self._daily_advancement_by_target_date[(state_id, target_date)] = (
                    advancement_id_value
                )
                return response.model_copy(deep=True)
            except Exception:
                self._restore_daily_advancement_rollback_snapshot_unlocked(
                    record,
                    rollback_snapshot,
                )
                raise

    def get_daily_advancement_id_for_target_date(
        self,
        state_id: str,
        target_date: date,
    ) -> str | None:
        with self._lock:
            self._get_record_unlocked(state_id)
            return self._daily_advancement_by_target_date.get(
                (state_id, target_date),
            )

    def _daily_retry_response(
        self,
        response: AdvanceOneDayResponse,
    ) -> AdvanceOneDayResponse:
        return response.model_copy(
            update={
                "advancement_created": False,
                "twin_state": response.twin_state.model_copy(
                    update={"snapshot_created": False},
                    deep=True,
                ),
            },
            deep=True,
        )

    def _create_or_reuse_snapshot_unlocked(
        self,
        *,
        state_id: str,
        disease_observation_id: str,
        growth_observation_id: str,
        water_observation_id: str,
    ) -> UpdateTwinStateResponse:
        record = self._get_record_unlocked(state_id)
        disease_entry = self._disease_by_observation_id.get(disease_observation_id)
        growth_entry = self._growth_by_observation_id.get(growth_observation_id)
        water_entry = self._water_by_observation_id.get(water_observation_id)
        if (
            disease_entry is None
            or growth_entry is None
            or water_entry is None
            or disease_entry[0] != state_id
            or growth_entry[0] != state_id
            or water_entry[0] != state_id
        ):
            raise PersistenceIntegrityError(
                "Daily advancement source observations were not found."
            )
        fingerprint = snapshot_source_fingerprint(
            state_id=state_id,
            disease_observation_id=disease_observation_id,
            growth_observation_id=growth_observation_id,
            water_observation_id=water_observation_id,
        )
        existing = self._snapshot_by_fingerprint.get((state_id, fingerprint))
        if existing is not None:
            snapshot_id, current_state, _fingerprint = existing
            record.current_state = current_state.model_copy(deep=True)
            return UpdateTwinStateResponse(
                state_id=state_id,
                current_state=current_state.model_copy(deep=True),
                state_history_count=len(record.state_history),
                snapshot_id=snapshot_id,
                snapshot_created=False,
            )

        disease = disease_entry[1]
        growth = growth_entry[1]
        water = water_entry[1]
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
        snapshot_id = f"snapshot_{uuid.uuid4().hex}"
        history_event = HistoryEvent(
            timestamp=now,
            growth_stage=current_state.growth_stage,
            predicted_label=current_state.predicted_label,
            root_zone_depletion=current_state.root_zone_depletion,
            stress_band=current_state.stress_band,
        )
        record.state_history.append(history_event)
        record.state_history = record.state_history[-self._max_history :]
        self._snapshot_by_fingerprint[(state_id, fingerprint)] = (
            snapshot_id,
            record.current_state.model_copy(deep=True),
            fingerprint,
        )
        self._snapshot_sources[snapshot_id] = SnapshotSourceIdentity(
            state_id=state_id,
            disease_observation_id=disease_observation_id,
            growth_observation_id=growth_observation_id,
            water_observation_id=water_observation_id,
        )
        return UpdateTwinStateResponse(
            state_id=state_id,
            current_state=record.current_state.model_copy(deep=True),
            state_history_count=len(record.state_history),
            snapshot_id=snapshot_id,
            snapshot_created=True,
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


state_store = InMemoryTwinStateStore()
