from __future__ import annotations

from collections.abc import Iterator
from datetime import date, datetime, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_state_store
from app.external.weather_client import WeatherClientError
from app.main import app
from app.routes import water as water_routes
from app.schemas import (
    CreateSessionRequest,
    CropType,
    ErrorResponse,
    Location,
    SoilTexture,
    WeatherSnapshotResponse,
)
from app.state_store import InMemoryTwinStateStore


TARGET_DATE = date(2026, 7, 10)


@pytest.fixture
def client_and_store() -> Iterator[tuple[TestClient, InMemoryTwinStateStore]]:
    store = InMemoryTwinStateStore()

    def override_get_state_store() -> InMemoryTwinStateStore:
        return store

    previous_override = app.dependency_overrides.get(get_state_store)
    app.dependency_overrides[get_state_store] = override_get_state_store

    try:
        with TestClient(app) as client:
            yield client, store
    finally:
        if previous_override is None:
            app.dependency_overrides.pop(get_state_store, None)
        else:
            app.dependency_overrides[get_state_store] = previous_override


def _create_session(
    store: InMemoryTwinStateStore,
    *,
    latitude: float = 17.385,
    longitude: float = 78.4867,
) -> str:
    response = store.create_session(
        CreateSessionRequest(
            crop_type=CropType.TOMATO,
            planting_date=date(2026, 6, 1),
            location=Location(
                name="Weather Test Farm",
                latitude=latitude,
                longitude=longitude,
                elevation_m=542.0,
            ),
            soil_texture=SoilTexture.SANDY_LOAM,
        )
    )
    return response.state_id


def _snapshot(
    *,
    state_id: str = "",
    latitude: float = 17.385,
    longitude: float = 78.4867,
    target_date: date = TARGET_DATE,
) -> WeatherSnapshotResponse:
    return WeatherSnapshotResponse(
        state_id=state_id,
        target_date=target_date,
        source="open_meteo",
        source_timezone="Asia/Kolkata",
        latitude=latitude,
        longitude=longitude,
        tmin_c=21.5,
        tmax_c=32.25,
        humidity_pct=67.0,
        wind_speed_mps=2.55,
        wind_source_height_m=10.0,
        wind_normalized_height_m=2.0,
        rainfall_mm=4.2,
        shortwave_radiation_sum_mj_m2=19.75,
        eto_reference_feed=5.1,
        fetched_at=datetime(2026, 7, 10, 4, 30, tzinfo=timezone.utc),
    )


def _error(response) -> dict[str, Any]:
    return ErrorResponse.model_validate(response.json()).error.model_dump()


def test_weather_snapshot_route_uses_stored_session_location(
    client_and_store: tuple[TestClient, InMemoryTwinStateStore],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, store = client_and_store
    state_id = _create_session(store, latitude=12.34, longitude=56.78)
    called: dict[str, Any] = {}

    async def fake_fetch_daily_weather(
        *,
        latitude: float,
        longitude: float,
        target_date: date,
        timeout_s: float = 10.0,
    ) -> WeatherSnapshotResponse:
        called.update(
            {
                "latitude": latitude,
                "longitude": longitude,
                "target_date": target_date,
                "timeout_s": timeout_s,
            }
        )
        return _snapshot(latitude=latitude, longitude=longitude, target_date=target_date)

    monkeypatch.setattr(
        water_routes,
        "fetch_daily_weather",
        fake_fetch_daily_weather,
    )

    response = client.get(
        f"/sessions/{state_id}/weather-snapshot",
        params={"target_date": TARGET_DATE.isoformat()},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["state_id"] == state_id
    assert body["latitude"] == 12.34
    assert body["longitude"] == 56.78
    assert called == {
        "latitude": 12.34,
        "longitude": 56.78,
        "target_date": TARGET_DATE,
        "timeout_s": 10.0,
    }


def test_weather_snapshot_unknown_state_preserves_not_found_behaviour(
    client_and_store: tuple[TestClient, InMemoryTwinStateStore],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, _store = client_and_store

    async def fail_if_called(**_kwargs: object) -> WeatherSnapshotResponse:
        raise AssertionError("weather lookup should not run for an unknown state")

    monkeypatch.setattr(water_routes, "fetch_daily_weather", fail_if_called)

    response = client.get(
        "/sessions/missing/weather-snapshot",
        params={"target_date": TARGET_DATE.isoformat()},
    )

    assert response.status_code == 404
    assert _error(response)["code"] == "STATE_NOT_FOUND"


def test_weather_lookup_failure_maps_to_weather_lookup_failed(
    client_and_store: tuple[TestClient, InMemoryTwinStateStore],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, store = client_and_store
    state_id = _create_session(store)

    async def fake_fetch_daily_weather(**_kwargs: object) -> WeatherSnapshotResponse:
        raise WeatherClientError("missing requested date")

    monkeypatch.setattr(
        water_routes,
        "fetch_daily_weather",
        fake_fetch_daily_weather,
    )

    response = client.get(
        f"/sessions/{state_id}/weather-snapshot",
        params={"target_date": TARGET_DATE.isoformat()},
    )

    assert response.status_code == 502
    error = _error(response)
    assert error["code"] == "WEATHER_LOOKUP_FAILED"
    assert error["details"]["source"] == "open_meteo"


def test_invalid_weather_request_maps_to_invalid_weather_request(
    client_and_store: tuple[TestClient, InMemoryTwinStateStore],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, store = client_and_store
    state_id = _create_session(store)

    async def fake_fetch_daily_weather(**_kwargs: object) -> WeatherSnapshotResponse:
        raise AssertionError("weather lookup should not run for invalid date")

    monkeypatch.setattr(
        water_routes,
        "fetch_daily_weather",
        fake_fetch_daily_weather,
    )

    response = client.get(
        f"/sessions/{state_id}/weather-snapshot",
        params={"target_date": "not-a-date"},
    )

    assert response.status_code == 422
    assert _error(response)["code"] == "INVALID_WEATHER_REQUEST"


def test_weather_snapshot_route_does_not_mutate_store(
    client_and_store: tuple[TestClient, InMemoryTwinStateStore],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, store = client_and_store
    state_id = _create_session(store)
    before_count = store.count()
    before_record = store.get_record(state_id)

    async def fake_fetch_daily_weather(
        *,
        latitude: float,
        longitude: float,
        target_date: date,
        timeout_s: float = 10.0,
    ) -> WeatherSnapshotResponse:
        return _snapshot(latitude=latitude, longitude=longitude, target_date=target_date)

    monkeypatch.setattr(
        water_routes,
        "fetch_daily_weather",
        fake_fetch_daily_weather,
    )

    response = client.get(
        f"/sessions/{state_id}/weather-snapshot",
        params={"target_date": TARGET_DATE.isoformat()},
    )

    assert response.status_code == 200
    assert store.count() == before_count
    assert store.get_record(state_id) == before_record


def test_weather_lookup_is_not_wrapped_with_call_store_or_raise(
    client_and_store: tuple[TestClient, InMemoryTwinStateStore],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, store = client_and_store
    state_id = _create_session(store)
    seen_store_wrapped_functions: list[str] = []
    original_call_store_or_raise = water_routes.call_store_or_raise

    def spy_call_store_or_raise(func, *args, **kwargs):
        seen_store_wrapped_functions.append(getattr(func, "__name__", repr(func)))
        return original_call_store_or_raise(func, *args, **kwargs)

    async def fake_fetch_daily_weather(
        *,
        latitude: float,
        longitude: float,
        target_date: date,
        timeout_s: float = 10.0,
    ) -> WeatherSnapshotResponse:
        return _snapshot(latitude=latitude, longitude=longitude, target_date=target_date)

    monkeypatch.setattr(
        water_routes,
        "call_store_or_raise",
        spy_call_store_or_raise,
    )
    monkeypatch.setattr(
        water_routes,
        "fetch_daily_weather",
        fake_fetch_daily_weather,
    )

    response = client.get(
        f"/sessions/{state_id}/weather-snapshot",
        params={"target_date": TARGET_DATE.isoformat()},
    )

    assert response.status_code == 200
    assert seen_store_wrapped_functions == ["get_record"]
