from __future__ import annotations

import asyncio
from datetime import date
import json
import math
from typing import Any

import httpx
import pytest

from app.external import weather_client
from app.external.weather_client import (
    WeatherClientError,
    convert_wind_speed_to_2m,
    fetch_daily_weather,
)


TARGET_DATE = date(2026, 7, 10)


class FakeAsyncClient:
    response: httpx.Response | None = None
    exception: Exception | None = None
    calls: list[dict[str, Any]] = []

    def __init__(self, *, timeout: float) -> None:
        self.timeout = timeout

    async def __aenter__(self) -> FakeAsyncClient:
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        return None

    async def get(self, url: str, *, params: dict[str, Any]) -> httpx.Response:
        self.calls.append(
            {
                "url": url,
                "params": params,
                "timeout": self.timeout,
            }
        )
        if self.exception is not None:
            raise self.exception
        assert self.response is not None
        return self.response


def _install_fake_async_client(
    monkeypatch: pytest.MonkeyPatch,
    *,
    payload: dict[str, Any] | None = None,
    response: httpx.Response | None = None,
    exception: Exception | None = None,
) -> list[dict[str, Any]]:
    FakeAsyncClient.calls = []
    FakeAsyncClient.exception = exception
    if response is not None:
        FakeAsyncClient.response = response
    else:
        FakeAsyncClient.response = httpx.Response(
            200,
            content=json.dumps(payload or _payload(), allow_nan=True).encode("utf-8"),
            headers={"content-type": "application/json"},
            request=httpx.Request("GET", weather_client.OPEN_METEO_FORECAST_URL),
        )
    monkeypatch.setattr(weather_client.httpx, "AsyncClient", FakeAsyncClient)
    return FakeAsyncClient.calls


def _payload(
    *,
    target_date: str = TARGET_DATE.isoformat(),
    daily_overrides: dict[str, Any] | None = None,
) -> dict[str, Any]:
    daily: dict[str, Any] = {
        "time": [target_date],
        "temperature_2m_min": [21.5],
        "temperature_2m_max": [32.25],
        "relative_humidity_2m_mean": [67.0],
        "precipitation_sum": [4.2],
        "shortwave_radiation_sum": [19.75],
        "wind_speed_10m_mean": [3.4],
        "et0_fao_evapotranspiration": [5.1],
    }
    if daily_overrides:
        for key, value in daily_overrides.items():
            if value is _MISSING:
                daily.pop(key, None)
            else:
                daily[key] = value

    return {
        "timezone": "Asia/Kolkata",
        "daily": daily,
    }


class _Missing:
    pass


_MISSING = _Missing()


def _fetch() -> Any:
    return fetch_daily_weather(
        latitude=17.385,
        longitude=78.4867,
        target_date=TARGET_DATE,
    )


def test_fetch_daily_weather_parses_successful_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = _install_fake_async_client(monkeypatch)

    snapshot = asyncio.run(_fetch())

    assert snapshot.source == "open_meteo"
    assert snapshot.source_timezone == "Asia/Kolkata"
    assert snapshot.target_date == TARGET_DATE
    assert snapshot.latitude == 17.385
    assert snapshot.longitude == 78.4867
    assert calls[0]["url"] == weather_client.OPEN_METEO_FORECAST_URL
    assert calls[0]["params"]["start_date"] == TARGET_DATE.isoformat()
    assert calls[0]["params"]["end_date"] == TARGET_DATE.isoformat()
    assert calls[0]["params"]["timezone"] == "auto"
    assert calls[0]["params"]["wind_speed_unit"] == "ms"


def test_fetch_daily_weather_maps_every_daily_field(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_fake_async_client(monkeypatch)

    snapshot = asyncio.run(_fetch())

    assert snapshot.tmin_c == 21.5
    assert snapshot.tmax_c == 32.25
    assert snapshot.humidity_pct == 67.0
    assert snapshot.rainfall_mm == 4.2
    assert snapshot.shortwave_radiation_sum_mj_m2 == 19.75
    assert snapshot.wind_source_height_m == 10.0
    assert snapshot.wind_normalized_height_m == 2.0
    assert snapshot.eto_reference_feed == 5.1


def test_convert_wind_speed_to_2m_uses_fao_log_normalization() -> None:
    result = convert_wind_speed_to_2m(
        wind_speed_mps=3.4,
        measurement_height_m=10.0,
    )

    expected = 3.4 * 4.87 / math.log((67.8 * 10.0) - 5.42)
    assert result == pytest.approx(expected)


def test_invalid_latitude_and_longitude_are_rejected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = _install_fake_async_client(monkeypatch)

    with pytest.raises(ValueError, match="latitude"):
        asyncio.run(
            fetch_daily_weather(
                latitude=91.0,
                longitude=78.4867,
                target_date=TARGET_DATE,
            )
        )
    with pytest.raises(ValueError, match="longitude"):
        asyncio.run(
            fetch_daily_weather(
                latitude=17.385,
                longitude=-181.0,
                target_date=TARGET_DATE,
            )
        )

    assert calls == []


def test_invalid_timeout_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _install_fake_async_client(monkeypatch)

    with pytest.raises(ValueError, match="timeout_s"):
        asyncio.run(
            fetch_daily_weather(
                latitude=17.385,
                longitude=78.4867,
                target_date=TARGET_DATE,
                timeout_s=0.0,
            )
        )

    assert calls == []


def test_missing_daily_arrays_raise_explicit_weather_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_fake_async_client(
        monkeypatch,
        payload=_payload(daily_overrides={"shortwave_radiation_sum": _MISSING}),
    )

    with pytest.raises(WeatherClientError, match="shortwave_radiation_sum"):
        asyncio.run(_fetch())


def test_null_daily_values_raise_explicit_weather_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_fake_async_client(
        monkeypatch,
        payload=_payload(daily_overrides={"precipitation_sum": [None]}),
    )

    with pytest.raises(WeatherClientError, match="precipitation_sum"):
        asyncio.run(_fetch())


def test_non_finite_daily_values_raise_explicit_weather_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_fake_async_client(
        monkeypatch,
        payload=_payload(daily_overrides={"wind_speed_10m_mean": [math.inf]}),
    )

    with pytest.raises(WeatherClientError, match="wind_speed_10m_mean"):
        asyncio.run(_fetch())


def test_mismatched_target_date_raises_weather_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_fake_async_client(
        monkeypatch,
        payload=_payload(target_date="2026-07-11"),
    )

    with pytest.raises(WeatherClientError, match="matching date"):
        asyncio.run(_fetch())


def test_http_status_failure_maps_to_weather_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    response = httpx.Response(
        503,
        json={"reason": "upstream unavailable"},
        request=httpx.Request("GET", weather_client.OPEN_METEO_FORECAST_URL),
    )
    _install_fake_async_client(monkeypatch, response=response)

    with pytest.raises(WeatherClientError, match="HTTP 503"):
        asyncio.run(_fetch())


def test_timeout_failure_maps_to_weather_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_fake_async_client(
        monkeypatch,
        exception=httpx.TimeoutException("slow"),
    )

    with pytest.raises(WeatherClientError, match="timed out"):
        asyncio.run(_fetch())
