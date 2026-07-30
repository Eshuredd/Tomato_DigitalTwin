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


def get_history_response(self, state_id: str) -> SessionHistoryResponse:
        with self._lock:
            record = self._get_record_unlocked(state_id)
            history = [event.model_copy(deep=True) for event in record.state_history]
            return SessionHistoryResponse(state_id=state_id, history=history)


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


__all__ = [
    "update_current_state",
    "get_current_state",
    "get_history_response",
    "_create_or_reuse_snapshot_unlocked",
]
