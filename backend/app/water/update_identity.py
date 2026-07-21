"""Canonical identity helpers for water-state update idempotency."""

from __future__ import annotations

from datetime import date, datetime, timezone
import hashlib
import json
import math
from typing import Any

from app.schemas import LastIrrigationEvent, ObservationTimeBasis, WeatherInput


DERIVED_WATER_UPDATE_ID_PREFIX = "derived-water-update-"


def derive_water_update_id(
    *,
    state_id: str,
    observed_at: datetime,
    observation_time_basis: ObservationTimeBasis,
) -> str:
    """Derive the compatibility water update ID for old clients.

    Compatibility rule: when a client omits ``water_update_id``, one crop cycle
    has one canonical water observation for an exact UTC ``observed_at`` instant
    and observation-time basis. Clients that need multiple versions for the same
    instant must provide explicit distinct ``water_update_id`` values.
    """
    payload = {
        "state_id": _non_empty_string("state_id", state_id),
        "observed_at": _canonical_datetime("observed_at", observed_at),
        "observation_time_basis": _basis_value(observation_time_basis),
    }
    digest = hashlib.sha256(_canonical_json(payload).encode("utf-8")).hexdigest()
    return f"{DERIVED_WATER_UPDATE_ID_PREFIX}{digest}"


def compute_water_update_fingerprint(
    *,
    state_id: str,
    water_update_id: str,
    current_date: date,
    observed_at: datetime,
    observation_time_basis: ObservationTimeBasis,
    weather: WeatherInput,
    last_irrigation_event: LastIrrigationEvent | None,
) -> str:
    payload = {
        "state_id": _non_empty_string("state_id", state_id),
        "water_update_id": _non_empty_string("water_update_id", water_update_id),
        "current_date": current_date.isoformat(),
        "observed_at": _canonical_datetime("observed_at", observed_at),
        "observation_time_basis": _basis_value(observation_time_basis),
        "weather": _canonical_weather(weather),
        "last_irrigation_event": _canonical_irrigation_event(
            last_irrigation_event,
        ),
    }
    return hashlib.sha256(_canonical_json(payload).encode("utf-8")).hexdigest()


def _canonical_json(payload: dict[str, Any]) -> str:
    return json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )


def _canonical_datetime(field_name: str, value: datetime) -> str:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{field_name} must be timezone-aware.")
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _basis_value(value: ObservationTimeBasis) -> str:
    if not isinstance(value, ObservationTimeBasis):
        raise ValueError("observation_time_basis must be an ObservationTimeBasis.")
    return value.value


def _canonical_weather(weather: WeatherInput) -> dict[str, float | None]:
    if not isinstance(weather, WeatherInput):
        raise ValueError("weather must be a WeatherInput instance.")
    return {
        "tmin_c": _finite_float("weather.tmin_c", weather.tmin_c),
        "tmax_c": _finite_float("weather.tmax_c", weather.tmax_c),
        "humidity_pct": _finite_float("weather.humidity_pct", weather.humidity_pct),
        "wind_speed_mps": _finite_float(
            "weather.wind_speed_mps",
            weather.wind_speed_mps,
        ),
        "shortwave_radiation_sum_mj_m2": _finite_optional_float(
            "weather.shortwave_radiation_sum_mj_m2",
            weather.shortwave_radiation_sum_mj_m2,
        ),
        "rainfall_mm": _finite_float("weather.rainfall_mm", weather.rainfall_mm),
        "eto_reference_feed": _finite_optional_float(
            "weather.eto_reference_feed",
            weather.eto_reference_feed,
        ),
    }


def _canonical_irrigation_event(
    event: LastIrrigationEvent | None,
) -> dict[str, object]:
    if event is None:
        return {"reported": False}
    if not isinstance(event, LastIrrigationEvent):
        raise ValueError("last_irrigation_event must be a LastIrrigationEvent.")
    return {
        "reported": True,
        "irrigation_event_id": event.irrigation_event_id,
        "timestamp": _canonical_datetime(
            "last_irrigation_event.timestamp",
            event.timestamp,
        ),
        "amount_mm": _finite_float(
            "last_irrigation_event.amount_mm",
            event.amount_mm,
        ),
        "source": event.source.value,
    }


def _finite_float(field_name: str, value: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field_name} must be a finite number.")
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(f"{field_name} must be a finite number.")
    return result


def _finite_optional_float(field_name: str, value: float | None) -> float | None:
    if value is None:
        return None
    return _finite_float(field_name, value)


def _non_empty_string(field_name: str, value: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field_name} must be a non-empty string.")
    return value.strip()
