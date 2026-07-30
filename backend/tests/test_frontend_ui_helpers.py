from __future__ import annotations

import base64
from contextlib import nullcontext
import math
import uuid
from datetime import date
from typing import Any

import pytest

from frontend.views import app_main
from frontend.ui_helpers import (
    MAX_IMAGE_BYTES,
    action_help_text,
    badge_tone_for_moisture,
    badge_tone_for_stress,
    badge_tone_for_uncertainty,
    detect_weather_manual_overrides,
    daily_advancement_payload_signature,
    drip_runtime_to_litres_and_depth,
    encode_image_bytes_to_base64,
    escape_html,
    format_action_label,
    format_percent,
    friendly_wetness_risk_label,
    generate_daily_advancement_id,
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
from frontend.workflow_state import (
    DAILY_ADVANCEMENT_CATCH_UP_NOTICE,
    DAILY_ADVANCEMENT_REUSED_NOTICE,
    apply_pending_water_current_date,
    daily_advancement_ui_transition,
    pop_flash_notice,
    set_flash_notice,
    should_replace_local_canonical_water,
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


def test_pending_water_current_date_is_applied_once_before_widget_creation() -> None:
    state = {
        "water_current_date": date(2026, 7, 11),
        "pending_water_current_date": date(2026, 7, 12),
    }

    applied = apply_pending_water_current_date(state)

    assert applied == date(2026, 7, 12)
    assert state["water_current_date"] == date(2026, 7, 12)
    assert state["pending_water_current_date"] is None
    assert apply_pending_water_current_date(state) is None
    assert state["water_current_date"] == date(2026, 7, 12)


def test_invalid_pending_water_current_date_is_cleared_without_mutating_current() -> None:
    state = {
        "water_current_date": date(2026, 7, 11),
        "pending_water_current_date": "2026-07-12",
    }

    assert apply_pending_water_current_date(state) is None
    assert state["water_current_date"] == date(2026, 7, 11)
    assert state["pending_water_current_date"] is None


def test_flash_notice_survives_one_logical_rerun_and_is_removed() -> None:
    state: dict[str, object] = {}

    set_flash_notice(
        state,
        "This daily advancement was already completed; reused the original result.",
    )

    assert (
        pop_flash_notice(state)
        == "This daily advancement was already completed; reused the original result."
    )
    assert state["daily_advancement_notice"] is None
    assert pop_flash_notice(state) is None


@pytest.mark.parametrize(
    ("current_sequence", "returned_sequence", "expected"),
    [
        (1, 2, True),
        (2, 2, True),
        (3, 2, False),
        (0, 1, True),
        (3, "malformed", False),
        (None, 1, True),
        (None, 0, True),
        (2, None, False),
    ],
)
def test_should_replace_local_canonical_water_uses_sequences(
    current_sequence: int | None,
    returned_sequence: object,
    expected: bool,
) -> None:
    assert (
        should_replace_local_canonical_water(
            current_sequence=current_sequence,
            returned_sequence=returned_sequence,
        )
        is expected
    )


@pytest.mark.parametrize(
    (
        "advancement_created",
        "current_sequence",
        "returned_sequence",
        "expected",
    ),
    [
        (
            True,
            1,
            2,
            {
                "replace_canonical_water": True,
                "replace_twin_from_response": True,
                "refresh_authoritative_twin": False,
                "clear_downstream": True,
                "set_pending_date": True,
                "retain_historical_response": False,
                "transition_kind": "new_advancement",
                "notice": None,
            },
        ),
        (
            False,
            1,
            2,
            {
                "replace_canonical_water": True,
                "replace_twin_from_response": False,
                "refresh_authoritative_twin": True,
                "clear_downstream": True,
                "set_pending_date": True,
                "retain_historical_response": False,
                "transition_kind": "catch_up_retry",
                "notice": DAILY_ADVANCEMENT_CATCH_UP_NOTICE,
            },
        ),
        (
            False,
            2,
            2,
            {
                "replace_canonical_water": True,
                "replace_twin_from_response": False,
                "refresh_authoritative_twin": True,
                "clear_downstream": False,
                "set_pending_date": False,
                "retain_historical_response": True,
                "transition_kind": "current_retry",
                "notice": DAILY_ADVANCEMENT_REUSED_NOTICE,
            },
        ),
        (
            False,
            3,
            2,
            {
                "replace_canonical_water": False,
                "replace_twin_from_response": False,
                "refresh_authoritative_twin": False,
                "clear_downstream": False,
                "set_pending_date": False,
                "retain_historical_response": True,
                "transition_kind": "historical_retry",
                "notice": DAILY_ADVANCEMENT_REUSED_NOTICE,
            },
        ),
        (
            False,
            2,
            None,
            {
                "replace_canonical_water": False,
                "replace_twin_from_response": False,
                "refresh_authoritative_twin": False,
                "clear_downstream": False,
                "set_pending_date": False,
                "retain_historical_response": True,
                "transition_kind": "malformed_retry",
                "notice": DAILY_ADVANCEMENT_REUSED_NOTICE,
            },
        ),
        (
            False,
            2,
            "not-a-sequence",
            {
                "replace_canonical_water": False,
                "replace_twin_from_response": False,
                "refresh_authoritative_twin": False,
                "clear_downstream": False,
                "set_pending_date": False,
                "retain_historical_response": True,
                "transition_kind": "malformed_retry",
                "notice": DAILY_ADVANCEMENT_REUSED_NOTICE,
            },
        ),
        (
            False,
            2,
            True,
            {
                "replace_canonical_water": False,
                "replace_twin_from_response": False,
                "refresh_authoritative_twin": False,
                "clear_downstream": False,
                "set_pending_date": False,
                "retain_historical_response": True,
                "transition_kind": "malformed_retry",
                "notice": DAILY_ADVANCEMENT_REUSED_NOTICE,
            },
        ),
        (
            False,
            2,
            -1,
            {
                "replace_canonical_water": False,
                "replace_twin_from_response": False,
                "refresh_authoritative_twin": False,
                "clear_downstream": False,
                "set_pending_date": False,
                "retain_historical_response": True,
                "transition_kind": "malformed_retry",
                "notice": DAILY_ADVANCEMENT_REUSED_NOTICE,
            },
        ),
    ],
)
def test_daily_advancement_ui_transition_policy(
    advancement_created: object,
    current_sequence: object,
    returned_sequence: object,
    expected: dict[str, object],
) -> None:
    transition = daily_advancement_ui_transition(
        advancement_created=advancement_created,
        current_sequence=current_sequence,
        returned_sequence=returned_sequence,
    )

    assert transition.__dict__ == expected


def test_current_retry_only_replaces_matching_twin_snapshot() -> None:
    matching = daily_advancement_ui_transition(
        advancement_created=False,
        current_sequence=2,
        returned_sequence=2,
        current_snapshot_id="snapshot-current",
        returned_snapshot_id="snapshot-current",
    )
    stale = daily_advancement_ui_transition(
        advancement_created=False,
        current_sequence=2,
        returned_sequence=2,
        current_snapshot_id="snapshot-current",
        returned_snapshot_id="snapshot-old",
    )

    assert matching.replace_twin_from_response is True
    assert matching.refresh_authoritative_twin is False
    assert stale.replace_twin_from_response is False
    assert stale.refresh_authoritative_twin is False


def test_daily_advancement_ui_transition_does_not_mutate_inputs() -> None:
    response = {"advancement_created": False}
    water_state = {"water_sequence": 2}

    daily_advancement_ui_transition(
        advancement_created=response["advancement_created"],
        current_sequence=1,
        returned_sequence=water_state["water_sequence"],
    )

    assert response == {"advancement_created": False}
    assert water_state == {"water_sequence": 2}


class _FakeSessionState(dict):
    def __getattr__(self, name: str) -> Any:
        try:
            return self[name]
        except KeyError as exc:
            raise AttributeError(name) from exc

    def __setattr__(self, name: str, value: Any) -> None:
        self[name] = value


class _FakeStreamlit:
    def __init__(self, state: _FakeSessionState) -> None:
        self.session_state = state

    def spinner(self, _label: str) -> nullcontext[None]:
        return nullcontext()

    def toast(self, _message: str) -> None:
        return None


class _FakeDailyAdvancementClient:
    def __init__(self, response: dict[str, Any] | None = None) -> None:
        self.response = response or {
            "snapshot_id": "snapshot-authoritative",
            "snapshot_created": False,
            "current_state": {"source": "authoritative"},
        }
        self.update_calls: list[str] = []

    def update_twin_state(self, state_id: str) -> dict[str, Any]:
        self.update_calls.append(state_id)
        return self.response


def _water_payload(sequence: object, observed_at: str = "2026-07-11T00:00:00Z") -> dict[str, Any]:
    return {
        "water_observation_id": f"water-{sequence}",
        "water_sequence": sequence,
        "observed_at": observed_at,
    }


def _twin_payload(snapshot_id: str) -> dict[str, Any]:
    return {
        "snapshot_id": snapshot_id,
        "snapshot_created": False,
        "current_state": {"snapshot_id": snapshot_id},
    }


def _base_daily_state() -> dict[str, Any]:
    return {
        "active_state_id": "state-1",
        "water_response": _water_payload(1, "2026-07-10T00:00:00Z"),
        "twin_response": _twin_payload("snapshot-current"),
        "simulation_response": {"simulation": "kept"},
        "recommendation_response": {"recommendation": "kept"},
        "narration_response": {"narration": "kept"},
        "session_state_response": {"session": "cached"},
        "history_response": {"history": []},
        "latest_water_observation_id": "water-1",
        "latest_water_sequence": 1,
        "pending_water_current_date": date(2026, 7, 20),
        "daily_advancement_retry_response": None,
        "daily_advancement_notice": None,
    }


def _apply_daily_result_with_fake_streamlit(
    monkeypatch: pytest.MonkeyPatch,
    state: dict[str, Any],
    result: dict[str, Any],
    *,
    client: _FakeDailyAdvancementClient | None = None,
) -> _FakeDailyAdvancementClient:
    fake_client = client or _FakeDailyAdvancementClient()
    fake_state = _FakeSessionState(state)
    monkeypatch.setattr(app_main, "st", _FakeStreamlit(fake_state))
    app_main._apply_daily_advancement_result(  # noqa: SLF001
        result,
        client=fake_client,  # type: ignore[arg-type]
        fallback_pending_date=date(2026, 7, 12),
    )
    state.clear()
    state.update(fake_state)
    return fake_client


def test_apply_daily_advancement_result_handles_new_advancement(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    state = _base_daily_state()
    result = {
        "advancement_created": True,
        "water_state": _water_payload(2, "2026-07-11T00:00:00Z"),
        "twin_state": _twin_payload("snapshot-new"),
    }

    client = _apply_daily_result_with_fake_streamlit(monkeypatch, state, result)

    assert state["water_response"] == result["water_state"]
    assert state["latest_water_observation_id"] == "water-2"
    assert state["latest_water_sequence"] == 2
    assert state["twin_response"] == result["twin_state"]
    assert state["simulation_response"] is None
    assert state["recommendation_response"] is None
    assert state["narration_response"] is None
    assert state["pending_water_current_date"] == date(2026, 7, 12)
    assert state["daily_advancement_retry_response"] is None
    assert client.update_calls == []


def test_apply_daily_advancement_result_handles_catch_up_retry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    state = _base_daily_state()
    authoritative_twin = _twin_payload("snapshot-authoritative")
    result = {
        "advancement_created": False,
        "water_state": _water_payload(2, "2026-07-11T00:00:00Z"),
        "twin_state": _twin_payload("snapshot-ledger"),
    }

    client = _apply_daily_result_with_fake_streamlit(
        monkeypatch,
        state,
        result,
        client=_FakeDailyAdvancementClient(authoritative_twin),
    )

    assert state["water_response"] == result["water_state"]
    assert state["latest_water_sequence"] == 2
    assert state["simulation_response"] is None
    assert state["recommendation_response"] is None
    assert state["narration_response"] is None
    assert state["twin_response"] == authoritative_twin
    assert state["twin_response"] != result["twin_state"]
    assert state["pending_water_current_date"] == date(2026, 7, 12)
    assert state["daily_advancement_retry_response"] is None
    assert state["daily_advancement_notice"] == DAILY_ADVANCEMENT_CATCH_UP_NOTICE
    assert client.update_calls == ["state-1"]


def test_apply_daily_advancement_result_handles_current_retry_matching_snapshot(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    state = _base_daily_state()
    result = {
        "advancement_created": False,
        "water_state": _water_payload(1, "2026-07-10T00:00:00Z"),
        "twin_state": _twin_payload("snapshot-current"),
    }

    client = _apply_daily_result_with_fake_streamlit(monkeypatch, state, result)

    assert state["simulation_response"] == {"simulation": "kept"}
    assert state["recommendation_response"] == {"recommendation": "kept"}
    assert state["narration_response"] == {"narration": "kept"}
    assert state["twin_response"]["snapshot_id"] == "snapshot-current"
    assert state["pending_water_current_date"] == date(2026, 7, 20)
    assert state["daily_advancement_retry_response"] == result
    assert state["daily_advancement_notice"] == DAILY_ADVANCEMENT_REUSED_NOTICE
    assert client.update_calls == []


def test_apply_daily_advancement_result_preserves_current_twin_on_snapshot_mismatch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    state = _base_daily_state()
    current_twin = state["twin_response"]
    result = {
        "advancement_created": False,
        "water_state": _water_payload(1, "2026-07-10T00:00:00Z"),
        "twin_state": _twin_payload("snapshot-ledger-old"),
    }

    client = _apply_daily_result_with_fake_streamlit(monkeypatch, state, result)

    assert state["twin_response"] is current_twin
    assert state["simulation_response"] == {"simulation": "kept"}
    assert state["pending_water_current_date"] == date(2026, 7, 20)
    assert state["daily_advancement_retry_response"] == result
    assert client.update_calls == []


def test_apply_daily_advancement_result_refreshes_current_retry_without_local_twin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    state = _base_daily_state()
    state["twin_response"] = None
    authoritative_twin = _twin_payload("snapshot-authoritative")
    result = {
        "advancement_created": False,
        "water_state": _water_payload(1, "2026-07-10T00:00:00Z"),
        "twin_state": _twin_payload("snapshot-ledger"),
    }

    client = _apply_daily_result_with_fake_streamlit(
        monkeypatch,
        state,
        result,
        client=_FakeDailyAdvancementClient(authoritative_twin),
    )

    assert state["twin_response"] == authoritative_twin
    assert state["simulation_response"] == {"simulation": "kept"}
    assert state["pending_water_current_date"] == date(2026, 7, 20)
    assert state["daily_advancement_retry_response"] == result
    assert client.update_calls == ["state-1"]


def test_apply_daily_advancement_result_keeps_historical_retry_read_only(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    state = _base_daily_state()
    state["latest_water_sequence"] = 3
    before = dict(state)
    result = {
        "advancement_created": False,
        "water_state": _water_payload(2, "2026-07-11T00:00:00Z"),
        "twin_state": _twin_payload("snapshot-historical"),
    }

    client = _apply_daily_result_with_fake_streamlit(monkeypatch, state, result)

    for key in (
        "water_response",
        "latest_water_observation_id",
        "latest_water_sequence",
        "twin_response",
        "simulation_response",
        "recommendation_response",
        "narration_response",
        "pending_water_current_date",
    ):
        assert state[key] == before[key]
    assert state["daily_advancement_retry_response"] == result
    assert state["daily_advancement_notice"] == DAILY_ADVANCEMENT_REUSED_NOTICE
    assert client.update_calls == []


def test_apply_daily_advancement_result_keeps_malformed_retry_conservative(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    state = _base_daily_state()
    before = dict(state)
    result = {
        "advancement_created": False,
        "water_state": _water_payload("not-a-sequence", "2026-07-11T00:00:00Z"),
        "twin_state": _twin_payload("snapshot-malformed"),
    }

    client = _apply_daily_result_with_fake_streamlit(monkeypatch, state, result)

    for key in (
        "water_response",
        "latest_water_observation_id",
        "latest_water_sequence",
        "twin_response",
        "simulation_response",
        "recommendation_response",
        "narration_response",
        "pending_water_current_date",
    ):
        assert state[key] == before[key]
    assert state["daily_advancement_retry_response"] == result
    assert state["daily_advancement_notice"] == DAILY_ADVANCEMENT_REUSED_NOTICE
    assert client.update_calls == []


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


def test_daily_advancement_payload_signature_and_uuid_generation() -> None:
    payload = {
        "target_date": "2026-07-11",
        "weather": {"rainfall_mm": 0.0, "tmax_c": 31.0},
    }
    first = daily_advancement_payload_signature(state_id="state-1", payload=payload)
    second = daily_advancement_payload_signature(
        state_id="state-1",
        payload={
            "weather": {"tmax_c": 31.0, "rainfall_mm": 0.0},
            "target_date": "2026-07-11",
        },
    )
    changed = daily_advancement_payload_signature(
        state_id="state-1",
        payload={**payload, "target_date": "2026-07-12"},
    )

    assert first == second
    assert first != changed
    uuid.UUID(generate_daily_advancement_id())
