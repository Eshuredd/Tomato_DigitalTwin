from __future__ import annotations

from app.store.in_memory_advancement import (
    _daily_advancement_rollback_snapshot_unlocked,
    _daily_retry_response,
    _restore_daily_advancement_rollback_snapshot_unlocked,
    cache_daily_advancement,
    get_daily_advancement,
    get_daily_advancement_id_for_target_date,
)
from app.store.in_memory_decisions import (
    _validate_related_recommendation_unlocked,
    cache_recommendation,
    cache_simulation,
    get_latest_recommendation,
    get_latest_simulation,
)
from app.store.in_memory_observations import cache_disease_state, cache_growth_state
from app.store.in_memory_records import (
    create_crop_cycle_for_plot,
    create_farm,
    create_plot,
    get_farm,
    get_plot,
    list_actual_actions,
    list_farms,
    list_plots,
    record_actual_action,
)
from app.store.in_memory_sessions import (
    _get_record_unlocked,
    clear,
    count,
    create_session,
    get_record,
    get_session_state_response,
)
from app.store.in_memory_snapshots import (
    _create_or_reuse_snapshot_unlocked,
    get_current_state,
    get_history_response,
    update_current_state,
)
from app.store.in_memory_state import InMemoryStoreState
from app.store.in_memory_water import (
    _record_irrigation_event_unlocked,
    _validate_expected_water_baseline_unlocked,
    _validate_irrigation_event_unlocked,
    cache_water_state,
    cache_water_update,
    get_canonical_water_baseline,
    get_water_state_for_update,
    has_applied_irrigation_event,
)


class InMemoryTwinStateStore:
    def __init__(self, max_history: int = 10) -> None:
        state = InMemoryStoreState(max_history=max_history)
        self._state = state
        self._sessions = state.sessions
        self._farms = state.farms
        self._plots = state.plots
        self._actual_actions = state.actual_actions
        self._irrigation_events = state.irrigation_events
        self._water_by_irrigation_event_id = state.water_by_irrigation_event_id
        self._water_by_update_id = state.water_by_update_id
        self._water_by_observation_id = state.water_by_observation_id
        self._water_growth_observation_id = state.water_growth_observation_id
        self._latest_water_observation_id = state.latest_water_observation_id
        self._water_sequence = state.water_sequence
        self._latest_disease_observation_id = state.latest_disease_observation_id
        self._latest_growth_observation_id = state.latest_growth_observation_id
        self._disease_by_observation_id = state.disease_by_observation_id
        self._growth_by_observation_id = state.growth_by_observation_id
        self._snapshot_by_fingerprint = state.snapshot_by_fingerprint
        self._snapshot_sources = state.snapshot_sources
        self._daily_advancements = state.daily_advancements
        self._daily_advancement_by_target_date = state.daily_advancement_by_target_date
        self._recommendations_by_id = state.recommendations_by_id
        self._disease_history = state.disease_history
        self._growth_history = state.growth_history
        self._growth_observation_metadata = state.growth_observation_metadata
        self._water_history = state.water_history
        self._water_observation_metadata = state.water_observation_metadata
        self._max_history = state.max_history
        self._lock = state.lock


InMemoryTwinStateStore._get_record_unlocked = _get_record_unlocked
InMemoryTwinStateStore.create_session = create_session
InMemoryTwinStateStore.get_record = get_record
InMemoryTwinStateStore.get_session_state_response = get_session_state_response
InMemoryTwinStateStore.clear = clear
InMemoryTwinStateStore.count = count
InMemoryTwinStateStore.cache_disease_state = cache_disease_state
InMemoryTwinStateStore.cache_growth_state = cache_growth_state
InMemoryTwinStateStore._validate_irrigation_event_unlocked = _validate_irrigation_event_unlocked
InMemoryTwinStateStore._record_irrigation_event_unlocked = _record_irrigation_event_unlocked
InMemoryTwinStateStore.get_canonical_water_baseline = get_canonical_water_baseline
InMemoryTwinStateStore.cache_water_state = cache_water_state
InMemoryTwinStateStore.cache_water_update = cache_water_update
InMemoryTwinStateStore._validate_expected_water_baseline_unlocked = _validate_expected_water_baseline_unlocked
InMemoryTwinStateStore.has_applied_irrigation_event = has_applied_irrigation_event
InMemoryTwinStateStore.get_water_state_for_update = get_water_state_for_update
InMemoryTwinStateStore._daily_advancement_rollback_snapshot_unlocked = _daily_advancement_rollback_snapshot_unlocked
InMemoryTwinStateStore._restore_daily_advancement_rollback_snapshot_unlocked = _restore_daily_advancement_rollback_snapshot_unlocked
InMemoryTwinStateStore.get_daily_advancement = get_daily_advancement
InMemoryTwinStateStore.cache_daily_advancement = cache_daily_advancement
InMemoryTwinStateStore.get_daily_advancement_id_for_target_date = get_daily_advancement_id_for_target_date
InMemoryTwinStateStore._daily_retry_response = _daily_retry_response
InMemoryTwinStateStore.update_current_state = update_current_state
InMemoryTwinStateStore.get_current_state = get_current_state
InMemoryTwinStateStore.get_history_response = get_history_response
InMemoryTwinStateStore._create_or_reuse_snapshot_unlocked = _create_or_reuse_snapshot_unlocked
InMemoryTwinStateStore._validate_related_recommendation_unlocked = _validate_related_recommendation_unlocked
InMemoryTwinStateStore.cache_simulation = cache_simulation
InMemoryTwinStateStore.cache_recommendation = cache_recommendation
InMemoryTwinStateStore.get_latest_simulation = get_latest_simulation
InMemoryTwinStateStore.get_latest_recommendation = get_latest_recommendation
InMemoryTwinStateStore.create_farm = create_farm
InMemoryTwinStateStore.list_farms = list_farms
InMemoryTwinStateStore.get_farm = get_farm
InMemoryTwinStateStore.create_plot = create_plot
InMemoryTwinStateStore.list_plots = list_plots
InMemoryTwinStateStore.get_plot = get_plot
InMemoryTwinStateStore.create_crop_cycle_for_plot = create_crop_cycle_for_plot
InMemoryTwinStateStore.record_actual_action = record_actual_action
InMemoryTwinStateStore.list_actual_actions = list_actual_actions

state_store = InMemoryTwinStateStore()

__all__ = ["InMemoryTwinStateStore", "state_store"]
