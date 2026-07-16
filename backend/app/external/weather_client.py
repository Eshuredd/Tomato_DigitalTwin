from __future__ import annotations

from datetime import date, datetime, timezone
import math
from typing import Any

import httpx

from app.schemas import WeatherSnapshotResponse


OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_SOURCE = "open_meteo"
OPEN_METEO_WIND_SOURCE_HEIGHT_M = 10.0
WIND_NORMALIZED_HEIGHT_M = 2.0

DAILY_VARIABLES = (
    "temperature_2m_min",
    "temperature_2m_max",
    "relative_humidity_2m_mean",
    "precipitation_sum",
    "shortwave_radiation_sum",
    "wind_speed_10m_mean",
    "et0_fao_evapotranspiration",
)


class WeatherClientError(Exception):
    """Raised when weather lookup fails due to network, API, or payload issues."""


def _is_finite_number(value: object) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )


def _validate_finite_number(name: str, value: object) -> float:
    if not _is_finite_number(value):
        raise ValueError(f"{name} must be a finite number.")
    return float(value)


def _validate_non_negative_payload_number(name: str, value: object) -> float:
    result = _validate_payload_number(name, value)
    if result < 0.0:
        raise WeatherClientError(f"{name} must be non-negative.")
    return result


def _validate_payload_number(name: str, value: object) -> float:
    if value is None:
        raise WeatherClientError(f"{name} is missing.")
    if not _is_finite_number(value):
        raise WeatherClientError(f"{name} must be a finite number.")
    return float(value)


def validate_coordinates(latitude: float, longitude: float) -> None:
    if not math.isfinite(latitude):
        raise ValueError("latitude must be a finite number.")
    if not math.isfinite(longitude):
        raise ValueError("longitude must be a finite number.")
    if latitude < -90.0 or latitude > 90.0:
        raise ValueError("latitude must be between -90 and 90 inclusive.")
    if longitude < -180.0 or longitude > 180.0:
        raise ValueError("longitude must be between -180 and 180 inclusive.")


def convert_wind_speed_to_2m(
    *,
    wind_speed_mps: float,
    measurement_height_m: float,
) -> float:
    wind_speed = _validate_finite_number("wind_speed_mps", wind_speed_mps)
    if wind_speed < 0.0:
        raise ValueError("wind_speed_mps must be >= 0.")

    measurement_height = _validate_finite_number(
        "measurement_height_m",
        measurement_height_m,
    )
    if measurement_height <= 0.0:
        raise ValueError("measurement_height_m must be greater than 0.")

    log_argument = (67.8 * measurement_height) - 5.42
    if log_argument <= 0.0:
        raise ValueError("measurement_height_m creates an invalid log domain.")

    denominator = math.log(log_argument)
    if not math.isfinite(denominator) or denominator == 0.0:
        raise ValueError("measurement_height_m creates an invalid wind normalization denominator.")

    normalized = wind_speed * 4.87 / denominator
    if not math.isfinite(normalized):
        raise ValueError("normalized wind speed must be finite.")
    return normalized


async def fetch_daily_weather(
    *,
    latitude: float,
    longitude: float,
    target_date: date,
    timeout_s: float = 10.0,
) -> WeatherSnapshotResponse:
    latitude_value = _validate_finite_number("latitude", latitude)
    longitude_value = _validate_finite_number("longitude", longitude)
    validate_coordinates(latitude_value, longitude_value)

    if not isinstance(target_date, date):
        raise ValueError("target_date must be a date.")

    timeout_value = _validate_finite_number("timeout_s", timeout_s)
    if timeout_value <= 0.0:
        raise ValueError("timeout_s must be a finite number greater than 0.")

    target_date_iso = target_date.isoformat()
    params = {
        "latitude": latitude_value,
        "longitude": longitude_value,
        "start_date": target_date_iso,
        "end_date": target_date_iso,
        "daily": ",".join(DAILY_VARIABLES),
        "timezone": "auto",
        "wind_speed_unit": "ms",
        "temperature_unit": "celsius",
        "precipitation_unit": "mm",
    }

    try:
        async with httpx.AsyncClient(timeout=timeout_value) as client:
            response = await client.get(OPEN_METEO_FORECAST_URL, params=params)
            response.raise_for_status()
            payload = response.json()
    except httpx.TimeoutException as exc:
        raise WeatherClientError("Weather lookup timed out.") from exc
    except httpx.HTTPStatusError as exc:
        raise WeatherClientError(
            f"Weather lookup failed with HTTP {exc.response.status_code}."
        ) from exc
    except httpx.RequestError as exc:
        raise WeatherClientError("Weather lookup request failed.") from exc
    except ValueError as exc:
        raise WeatherClientError("Weather response is not valid JSON.") from exc

    return _parse_daily_weather_payload(
        payload=payload,
        latitude=latitude_value,
        longitude=longitude_value,
        target_date=target_date,
    )


def _parse_daily_weather_payload(
    *,
    payload: Any,
    latitude: float,
    longitude: float,
    target_date: date,
) -> WeatherSnapshotResponse:
    if not isinstance(payload, dict):
        raise WeatherClientError("Weather response has unexpected shape.")

    source_timezone = payload.get("timezone")
    if not isinstance(source_timezone, str) or not source_timezone.strip():
        raise WeatherClientError("Weather response missing source timezone.")

    daily = payload.get("daily")
    if not isinstance(daily, dict):
        raise WeatherClientError("Weather response missing daily data.")

    times = daily.get("time")
    target_date_iso = target_date.isoformat()
    if not isinstance(times, list):
        raise WeatherClientError("Weather response missing daily time array.")
    if times != [target_date_iso]:
        raise WeatherClientError("Weather response does not contain exactly one matching date.")

    tmin_c = _daily_value(daily, "temperature_2m_min", 0)
    tmax_c = _daily_value(daily, "temperature_2m_max", 0)
    humidity_pct = _daily_value(daily, "relative_humidity_2m_mean", 0)
    rainfall_mm = _daily_value(daily, "precipitation_sum", 0)
    shortwave = _daily_value(daily, "shortwave_radiation_sum", 0)
    wind_speed_10m = _daily_value(daily, "wind_speed_10m_mean", 0)
    eto_reference_feed = _daily_value(daily, "et0_fao_evapotranspiration", 0)

    if tmax_c < tmin_c:
        raise WeatherClientError("temperature_2m_max must be >= temperature_2m_min.")
    if humidity_pct < 0.0 or humidity_pct > 100.0:
        raise WeatherClientError("relative_humidity_2m_mean must be between 0 and 100.")

    rainfall_mm = _ensure_non_negative("precipitation_sum", rainfall_mm)
    shortwave = _ensure_non_negative("shortwave_radiation_sum", shortwave)
    wind_speed_10m = _ensure_non_negative("wind_speed_10m_mean", wind_speed_10m)
    eto_reference_feed = _ensure_non_negative(
        "et0_fao_evapotranspiration",
        eto_reference_feed,
    )

    try:
        wind_speed_2m = convert_wind_speed_to_2m(
            wind_speed_mps=wind_speed_10m,
            measurement_height_m=OPEN_METEO_WIND_SOURCE_HEIGHT_M,
        )
    except ValueError as exc:
        raise WeatherClientError(str(exc)) from exc

    return WeatherSnapshotResponse(
        state_id="",
        target_date=target_date,
        source=OPEN_METEO_SOURCE,
        source_timezone=source_timezone,
        latitude=latitude,
        longitude=longitude,
        tmin_c=tmin_c,
        tmax_c=tmax_c,
        humidity_pct=humidity_pct,
        wind_speed_mps=wind_speed_2m,
        wind_source_height_m=OPEN_METEO_WIND_SOURCE_HEIGHT_M,
        wind_normalized_height_m=WIND_NORMALIZED_HEIGHT_M,
        rainfall_mm=rainfall_mm,
        shortwave_radiation_sum_mj_m2=shortwave,
        eto_reference_feed=eto_reference_feed,
        fetched_at=datetime.now(timezone.utc),
    )


def _daily_value(daily: dict[str, Any], name: str, index: int) -> float:
    values = daily.get(name)
    if not isinstance(values, list):
        raise WeatherClientError(f"Weather response missing daily array: {name}.")
    if len(values) <= index:
        raise WeatherClientError(f"Weather response missing value for: {name}.")
    return _validate_payload_number(name, values[index])


def _ensure_non_negative(name: str, value: float) -> float:
    return _validate_non_negative_payload_number(name, value)
