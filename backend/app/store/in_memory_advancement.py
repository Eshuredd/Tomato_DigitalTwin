from __future__ import annotations

from copy import deepcopy
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
        for compatibility_name, state_name in (
            ("_irrigation_events", "irrigation_events"),
            ("_water_by_irrigation_event_id", "water_by_irrigation_event_id"),
            ("_water_by_update_id", "water_by_update_id"),
            ("_water_by_observation_id", "water_by_observation_id"),
            ("_water_growth_observation_id", "water_growth_observation_id"),
            ("_latest_water_observation_id", "latest_water_observation_id"),
            ("_water_sequence", "water_sequence"),
            ("_latest_growth_observation_id", "latest_growth_observation_id"),
            ("_growth_by_observation_id", "growth_by_observation_id"),
            ("_snapshot_by_fingerprint", "snapshot_by_fingerprint"),
            ("_snapshot_sources", "snapshot_sources"),
            ("_daily_advancements", "daily_advancements"),
            ("_daily_advancement_by_target_date", "daily_advancement_by_target_date"),
            ("_growth_history", "growth_history"),
            ("_growth_observation_metadata", "growth_observation_metadata"),
            ("_water_history", "water_history"),
            ("_water_observation_metadata", "water_observation_metadata"),
        ):
            target = getattr(self._state, state_name)
            _restore_mapping_contents(target, snapshot[compatibility_name])
            setattr(self, compatibility_name, target)


def _restore_mapping_contents(target: dict[object, object], source: object) -> None:
    if not isinstance(source, dict):
        raise TypeError("Rollback snapshot mapping entry must be a dictionary.")
    target.clear()
    target.update({key: deepcopy(value) for key, value in source.items()})


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


__all__ = [
    "_daily_advancement_rollback_snapshot_unlocked",
    "_restore_daily_advancement_rollback_snapshot_unlocked",
    "get_daily_advancement",
    "cache_daily_advancement",
    "get_daily_advancement_id_for_target_date",
    "_daily_retry_response",
]
