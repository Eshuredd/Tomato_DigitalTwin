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


__all__ = [
    "_validate_irrigation_event_unlocked",
    "_record_irrigation_event_unlocked",
    "get_canonical_water_baseline",
    "cache_water_state",
    "cache_water_update",
    "_validate_expected_water_baseline_unlocked",
    "has_applied_irrigation_event",
    "get_water_state_for_update",
]
