from __future__ import annotations

import base64
from html import escape
import json
import math
from typing import Any
import uuid


MAX_IMAGE_BYTES = 10 * 1024 * 1024

ACTION_OPTIONS = [
    "IRRIGATE_NOW",
    "IRRIGATE_IN_6H",
    "IRRIGATE_TOMORROW_AM",
    "NO_IRRIGATION_24H",
]

ACTION_LABELS = {
    "IRRIGATE_NOW": "Irrigate now",
    "IRRIGATE_IN_6H": "Irrigate in 6 hours",
    "IRRIGATE_TOMORROW_AM": "Irrigate in 24 hours",
    "NO_IRRIGATION_24H": "No irrigation in the next 24 hours",
}

ACTION_HELP_TEXT = {
    "IRRIGATE_TOMORROW_AM": "Current MVP approximation for tomorrow morning.",
}

DISEASE_WETNESS_RISK_LABELS = {
    "no_fungal_wetness_risk_flagged": "No added fungal wetness caution detected",
    "fungal_disease_present_avoid_leaf_wetness": "Fungal evidence present — avoid wetting leaves",
    "fungal_prediction_high_uncertainty_irrigation_wetness_caution": (
        "Possible fungal evidence is uncertain — inspect the crop and avoid "
        "unnecessary leaf wetness"
    ),
    "fungal_disease_present_no_new_irrigation_wetness": (
        "Fungal evidence present, but this option adds no irrigation wetness"
    ),
    "no_irrigation_wetness_added": "No irrigation wetness added",
}

WEATHER_INPUT_FIELDS = (
    "tmin_c",
    "tmax_c",
    "humidity_pct",
    "wind_speed_mps",
    "rainfall_mm",
    "shortwave_radiation_sum_mj_m2",
    "eto_reference_feed",
)

SOIL_TEXTURE_OPTIONS = [
    "sand",
    "sandy_loam",
    "loam",
    "silty_loam",
    "clay_loam",
    "clay",
]

DOWNSTREAM_KEYS_BY_STEP = {
    "session": (
        "disease_response",
        "water_response",
        "twin_response",
        "simulation_response",
        "recommendation_response",
        "narration_response",
        "session_state_response",
        "history_response",
        "weather_snapshot_response",
        "weather_fetched_values",
        "weather_manual_overrides",
        "water_update_id",
        "water_update_signature",
        "latest_water_observation_id",
        "latest_water_sequence",
        "pending_water_base_observation_id",
        "pending_water_base_sequence",
    ),
    "disease": (
        "twin_response",
        "simulation_response",
        "recommendation_response",
        "narration_response",
        "session_state_response",
        "history_response",
        "water_update_id",
        "water_update_signature",
        "pending_water_base_observation_id",
        "pending_water_base_sequence",
    ),
    "water": (
        "twin_response",
        "simulation_response",
        "recommendation_response",
        "narration_response",
        "session_state_response",
        "history_response",
    ),
    "twin": (
        "simulation_response",
        "recommendation_response",
        "narration_response",
        "session_state_response",
        "history_response",
    ),
    "simulation": ("recommendation_response", "narration_response"),
    "recommendation": ("narration_response",),
}


def encode_image_bytes_to_base64(image_bytes: bytes) -> str:
    if not image_bytes:
        raise ValueError("Upload a non-empty image file.")
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise ValueError("Image upload is larger than 10 MB.")
    return base64.b64encode(image_bytes).decode("ascii")


def humanize_disease_label(label: str) -> str:
    cleaned = label.replace("Tomato___", "").replace("_", " ").strip()
    return " ".join(cleaned.split())


def format_percent(value: float | int | None, *, digits: int = 1) -> str:
    if value is None:
        return "n/a"
    return f"{float(value) * 100:.{digits}f}%"


def top_class_probabilities(
    class_probs: dict[str, float],
    *,
    limit: int = 3,
) -> list[tuple[str, float]]:
    return sorted(class_probs.items(), key=lambda item: item[1], reverse=True)[:limit]


def keys_to_clear_after(step: str) -> tuple[str, ...]:
    return DOWNSTREAM_KEYS_BY_STEP.get(step, ())


def sanitize_error_details(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: "[redacted]" if key == "image_base64" else sanitize_error_details(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [sanitize_error_details(item) for item in value]
    return value


def escape_html(value: object) -> str:
    return escape(str(value), quote=True)


def badge_tone_for_uncertainty(uncertainty_band: str | None) -> str:
    if uncertainty_band == "low":
        return "success"
    if uncertainty_band == "medium":
        return "warning"
    if uncertainty_band == "high":
        return "danger"
    return "neutral"


def badge_tone_for_stress(stress_band: str | None) -> str:
    if stress_band == "low":
        return "success"
    if stress_band == "medium":
        return "warning"
    if stress_band == "high":
        return "danger"
    return "neutral"


def badge_tone_for_moisture(moisture_state: str | None) -> str:
    if moisture_state == "adequate":
        return "success"
    if moisture_state == "moderate_deficit":
        return "warning"
    if moisture_state == "depleted":
        return "danger"
    return "neutral"


def workflow_progress_states(completed: dict[str, bool]) -> list[dict[str, str]]:
    labels = [
        ("session", "Session"),
        ("disease", "Disease evidence"),
        ("water", "Water state"),
        ("twin", "Twin state"),
        ("simulation", "Simulations"),
        ("recommendation", "Recommendation"),
        ("narration", "Narration"),
    ]
    active_assigned = False
    states: list[dict[str, str]] = []

    for key, label in labels:
        if completed.get(key, False):
            state = "completed"
            symbol = "check"
        elif not active_assigned:
            state = "active"
            symbol = "current"
            active_assigned = True
        else:
            state = "pending"
            symbol = "pending"
        states.append({"key": key, "label": label, "state": state, "symbol": symbol})

    return states


def format_action_label(action: str) -> str:
    return ACTION_LABELS.get(action, action.replace("_", " ").title())


def action_help_text(action: str) -> str | None:
    return ACTION_HELP_TEXT.get(action)


def friendly_wetness_risk_label(note: str) -> str:
    return DISEASE_WETNESS_RISK_LABELS.get(note, note.replace("_", " ").capitalize())


def irrigation_depth_from_litres_area(
    *,
    total_litres: float,
    irrigated_area_m2: float,
) -> float:
    litres = _finite_float("total_litres", total_litres)
    area = _finite_float("irrigated_area_m2", irrigated_area_m2)

    if litres < 0.0:
        raise ValueError("total_litres must be >= 0.")
    if area <= 0.0:
        raise ValueError("irrigated_area_m2 must be greater than 0.")

    return litres / area


def drip_runtime_to_litres_and_depth(
    *,
    emitter_count: int,
    emitter_flow_lph: float,
    runtime_minutes: float,
    irrigated_area_m2: float,
) -> dict[str, float]:
    if isinstance(emitter_count, bool) or not isinstance(emitter_count, int):
        raise ValueError("emitter_count must be a positive integer.")
    if emitter_count <= 0:
        raise ValueError("emitter_count must be a positive integer.")

    flow = _finite_float("emitter_flow_lph", emitter_flow_lph)
    runtime = _finite_float("runtime_minutes", runtime_minutes)
    area = _finite_float("irrigated_area_m2", irrigated_area_m2)

    if flow <= 0.0:
        raise ValueError("emitter_flow_lph must be greater than 0.")
    if runtime <= 0.0:
        raise ValueError("runtime_minutes must be greater than 0.")
    if area <= 0.0:
        raise ValueError("irrigated_area_m2 must be greater than 0.")

    runtime_hours = runtime / 60.0
    total_litres = emitter_count * flow * runtime_hours
    amount_mm = irrigation_depth_from_litres_area(
        total_litres=total_litres,
        irrigated_area_m2=area,
    )

    return {
        "runtime_hours": runtime_hours,
        "total_litres": total_litres,
        "amount_mm": amount_mm,
    }


def weather_values_from_snapshot(snapshot: dict[str, Any]) -> dict[str, float]:
    values: dict[str, float] = {}
    for field in WEATHER_INPUT_FIELDS:
        if field not in snapshot:
            raise ValueError(f"Weather snapshot missing {field}.")
        values[field] = _finite_float(field, snapshot[field])
    return values


def detect_weather_manual_overrides(
    current_values: dict[str, Any],
    fetched_values: dict[str, Any] | None,
    *,
    tolerance: float = 1e-9,
) -> dict[str, bool]:
    if fetched_values is None:
        return {field: False for field in WEATHER_INPUT_FIELDS}

    tolerance_value = _finite_float("tolerance", tolerance)
    if tolerance_value < 0.0:
        raise ValueError("tolerance must be >= 0.")

    overrides: dict[str, bool] = {}
    for field in WEATHER_INPUT_FIELDS:
        current = _finite_float(field, current_values[field])
        fetched = _finite_float(field, fetched_values[field])
        overrides[field] = abs(current - fetched) > tolerance_value
    return overrides


def generate_water_update_id() -> str:
    return str(uuid.uuid4())


def water_update_payload_signature(
    *,
    state_id: str,
    payload: dict[str, Any],
) -> str:
    return json.dumps(
        {
            "state_id": state_id,
            "payload": payload,
        },
        sort_keys=True,
        separators=(",", ":"),
        default=str,
        allow_nan=False,
    )


def _finite_float(name: str, value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be a finite number.")
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(f"{name} must be a finite number.")
    return result
