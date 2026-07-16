from __future__ import annotations

from datetime import date
import json

import httpx
import pytest

from frontend.api_client import (
    DISEASE_MODEL_VERSION,
    CropTwinAPIClient,
    CropTwinAPIError,
)


def _client(handler: httpx.MockTransport) -> CropTwinAPIClient:
    return CropTwinAPIClient("http://testserver/", transport=handler)


def test_base_url_is_normalized() -> None:
    client = CropTwinAPIClient("http://testserver///", transport=httpx.MockTransport(lambda request: httpx.Response(200, json={})))

    assert client.base_url == "http://testserver"
    client.close()


def test_health_uses_expected_endpoint() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert request.url.path == "/health"
        return httpx.Response(200, json={"status": "ok"})

    client = _client(httpx.MockTransport(handler))

    assert client.health() == {"status": "ok"}


def test_create_session_posts_payload() -> None:
    payload = {"crop_type": "tomato"}

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert request.url.path == "/sessions"
        assert json.loads(request.content) == payload
        return httpx.Response(200, json={"state_id": "state-1"})

    client = _client(httpx.MockTransport(handler))

    assert client.create_session(payload)["state_id"] == "state-1"


def test_predict_disease_posts_versioned_body_and_uses_path_state_id() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert request.url.path == "/sessions/state-1/predict-disease"
        assert json.loads(request.content) == {
            "state_id": "state-1",
            "image_base64": "abc123",
            "model_version": DISEASE_MODEL_VERSION,
        }
        return httpx.Response(200, json={"predicted_label": "Tomato___healthy"})

    client = _client(httpx.MockTransport(handler))

    assert client.predict_disease("state-1", "abc123")["predicted_label"] == "Tomato___healthy"


def test_compute_water_state_posts_state_id_in_body() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/sessions/state-1/compute-water-state"
        assert json.loads(request.content)["state_id"] == "state-1"
        return httpx.Response(200, json={"stress_band": "low"})

    client = _client(httpx.MockTransport(handler))

    result = client.compute_water_state("state-1", {"current_date": "2026-07-11"})

    assert result == {"stress_band": "low"}


def test_get_weather_snapshot_uses_expected_route_and_query() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert request.url.path == "/sessions/state-1/weather-snapshot"
        assert request.url.params["target_date"] == "2026-07-10"
        return httpx.Response(200, json={"source": "open_meteo"})

    client = _client(httpx.MockTransport(handler))

    assert client.get_weather_snapshot("state-1", date(2026, 7, 10)) == {
        "source": "open_meteo"
    }


def test_update_simulate_recommend_and_narrate_contracts() -> None:
    seen: list[tuple[str, bytes]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((request.url.path, request.content))
        return httpx.Response(200, json={"ok": True})

    client = _client(httpx.MockTransport(handler))

    client.update_twin_state("state-1")
    client.simulate_actions("state-1", ["IRRIGATE_NOW"])
    client.recommend("state-1")
    client.narrate("state-1")

    assert seen[0] == (
        "/sessions/state-1/update-twin-state",
        b'{"state_id":"state-1"}',
    )
    assert seen[1] == (
        "/sessions/state-1/simulate-actions",
        b'{"state_id":"state-1","actions":["IRRIGATE_NOW"]}',
    )
    assert seen[2] == ("/sessions/state-1/recommend", b"")
    assert seen[3] == ("/sessions/state-1/narrate", b"")


def test_structured_error_is_normalized_and_redacted() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            503,
            json={
                "error": {
                    "code": "DISEASE_MODEL_UNAVAILABLE",
                    "message": "Model unavailable.",
                    "details": {"image_base64": "secret", "reason": "missing"},
                }
            },
        )

    client = _client(httpx.MockTransport(handler))

    with pytest.raises(CropTwinAPIError) as error:
        client.predict_disease("state-1", "secret")

    assert error.value.status_code == 503
    assert error.value.code == "DISEASE_MODEL_UNAVAILABLE"
    assert error.value.details["image_base64"] == "[redacted]"
    assert "secret" not in str(error.value.details)


def test_weather_snapshot_error_is_normalized() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/sessions/state-1/weather-snapshot"
        return httpx.Response(
            502,
            json={
                "error": {
                    "code": "WEATHER_LOOKUP_FAILED",
                    "message": "Failed to retrieve weather for this farm.",
                    "details": {"source": "open_meteo"},
                }
            },
        )

    client = _client(httpx.MockTransport(handler))

    with pytest.raises(CropTwinAPIError) as error:
        client.get_weather_snapshot("state-1", "2026-07-10")

    assert error.value.status_code == 502
    assert error.value.code == "WEATHER_LOOKUP_FAILED"
    assert error.value.details == {"source": "open_meteo"}


def test_fastapi_validation_error_is_normalized() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(422, json={"detail": [{"loc": ["body", "state_id"]}]})

    client = _client(httpx.MockTransport(handler))

    with pytest.raises(CropTwinAPIError) as error:
        client.create_session({})

    assert error.value.code == "FASTAPI_VALIDATION_ERROR"
    assert error.value.message == "Request validation failed."
    assert error.value.details == {"detail": [{"loc": ["body", "state_id"]}]}


def test_non_json_success_response_is_error() -> None:
    client = _client(httpx.MockTransport(lambda request: httpx.Response(200, text="ok")))

    with pytest.raises(CropTwinAPIError) as error:
        client.health()

    assert error.value.code == "NON_JSON_RESPONSE"


def test_timeout_and_connection_errors_are_normalized_without_base64() -> None:
    timeout_client = _client(
        httpx.MockTransport(
            lambda request: (_ for _ in ()).throw(httpx.TimeoutException("slow"))
        )
    )

    with pytest.raises(CropTwinAPIError) as timeout_error:
        timeout_client.predict_disease("state-1", "very-secret-base64")

    assert timeout_error.value.code == "REQUEST_TIMEOUT"
    assert "very-secret-base64" not in str(timeout_error.value.details)

    connection_client = _client(
        httpx.MockTransport(
            lambda request: (_ for _ in ()).throw(httpx.ConnectError("down"))
        )
    )

    with pytest.raises(CropTwinAPIError) as connection_error:
        connection_client.health()

    assert connection_error.value.code == "CONNECTION_ERROR"
