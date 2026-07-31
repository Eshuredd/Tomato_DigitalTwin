from __future__ import annotations

from collections.abc import MutableMapping
from dataclasses import dataclass
from datetime import date
from typing import Any


PENDING_WATER_CURRENT_DATE_KEY = "pending_water_current_date"
WATER_CURRENT_DATE_KEY = "water_current_date"
DAILY_ADVANCEMENT_NOTICE_KEY = "daily_advancement_notice"
DAILY_ADVANCEMENT_REUSED_NOTICE = (
    "This daily advancement was already completed; reused the original result."
)
DAILY_ADVANCEMENT_CATCH_UP_NOTICE = (
    "The advancement already existed. CropTwin refreshed the local workflow to "
    "the latest canonical state."
)
DAILY_ADVANCEMENT_TWIN_REFRESH_FAILED_NOTICE = (
    "The canonical water state was updated, but CropTwin could not refresh the "
    "current twin. Retry 'Update digital twin' before running simulations."
)


@dataclass(frozen=True)
class DailyAdvancementUITransition:
    replace_canonical_water: bool
    replace_twin_from_response: bool
    refresh_authoritative_twin: bool
    invalidate_current_twin: bool
    clear_downstream: bool
    set_pending_date: bool
    retain_historical_response: bool
    transition_kind: str
    notice: str | None


def apply_pending_water_current_date(
    state: MutableMapping[str, Any],
    *,
    pending_key: str = PENDING_WATER_CURRENT_DATE_KEY,
    current_key: str = WATER_CURRENT_DATE_KEY,
) -> date | None:
    pending = state.get(pending_key)
    state[pending_key] = None
    if isinstance(pending, date):
        state[current_key] = pending
        return pending
    return None


def set_flash_notice(
    state: MutableMapping[str, Any],
    message: str,
    *,
    key: str = DAILY_ADVANCEMENT_NOTICE_KEY,
) -> None:
    state[key] = message


def pop_flash_notice(
    state: MutableMapping[str, Any],
    *,
    key: str = DAILY_ADVANCEMENT_NOTICE_KEY,
) -> str | None:
    value = state.get(key)
    state[key] = None
    return value if isinstance(value, str) and value.strip() else None


def should_replace_local_canonical_water(
    *,
    current_sequence: int | None,
    returned_sequence: object,
) -> bool:
    current = _coerce_nonnegative_int(current_sequence, default=0)
    returned = _coerce_nonnegative_int(returned_sequence, default=None)
    if returned is None:
        return False
    return returned >= current


def daily_advancement_ui_transition(
    *,
    advancement_created: object,
    current_sequence: object,
    returned_sequence: object,
    current_snapshot_id: object = None,
    returned_snapshot_id: object = None,
) -> DailyAdvancementUITransition:
    if advancement_created is True:
        return DailyAdvancementUITransition(
            replace_canonical_water=True,
            replace_twin_from_response=True,
            refresh_authoritative_twin=False,
            invalidate_current_twin=False,
            clear_downstream=True,
            set_pending_date=True,
            retain_historical_response=False,
            transition_kind="new_advancement",
            notice=None,
        )

    retry = advancement_created is False
    current = _coerce_nonnegative_int(current_sequence, default=0)
    returned = _coerce_nonnegative_int(returned_sequence, default=None)
    if not retry:
        return DailyAdvancementUITransition(
            replace_canonical_water=False,
            replace_twin_from_response=False,
            refresh_authoritative_twin=False,
            invalidate_current_twin=False,
            clear_downstream=False,
            set_pending_date=False,
            retain_historical_response=False,
            transition_kind="unknown",
            notice=None,
        )
    if returned is None:
        return DailyAdvancementUITransition(
            replace_canonical_water=False,
            replace_twin_from_response=False,
            refresh_authoritative_twin=False,
            invalidate_current_twin=False,
            clear_downstream=False,
            set_pending_date=False,
            retain_historical_response=True,
            transition_kind="malformed_retry",
            notice=DAILY_ADVANCEMENT_REUSED_NOTICE,
        )

    current_value = current or 0
    if returned > current_value:
        return DailyAdvancementUITransition(
            replace_canonical_water=True,
            replace_twin_from_response=False,
            refresh_authoritative_twin=True,
            invalidate_current_twin=True,
            clear_downstream=True,
            set_pending_date=True,
            retain_historical_response=False,
            transition_kind="catch_up_retry",
            notice=None,
        )
    if returned == current_value:
        replace_twin = _valid_snapshot_id(current_snapshot_id) and (
            current_snapshot_id == returned_snapshot_id
        )
        refresh_twin = not _valid_snapshot_id(current_snapshot_id)
        return DailyAdvancementUITransition(
            replace_canonical_water=True,
            replace_twin_from_response=replace_twin,
            refresh_authoritative_twin=refresh_twin,
            invalidate_current_twin=refresh_twin,
            clear_downstream=refresh_twin,
            set_pending_date=False,
            retain_historical_response=True,
            transition_kind="current_retry",
            notice=DAILY_ADVANCEMENT_REUSED_NOTICE,
        )

    return DailyAdvancementUITransition(
        replace_canonical_water=False,
        replace_twin_from_response=False,
        refresh_authoritative_twin=False,
        invalidate_current_twin=False,
        clear_downstream=False,
        set_pending_date=False,
        retain_historical_response=True,
        transition_kind="historical_retry",
        notice=DAILY_ADVANCEMENT_REUSED_NOTICE,
    )


def _coerce_nonnegative_int(value: object, *, default: int | None) -> int | None:
    if value is None:
        return default
    if isinstance(value, bool):
        return default
    try:
        integer = int(value)
    except (TypeError, ValueError):
        return default
    if integer < 0:
        return default
    return integer


def _valid_snapshot_id(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())
