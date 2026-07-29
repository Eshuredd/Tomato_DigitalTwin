from __future__ import annotations

from collections.abc import MutableMapping
from datetime import date
from typing import Any


PENDING_WATER_CURRENT_DATE_KEY = "pending_water_current_date"
WATER_CURRENT_DATE_KEY = "water_current_date"
DAILY_ADVANCEMENT_NOTICE_KEY = "daily_advancement_notice"


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
