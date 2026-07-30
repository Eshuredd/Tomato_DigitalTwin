from __future__ import annotations

from app.persistence.database import (
    SessionFactory,
    create_database_engine,
    create_session_factory,
    create_tables,
)
from app.persistence.store.advancement import (
    _daily_advancement_for_id,
    _daily_advancement_for_target_date,
    _daily_response_from_row_or_raise,
    _handle_daily_advancement_integrity_error,
    cache_daily_advancement,
    get_daily_advancement,
    get_daily_advancement_id_for_target_date,
)
from app.persistence.store.common import (
    _as_utc,
    _canonical_water_row,
    _cycle_location,
    _dump,
    _farm_response,
    _get_cycle_or_raise,
    _history_events,
    _latest_payload,
    _latest_row,
    _latest_snapshot,
    _latest_valid_recommendation_payload,
    _latest_valid_recommendation_row,
    _latest_valid_simulation_id,
    _latest_valid_simulation_payload,
    _latest_valid_simulation_row,
    _legacy_water_state_fingerprint,
    _new_id,
    _payload_as,
    _plot_response,
    _required_elevation,
    _snapshot_count,
    _snapshot_for_source_fingerprint,
    _snapshot_update_response,
    _timestamp_or_now,
    _validate_base_sequence,
    _validate_effective_irrigation_mm,
    _validate_effective_matches_event,
    _validate_non_empty_bounded_string,
    _validate_request_fingerprint,
    _validate_water_update_id,
    _water_state_from_row,
)
from app.persistence.store.decisions import (
    _validate_related_recommendation,
    cache_recommendation,
    cache_simulation,
    get_latest_recommendation,
    get_latest_simulation,
)
from app.persistence.store.observations import cache_disease_state, cache_growth_state
from app.persistence.store.records import list_actual_actions, record_actual_action
from app.persistence.store.sessions import (
    clear,
    count,
    create_crop_cycle_for_plot,
    create_farm,
    create_plot,
    create_schema,
    create_session,
    get_farm,
    get_plot,
    get_record,
    get_session_state_response,
    list_farms,
    list_plots,
)
from app.persistence.store.snapshots import (
    _create_or_reuse_snapshot_for_rows,
    get_current_state,
    get_history_response,
    update_current_state,
)
from app.persistence.store.water import (
    _existing_water_after_irrigation_integrity_error,
    _get_or_create_irrigation_event,
    _handle_water_update_integrity_error,
    _validate_expected_water_baseline,
    _validate_irrigation_event_row,
    _water_for_irrigation_event,
    _water_for_update,
    _water_state_for_update_row_or_raise,
    cache_water_state,
    cache_water_update,
    get_canonical_water_baseline,
    get_water_state_for_update,
    has_applied_irrigation_event,
)


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

SQLAlchemyTwinStateStore._new_id = staticmethod(_new_id)
SQLAlchemyTwinStateStore._validate_water_update_id = staticmethod(_validate_water_update_id)
SQLAlchemyTwinStateStore._validate_request_fingerprint = staticmethod(_validate_request_fingerprint)
SQLAlchemyTwinStateStore._validate_non_empty_bounded_string = staticmethod(_validate_non_empty_bounded_string)
SQLAlchemyTwinStateStore._validate_effective_irrigation_mm = staticmethod(_validate_effective_irrigation_mm)
SQLAlchemyTwinStateStore._validate_base_sequence = staticmethod(_validate_base_sequence)
SQLAlchemyTwinStateStore._validate_effective_matches_event = staticmethod(_validate_effective_matches_event)
SQLAlchemyTwinStateStore._legacy_water_state_fingerprint = staticmethod(_legacy_water_state_fingerprint)
SQLAlchemyTwinStateStore._dump = staticmethod(_dump)
SQLAlchemyTwinStateStore._as_utc = staticmethod(_as_utc)
SQLAlchemyTwinStateStore._timestamp_or_now = staticmethod(_timestamp_or_now)
SQLAlchemyTwinStateStore._required_elevation = staticmethod(_required_elevation)
SQLAlchemyTwinStateStore._payload_as = staticmethod(_payload_as)
SQLAlchemyTwinStateStore._water_state_from_row = _water_state_from_row
SQLAlchemyTwinStateStore._cycle_location = staticmethod(_cycle_location)
SQLAlchemyTwinStateStore._get_cycle_or_raise = _get_cycle_or_raise
SQLAlchemyTwinStateStore._latest_row = _latest_row
SQLAlchemyTwinStateStore._latest_payload = _latest_payload
SQLAlchemyTwinStateStore._canonical_water_row = _canonical_water_row
SQLAlchemyTwinStateStore._latest_snapshot = _latest_snapshot
SQLAlchemyTwinStateStore._snapshot_for_source_fingerprint = _snapshot_for_source_fingerprint
SQLAlchemyTwinStateStore._snapshot_update_response = _snapshot_update_response
SQLAlchemyTwinStateStore._latest_valid_simulation_row = _latest_valid_simulation_row
SQLAlchemyTwinStateStore._latest_valid_simulation_id = _latest_valid_simulation_id
SQLAlchemyTwinStateStore._latest_valid_simulation_payload = _latest_valid_simulation_payload
SQLAlchemyTwinStateStore._latest_valid_recommendation_row = _latest_valid_recommendation_row
SQLAlchemyTwinStateStore._latest_valid_recommendation_payload = _latest_valid_recommendation_payload
SQLAlchemyTwinStateStore._history_events = _history_events
SQLAlchemyTwinStateStore._snapshot_count = _snapshot_count
SQLAlchemyTwinStateStore._farm_response = staticmethod(_farm_response)
SQLAlchemyTwinStateStore._plot_response = staticmethod(_plot_response)
SQLAlchemyTwinStateStore.create_schema = create_schema
SQLAlchemyTwinStateStore.create_session = create_session
SQLAlchemyTwinStateStore.get_record = get_record
SQLAlchemyTwinStateStore.get_session_state_response = get_session_state_response
SQLAlchemyTwinStateStore.clear = clear
SQLAlchemyTwinStateStore.count = count
SQLAlchemyTwinStateStore.create_farm = create_farm
SQLAlchemyTwinStateStore.list_farms = list_farms
SQLAlchemyTwinStateStore.get_farm = get_farm
SQLAlchemyTwinStateStore.create_plot = create_plot
SQLAlchemyTwinStateStore.list_plots = list_plots
SQLAlchemyTwinStateStore.get_plot = get_plot
SQLAlchemyTwinStateStore.create_crop_cycle_for_plot = create_crop_cycle_for_plot
SQLAlchemyTwinStateStore.cache_disease_state = cache_disease_state
SQLAlchemyTwinStateStore.cache_growth_state = cache_growth_state
SQLAlchemyTwinStateStore.get_canonical_water_baseline = get_canonical_water_baseline
SQLAlchemyTwinStateStore.cache_water_state = cache_water_state
SQLAlchemyTwinStateStore.cache_water_update = cache_water_update
SQLAlchemyTwinStateStore.has_applied_irrigation_event = has_applied_irrigation_event
SQLAlchemyTwinStateStore.get_water_state_for_update = get_water_state_for_update
SQLAlchemyTwinStateStore._validate_irrigation_event_row = _validate_irrigation_event_row
SQLAlchemyTwinStateStore._get_or_create_irrigation_event = _get_or_create_irrigation_event
SQLAlchemyTwinStateStore._water_for_irrigation_event = _water_for_irrigation_event
SQLAlchemyTwinStateStore._water_for_update = _water_for_update
SQLAlchemyTwinStateStore._water_state_for_update_row_or_raise = _water_state_for_update_row_or_raise
SQLAlchemyTwinStateStore._validate_expected_water_baseline = _validate_expected_water_baseline
SQLAlchemyTwinStateStore._handle_water_update_integrity_error = _handle_water_update_integrity_error
SQLAlchemyTwinStateStore._existing_water_after_irrigation_integrity_error = _existing_water_after_irrigation_integrity_error
SQLAlchemyTwinStateStore.get_daily_advancement = get_daily_advancement
SQLAlchemyTwinStateStore.get_daily_advancement_id_for_target_date = get_daily_advancement_id_for_target_date
SQLAlchemyTwinStateStore.cache_daily_advancement = cache_daily_advancement
SQLAlchemyTwinStateStore._daily_advancement_for_id = _daily_advancement_for_id
SQLAlchemyTwinStateStore._daily_advancement_for_target_date = _daily_advancement_for_target_date
SQLAlchemyTwinStateStore._daily_response_from_row_or_raise = _daily_response_from_row_or_raise
SQLAlchemyTwinStateStore._handle_daily_advancement_integrity_error = _handle_daily_advancement_integrity_error
SQLAlchemyTwinStateStore.update_current_state = update_current_state
SQLAlchemyTwinStateStore.get_current_state = get_current_state
SQLAlchemyTwinStateStore.get_history_response = get_history_response
SQLAlchemyTwinStateStore._create_or_reuse_snapshot_for_rows = _create_or_reuse_snapshot_for_rows
SQLAlchemyTwinStateStore.cache_simulation = cache_simulation
SQLAlchemyTwinStateStore.cache_recommendation = cache_recommendation
SQLAlchemyTwinStateStore.get_latest_simulation = get_latest_simulation
SQLAlchemyTwinStateStore.get_latest_recommendation = get_latest_recommendation
SQLAlchemyTwinStateStore._validate_related_recommendation = _validate_related_recommendation
SQLAlchemyTwinStateStore.record_actual_action = record_actual_action
SQLAlchemyTwinStateStore.list_actual_actions = list_actual_actions

__all__ = ["SQLAlchemyTwinStateStore"]
