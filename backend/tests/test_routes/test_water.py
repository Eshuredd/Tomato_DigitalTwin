from __future__ import annotations

from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
import threading
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_state_store
from app.external.weather_client import WeatherClientError
from app.main import app
from app.persistence.sqlalchemy_store import SQLAlchemyTwinStateStore
from app.routes import water as water_routes
from app.schemas import (
    ComputeWaterStateRequest,
    CreateSessionRequest,
    CropType,
    ErrorResponse,
    IrrigationEventSource,
    LastIrrigationEvent,
    Location,
    SoilTexture,
    WeatherInput,
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


def test_compute_water_state_concurrent_event_application_conflict_maps_409(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'api-event-race.db'}"
    setup_store = SQLAlchemyTwinStateStore(database_url=database_url, auto_create=True)
    session = setup_store.create_session(
        CreateSessionRequest(
            crop_type=CropType.TOMATO,
            planting_date=date(2026, 6, 1),
            location=Location(
                name="API Race Farm",
                latitude=17.385,
                longitude=78.4867,
                elevation_m=542.0,
            ),
            soil_texture=SoilTexture.SANDY_LOAM,
        ),
        state_id="state-api-race",
    )

    def override_get_state_store() -> SQLAlchemyTwinStateStore:
        return SQLAlchemyTwinStateStore(
            database_url=database_url,
            auto_create=False,
        )

    previous_override = app.dependency_overrides.get(get_state_store)
    app.dependency_overrides[get_state_store] = override_get_state_store

    original_compute = water_routes.compute_water_state_domain
    barrier = threading.Barrier(2)
    wait_enabled = [True]

    def synchronized_compute_water_state(*args, **kwargs):
        result = original_compute(*args, **kwargs)
        if wait_enabled[0]:
            barrier.wait(timeout=10)
        return result

    monkeypatch.setattr(
        water_routes,
        "compute_water_state_domain",
        synchronized_compute_water_state,
    )

    event = LastIrrigationEvent(
        irrigation_event_id="api-race-event",
        timestamp=datetime(2026, 7, 9, 8, 0, tzinfo=timezone.utc),
        amount_mm=8.0,
        source=IrrigationEventSource.MANUAL,
    )
    weather = WeatherInput(
        tmin_c=22.0,
        tmax_c=31.0,
        humidity_pct=62.0,
        wind_speed_mps=2.1,
        shortwave_radiation_sum_mj_m2=18.5,
        rainfall_mm=0.5,
        eto_reference_feed=4.9,
    )

    def payload(update_id: str, observed_at: datetime | None = None) -> dict[str, Any]:
        return ComputeWaterStateRequest(
            state_id=session.state_id,
            water_update_id=update_id,
            current_date=TARGET_DATE,
            weather=weather,
            last_irrigation_event=event,
            observed_at=observed_at,
        ).model_dump(mode="json")

    def worker(update_id: str):
        with TestClient(app) as client:
            return update_id, client.post(
                f"/sessions/{session.state_id}/compute-water-state",
                json=payload(update_id),
            )

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(
                executor.map(worker, ["api-update-a", "api-update-b"])
            )
    finally:
        wait_enabled[0] = False
        if previous_override is None:
            app.dependency_overrides.pop(get_state_store, None)
        else:
            app.dependency_overrides[get_state_store] = previous_override

    statuses = sorted(response.status_code for _update_id, response in results)
    assert statuses == [200, 409]
    conflict_update_id = next(
        update_id
        for update_id, response in results
        if response.status_code == 409
    )
    conflict_response = next(
        response
        for _update_id, response in results
        if response.status_code == 409
    )
    error = _error(conflict_response)
    assert error["status_code"] == 409
    assert error["code"] == "IRRIGATION_EVENT_APPLICATION_CONFLICT"

    app.dependency_overrides[get_state_store] = override_get_state_store
    monkeypatch.setattr(water_routes, "compute_water_state_domain", original_compute)
    try:
            with TestClient(app) as client:
                retry = client.post(
                    f"/sessions/{session.state_id}/compute-water-state",
                    json=payload(
                        conflict_update_id,
                        datetime(2026, 7, 10, 1, 0, tzinfo=timezone.utc),
                    ),
                )
    finally:
        if previous_override is None:
            app.dependency_overrides.pop(get_state_store, None)
        else:
            app.dependency_overrides[get_state_store] = previous_override

    assert retry.status_code == 200
    body = retry.json()
    assert body["water_update_id"] == conflict_update_id
    assert body["reported_irrigation_event_id"] == "api-race-event"
    assert body["applied_irrigation_event_id"] is None
    assert body["effective_irrigation_mm"] == pytest.approx(0.0)
    assert body["irrigation_event_already_accounted_for"] is True
