from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import math

from app.schemas import LastIrrigationEvent
from app.store.errors import PersistenceIntegrityError


def snapshot_source_fingerprint(
    *,
    state_id: str,
    disease_observation_id: str,
    growth_observation_id: str,
    water_observation_id: str,
) -> str:
    payload = {
        "state_id": state_id,
        "disease_observation_id": disease_observation_id,
        "growth_observation_id": growth_observation_id,
        "water_observation_id": water_observation_id,
    }
    canonical = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc_datetime(value: datetime, *, field_name: str) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{field_name} must be timezone-aware.")
    return value.astimezone(timezone.utc)


def derive_irrigation_event_id(
    *,
    state_id: str,
    timestamp: datetime,
    amount_mm: float,
) -> str:
    timestamp_utc = ensure_utc_datetime(
        timestamp,
        field_name="last_irrigation_event.timestamp",
    )
    normalized_amount = f"{float(amount_mm):.6f}"
    source = f"{state_id}|{timestamp_utc.isoformat()}|{normalized_amount}"
    digest = hashlib.sha256(source.encode("utf-8")).hexdigest()[:32]
    return f"irrigation_{digest}"


def with_irrigation_event_id(
    state_id: str,
    event: LastIrrigationEvent,
) -> LastIrrigationEvent:
    if not isinstance(event, LastIrrigationEvent):
        raise ValueError("last_irrigation_event must be a LastIrrigationEvent.")
    irrigation_event_id = event.irrigation_event_id or derive_irrigation_event_id(
        state_id=state_id,
        timestamp=event.timestamp,
        amount_mm=event.amount_mm,
    )
    return event.model_copy(update={"irrigation_event_id": irrigation_event_id})


def normalize_irrigation_event(
    state_id: str,
    event: LastIrrigationEvent,
) -> LastIrrigationEvent:
    return with_irrigation_event_id(state_id, event)


def irrigation_event_payload_conflict_field(
    existing: LastIrrigationEvent,
    candidate: LastIrrigationEvent,
) -> str | None:
    existing_id = existing.irrigation_event_id
    candidate_id = candidate.irrigation_event_id
    if existing_id != candidate_id:
        return "irrigation_event_id"
    if ensure_utc_datetime(
        existing.timestamp,
        field_name="last_irrigation_event.timestamp",
    ) != ensure_utc_datetime(
        candidate.timestamp,
        field_name="last_irrigation_event.timestamp",
    ):
        return "timestamp"
    if f"{float(existing.amount_mm):.6f}" != f"{float(candidate.amount_mm):.6f}":
        return "amount_mm"
    if existing.source != candidate.source:
        return "source"
    return None


def _validate_water_update_id(water_update_id: str) -> str:
    if not isinstance(water_update_id, str):
        raise ValueError("water_update_id must be a string.")
    normalized = water_update_id.strip()
    if not normalized:
        raise ValueError("water_update_id must be non-empty.")
    if len(normalized) > 160:
        raise ValueError("water_update_id must be at most 160 characters.")
    return normalized


def _validate_request_fingerprint(request_fingerprint: str) -> str:
    if not isinstance(request_fingerprint, str) or not request_fingerprint.strip():
        raise ValueError("request_fingerprint must be non-empty.")
    normalized = request_fingerprint.strip()
    if len(normalized) > 128:
        raise ValueError("request_fingerprint must be at most 128 characters.")
    return normalized


def _validate_non_empty_bounded_string(
    value: str,
    *,
    field_name: str,
    max_length: int,
) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field_name} must be a string.")
    normalized = value.strip()
    if not normalized:
        raise ValueError(f"{field_name} must be non-empty.")
    if len(normalized) > max_length:
        raise ValueError(f"{field_name} must be at most {max_length} characters.")
    return normalized


def _validate_effective_irrigation_mm(value: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("effective_irrigation_mm must be a finite number.")
    result = float(value)
    if not math.isfinite(result):
        raise ValueError("effective_irrigation_mm must be a finite number.")
    if result < 0.0:
        raise ValueError("effective_irrigation_mm must be >= 0.")
    return result


def _validate_effective_matches_event(
    *,
    state_id: str,
    irrigation_event_id: str,
    event_amount_mm: float,
    effective_irrigation_mm: float,
) -> None:
    if not math.isclose(
        float(event_amount_mm),
        float(effective_irrigation_mm),
        rel_tol=0.0,
        abs_tol=1e-9,
    ):
        raise PersistenceIntegrityError(
            "Water update effective irrigation does not match the current "
            f"application state for irrigation event '{irrigation_event_id}' "
            f"on state '{state_id}'."
        )


def _validate_base_sequence(value: int | None, *, field_name: str) -> int:
    if value is None:
        raise ValueError(f"{field_name} is required.")
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{field_name} must be an integer.")
    if value < 0:
        raise ValueError(f"{field_name} must be >= 0.")
    return value


def _depletion_matches(expected: float, actual: float) -> bool:
    return math.isclose(
        float(expected),
        float(actual),
        rel_tol=0.0,
        abs_tol=1e-9,
    )


