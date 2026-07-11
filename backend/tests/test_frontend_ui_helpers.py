from __future__ import annotations

import base64

import pytest

from frontend.ui_helpers import (
    MAX_IMAGE_BYTES,
    badge_tone_for_moisture,
    badge_tone_for_stress,
    badge_tone_for_uncertainty,
    encode_image_bytes_to_base64,
    escape_html,
    format_action_label,
    format_percent,
    humanize_disease_label,
    keys_to_clear_after,
    sanitize_error_details,
    top_class_probabilities,
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
    assert format_action_label("IRRIGATE_TOMORROW_AM") == "Irrigate Tomorrow Am"
