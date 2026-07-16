from __future__ import annotations

from datetime import date
import os
from typing import Any

import httpx


DEFAULT_API_BASE_URL = os.getenv("CROPTWIN_API_BASE_URL", "http://127.0.0.1:8000")
DEFAULT_TIMEOUT_SECONDS = 30.0
DISEASE_TIMEOUT_SECONDS = 120.0
DISEASE_MODEL_VERSION = "1.0"


class CropTwinAPIError(Exception):
    """Normalized frontend-facing error for CropTwin API failures."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        code: str = "API_ERROR",
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code
        self.details = details or {}


class CropTwinAPIClient:
    def __init__(
        self,
        base_url: str | None = None,
        *,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        disease_timeout: float = DISEASE_TIMEOUT_SECONDS,
        client: httpx.Client | None = None,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.base_url = _normalize_base_url(base_url or DEFAULT_API_BASE_URL)
        self._timeout = timeout
        self._disease_timeout = disease_timeout
        self._owns_client = client is None
        self._client = client or httpx.Client(
            base_url=self.base_url,
            timeout=timeout,
            transport=transport,
        )

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def __enter__(self) -> CropTwinAPIClient:
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.close()

    def health(self) -> dict[str, Any]:
        return self._request("GET", "/health")

    def system_info(self) -> dict[str, Any]:
        return self._request("GET", "/system-info")

    def create_session(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", "/sessions", json=payload)

    def get_session(self, state_id: str) -> dict[str, Any]:
        return self._request("GET", f"/sessions/{state_id}")

    def get_history(self, state_id: str) -> dict[str, Any]:
        return self._request("GET", f"/sessions/{state_id}/history")

    def predict_disease(
        self,
        state_id: str,
        image_base64: str,
        *,
        model_version: str = DISEASE_MODEL_VERSION,
    ) -> dict[str, Any]:
        return self._request(
            "POST",
            f"/sessions/{state_id}/predict-disease",
            json={
                "state_id": state_id,
                "image_base64": image_base64,
                "model_version": model_version,
            },
            timeout=self._disease_timeout,
        )

    def compute_water_state(
        self,
        state_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"state_id": state_id, **payload}
        return self._request(
            "POST",
            f"/sessions/{state_id}/compute-water-state",
            json=body,
        )

    def get_weather_snapshot(
        self,
        state_id: str,
        target_date: date | str,
    ) -> dict[str, Any]:
        target_date_value = (
            target_date.isoformat()
            if isinstance(target_date, date)
            else str(target_date)
        )
        return self._request(
            "GET",
            f"/sessions/{state_id}/weather-snapshot",
            params={"target_date": target_date_value},
        )

    def update_twin_state(self, state_id: str) -> dict[str, Any]:
        return self._request(
            "POST",
            f"/sessions/{state_id}/update-twin-state",
            json={"state_id": state_id},
        )

    def simulate_actions(self, state_id: str, actions: list[str]) -> dict[str, Any]:
        return self._request(
            "POST",
            f"/sessions/{state_id}/simulate-actions",
            json={"state_id": state_id, "actions": actions},
        )

    def recommend(self, state_id: str) -> dict[str, Any]:
        return self._request("POST", f"/sessions/{state_id}/recommend")

    def narrate(self, state_id: str) -> dict[str, Any]:
        return self._request("POST", f"/sessions/{state_id}/narrate")

    def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
        timeout: float | None = None,
    ) -> dict[str, Any]:
        try:
            response = self._client.request(
                method,
                path,
                json=json,
                params=params,
                timeout=timeout or self._timeout,
            )
        except httpx.TimeoutException as exc:
            raise CropTwinAPIError(
                "The CropTwin API request timed out.",
                code="REQUEST_TIMEOUT",
                details=_redact_sensitive({"request": json, "params": params}),
            ) from exc
        except httpx.ConnectError as exc:
            raise CropTwinAPIError(
                "Could not connect to the CropTwin API.",
                code="CONNECTION_ERROR",
                details=_redact_sensitive({"request": json, "params": params}),
            ) from exc
        except httpx.RequestError as exc:
            raise CropTwinAPIError(
                "The CropTwin API request failed.",
                code="REQUEST_ERROR",
                details=_redact_sensitive(
                    {"error": str(exc), "request": json, "params": params}
                ),
            ) from exc

        if response.status_code >= 400:
            self._raise_for_error_response(response)

        try:
            parsed = response.json()
        except ValueError as exc:
            raise CropTwinAPIError(
                "The CropTwin API returned a non-JSON response.",
                status_code=response.status_code,
                code="NON_JSON_RESPONSE",
            ) from exc

        if not isinstance(parsed, dict):
            raise CropTwinAPIError(
                "The CropTwin API returned an unexpected response shape.",
                status_code=response.status_code,
                code="UNEXPECTED_RESPONSE",
                details={"response_type": type(parsed).__name__},
            )
        return parsed

    def _raise_for_error_response(self, response: httpx.Response) -> None:
        try:
            parsed = response.json()
        except ValueError as exc:
            raise CropTwinAPIError(
                f"Server returned HTTP {response.status_code}.",
                status_code=response.status_code,
                code="HTTP_ERROR",
            ) from exc

        if isinstance(parsed, dict) and isinstance(parsed.get("error"), dict):
            error = parsed["error"]
            message = str(error.get("message") or f"Server returned HTTP {response.status_code}.")
            code = str(error.get("code") or "API_ERROR")
            details = error.get("details")
            raise CropTwinAPIError(
                message,
                status_code=response.status_code,
                code=code,
                details=_redact_sensitive(details if isinstance(details, dict) else {}),
            )

        if isinstance(parsed, dict) and "detail" in parsed:
            raise CropTwinAPIError(
                "Request validation failed.",
                status_code=response.status_code,
                code="FASTAPI_VALIDATION_ERROR",
                details=_redact_sensitive({"detail": parsed["detail"]}),
            )

        raise CropTwinAPIError(
            f"Server returned HTTP {response.status_code}.",
            status_code=response.status_code,
            code="HTTP_ERROR",
            details=_redact_sensitive(parsed if isinstance(parsed, dict) else {}),
        )


def _normalize_base_url(base_url: str) -> str:
    normalized = base_url.strip().rstrip("/")
    if not normalized:
        return DEFAULT_API_BASE_URL
    return normalized


def _redact_sensitive(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: "[redacted]" if key == "image_base64" else _redact_sensitive(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_redact_sensitive(item) for item in value]
    return value
