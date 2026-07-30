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


@dataclass(frozen=True)
class DailyAdvancementUITransition:
    replace_canonical_water: bool
    replace_twin_state: bool
    clear_downstream: bool
    set_pending_date: bool
    is_historical_retry: bool
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
) -> DailyAdvancementUITransition:
    created = advancement_created is True
    exact_retry = advancement_created is False
    current = _coerce_nonnegative_int(current_sequence, default=0)
    returned = _coerce_nonnegative_int(returned_sequence, default=None)
    if returned is None:
        return DailyAdvancementUITransition(
            replace_canonical_water=False,
            replace_twin_state=False,
            clear_downstream=False,
            set_pending_date=False,
            is_historical_retry=exact_retry,
            notice=DAILY_ADVANCEMENT_REUSED_NOTICE if exact_retry else None,
        )

    replace = returned >= (current or 0)
    notice = DAILY_ADVANCEMENT_REUSED_NOTICE if exact_retry else None
    return DailyAdvancementUITransition(
        replace_canonical_water=replace,
        replace_twin_state=replace,
        clear_downstream=created and replace,
        set_pending_date=created and replace,
        is_historical_retry=exact_retry and not replace,
        notice=notice,
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
