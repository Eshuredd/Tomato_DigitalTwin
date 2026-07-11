from __future__ import annotations

import math

import httpx


class ElevationClientError(Exception):
    """Raised when elevation lookup fails due to network, API, or response issues."""

    def __init__(self, message: str) -> None:
        super().__init__(message)


def validate_coordinates(latitude: float, longitude: float) -> None:
    """Validate latitude and longitude for Open-Meteo elevation lookup."""
    if not math.isfinite(latitude):
        raise ValueError("latitude must be a finite number.")
    if not math.isfinite(longitude):
        raise ValueError("longitude must be a finite number.")
    if latitude < -90.0 or latitude > 90.0:
        raise ValueError("latitude must be between -90 and 90 inclusive.")
    if longitude < -180.0 or longitude > 180.0:
        raise ValueError("longitude must be between -180 and 180 inclusive.")


async def fetch_elevation_m(
    latitude: float,
    longitude: float,
    *,
    timeout_s: float = 10.0,
) -> float:
    """Fetch elevation in meters from the Open-Meteo elevation API."""
    validate_coordinates(latitude, longitude)

    if not math.isfinite(timeout_s) or timeout_s <= 0.0:
        raise ValueError("timeout_s must be a finite number greater than 0.")

    url = "https://api.open-meteo.com/v1/elevation"

    try:
        async with httpx.AsyncClient(timeout=timeout_s) as client:
            response = await client.get(
                url,
                params={"latitude": latitude, "longitude": longitude},
            )

            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                reason = None
                try:
                    body = exc.response.json()
                    if isinstance(body, dict):
                        reason = body.get("reason")
                except ValueError:
                    reason = None

                if reason:
                    raise ElevationClientError(
                        f"Elevation lookup failed: {reason}"
                    ) from exc

                raise ElevationClientError(
                    f"Elevation lookup failed with status {exc.response.status_code}."
                ) from exc

            try:
                data = response.json()
            except ValueError as exc:
                raise ElevationClientError("Elevation response is not valid JSON.") from exc

    except httpx.HTTPError as exc:
        raise ElevationClientError(f"Elevation lookup failed: {exc}") from exc

    if not isinstance(data, dict):
        raise ElevationClientError("Elevation response has unexpected shape.")

    elevation_values = data.get("elevation")
    if not isinstance(elevation_values, list):
        raise ElevationClientError("Elevation response missing elevation list.")
    if len(elevation_values) == 0:
        raise ElevationClientError("Elevation response contains no elevation values.")

    first_value = elevation_values[0]
    if first_value is None or isinstance(first_value, bool):
        raise ElevationClientError("Elevation value is missing or invalid.")
    if not isinstance(first_value, (int, float)):
        raise ElevationClientError("Elevation value is not numeric.")

    elevation = float(first_value)
    if not math.isfinite(elevation):
        raise ElevationClientError("Elevation value must be finite.")

    return elevation