from __future__ import annotations

import base64
import math
import uuid

import pytest

from frontend.ui_helpers import (
    MAX_IMAGE_BYTES,
    action_help_text,
    badge_tone_for_moisture,
    badge_tone_for_stress,
    badge_tone_for_uncertainty,
    detect_weather_manual_overrides,
    drip_runtime_to_litres_and_depth,
    encode_image_bytes_to_base64,
    escape_html,
    format_action_label,
    format_percent,
    friendly_wetness_risk_label,
    generate_water_update_id,
    humanize_disease_label,
    irrigation_depth_from_litres_area,
    keys_to_clear_after,
    sanitize_error_details,
    should_clear_downstream_after_twin_update,
    top_class_probabilities,
    water_update_payload_signature,
    weather_values_from_snapshot,
    workflow_progress_states,
)


def test_encode_image_bytes_to_base64_round_trips() -> None:
    encoded = encode_image_bytes_to_base64(b"image-bytes")

    assert base64.b64decode(encoded) == b"image-bytes"


def test_encode_image_bytes_rejects_empty_and_oversized_payloads() -> None:
    with pytest.raises(ValueError, match="non-empty"):
        encode_image_bytes_to_base64(b"")

    with pytest.raises(ValueError, match="10 MB"):
        encode_image_bytes_to_base64(b"x" * (MAX_IMAGE_BYTES + 1))


def test_humanize_disease_label() -> None:
    assert (
        humanize_disease_label("Tomato___Tomato_Yellow_Leaf_Curl_Virus")
        == "Tomato Yellow Leaf Curl Virus"
    )


def test_format_percent() -> None:
    assert format_percent(0.81234) == "81.2%"
    assert format_percent(None) == "n/a"


def test_top_class_probabilities_are_sorted_and_limited() -> None:
    assert top_class_probabilities({"b": 0.2, "a": 0.8, "c": 0.1}, limit=2) == [
        ("a", 0.8),
        ("b", 0.2),
    ]


def test_keys_to_clear_after_returns_downstream_keys() -> None:
    assert "recommendation_response" in keys_to_clear_after("simulation")
    assert "disease_response" not in keys_to_clear_after("simulation")
    assert keys_to_clear_after("unknown") == ()


def test_twin_update_clear_decision_uses_explicit_snapshot_created_false() -> None:
    cases = [
        ({"snapshot_created": True}, True),
        ({"snapshot_created": False}, False),
        ({}, True),
        ({"snapshot_created": "false"}, True),
        ({"snapshot_created": None}, True),
        ({"snapshot_created": 0}, True),
        ({"snapshot_created": 1}, True),
    ]

    for response, expected in cases:
        assert should_clear_downstream_after_twin_update(response) is expected


def test_twin_update_clear_decision_does_not_mutate_response() -> None:
    response = {"snapshot_id": "snapshot-1", "snapshot_created": False}

    should_clear_downstream_after_twin_update(response)

    assert response == {"snapshot_id": "snapshot-1", "snapshot_created": False}


def test_sanitize_error_details_redacts_nested_base64() -> None:
    sanitized = sanitize_error_details(
        {"outer": [{"image_base64": "secret", "other": "visible"}]}
    )

    assert sanitized == {"outer": [{"image_base64": "[redacted]", "other": "visible"}]}


def test_escape_html_quotes_user_controlled_text() -> None:
    assert escape_html('<script data-x="1">') == "&lt;script data-x=&quot;1&quot;&gt;"


def test_badge_tones_for_status_values() -> None:
    assert badge_tone_for_uncertainty("low") == "success"
    assert badge_tone_for_uncertainty("medium") == "warning"
    assert badge_tone_for_uncertainty("high") == "danger"
    assert badge_tone_for_stress("low") == "success"
    assert badge_tone_for_stress("medium") == "warning"
    assert badge_tone_for_stress("high") == "danger"
    assert badge_tone_for_moisture("adequate") == "success"
    assert badge_tone_for_moisture("moderate_deficit") == "warning"
    assert badge_tone_for_moisture("depleted") == "danger"


def test_workflow_progress_states_identify_active_step() -> None:
    states = workflow_progress_states({"session": True, "disease": True})

    assert [state["state"] for state in states[:4]] == [
        "completed",
        "completed",
        "active",
        "pending",
    ]
    assert states[2]["label"] == "Water state"


def test_format_action_label() -> None:
    assert format_action_label("IRRIGATE_TOMORROW_AM") == "Irrigate in 24 hours"
    assert action_help_text("IRRIGATE_TOMORROW_AM") == (
        "Current MVP approximation for tomorrow morning."
    )


def test_litres_area_to_millimetres_conversion() -> None:
    assert irrigation_depth_from_litres_area(
        total_litres=100.0,
        irrigated_area_m2=50.0,
    ) == pytest.approx(2.0)


def test_drip_runtime_to_litres_and_millimetres_conversion() -> None:
    result = drip_runtime_to_litres_and_depth(
        emitter_count=20,
        emitter_flow_lph=2.0,
        runtime_minutes=30.0,
        irrigated_area_m2=10.0,
    )

    assert result["runtime_hours"] == pytest.approx(0.5)
    assert result["total_litres"] == pytest.approx(20.0)
    assert result["amount_mm"] == pytest.approx(2.0)


def test_irrigation_conversion_rejects_zero_or_negative_area() -> None:
    with pytest.raises(ValueError, match="irrigated_area_m2"):
        irrigation_depth_from_litres_area(
            total_litres=10.0,
            irrigated_area_m2=0.0,
        )
    with pytest.raises(ValueError, match="irrigated_area_m2"):
        irrigation_depth_from_litres_area(
            total_litres=10.0,
            irrigated_area_m2=-1.0,
        )


def test_drip_conversion_rejects_invalid_emitter_count() -> None:
    with pytest.raises(ValueError, match="emitter_count"):
        drip_runtime_to_litres_and_depth(
            emitter_count=0,
            emitter_flow_lph=2.0,
            runtime_minutes=30.0,
            irrigated_area_m2=10.0,
        )
    with pytest.raises(ValueError, match="emitter_count"):
        drip_runtime_to_litres_and_depth(
            emitter_count=1.5,  # type: ignore[arg-type]
            emitter_flow_lph=2.0,
            runtime_minutes=30.0,
            irrigated_area_m2=10.0,
        )


def test_drip_conversion_rejects_invalid_runtime() -> None:
    with pytest.raises(ValueError, match="runtime_minutes"):
        drip_runtime_to_litres_and_depth(
            emitter_count=10,
            emitter_flow_lph=2.0,
            runtime_minutes=0.0,
            irrigated_area_m2=10.0,
        )


def test_irrigation_conversion_rejects_non_finite_input() -> None:
    with pytest.raises(ValueError, match="total_litres"):
        irrigation_depth_from_litres_area(
            total_litres=math.inf,
            irrigated_area_m2=10.0,
        )


def test_friendly_wetness_risk_label_mapping() -> None:
    assert friendly_wetness_risk_label(
        "fungal_disease_present_avoid_leaf_wetness"
    ) == "Fungal evidence present — avoid wetting leaves"


def test_weather_response_population() -> None:
    snapshot = {
        "tmin_c": 21.5,
        "tmax_c": 32.25,
        "humidity_pct": 67.0,
        "wind_speed_mps": 2.55,
        "rainfall_mm": 4.2,
        "shortwave_radiation_sum_mj_m2": 19.75,
        "eto_reference_feed": 5.1,
    }

    assert weather_values_from_snapshot(snapshot) == snapshot


def test_manual_override_state_behaviour() -> None:
    fetched = {
        "tmin_c": 21.5,
        "tmax_c": 32.25,
        "humidity_pct": 67.0,
        "wind_speed_mps": 2.55,
        "rainfall_mm": 4.2,
        "shortwave_radiation_sum_mj_m2": 19.75,
        "eto_reference_feed": 5.1,
    }
    current = {**fetched, "rainfall_mm": 6.0}

    overrides = detect_weather_manual_overrides(current, fetched)

    assert overrides["rainfall_mm"] is True
    assert overrides["tmin_c"] is False


def test_water_update_payload_signature_and_uuid_generation() -> None:
    payload = {
        "current_date": "2026-07-10",
        "weather": {"rainfall_mm": 0.0, "tmax_c": 31.0},
    }
    first = water_update_payload_signature(state_id="state-1", payload=payload)
    second = water_update_payload_signature(
        state_id="state-1",
        payload={
            "weather": {"tmax_c": 31.0, "rainfall_mm": 0.0},
            "current_date": "2026-07-10",
        },
    )
    changed = water_update_payload_signature(
        state_id="state-1",
        payload={**payload, "current_date": "2026-07-11"},
    )

    assert first == second
    assert first != changed
    uuid.UUID(generate_water_update_id())
