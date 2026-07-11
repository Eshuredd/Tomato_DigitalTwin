from __future__ import annotations

from functools import lru_cache
from typing import Any, Callable, NoReturn, TypeVar

from fastapi import Depends, Request
from fastapi.responses import JSONResponse

from app.disease.model import DiseasePredictor, TorchTomatoDiseasePredictor
from app.schemas import (
    ErrorDetail,
    ErrorResponse,
    RecommendationResponse,
    SimulateActionsResponse,
    TwinCurrentState,
)
from app.state_store import (
    InMemoryTwinStateStore,
    IncompleteStateError,
    MissingCachedOutputError,
    StateNotFoundError,
    TwinSessionRecord,
    state_store,
)

_R = TypeVar("_R")


class TwinAPIException(Exception):
    def __init__(
        self,
        *,
        status_code: int,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or {}
        super().__init__(message)


def build_error_response(
    *,
    code: str,
    message: str,
    details: dict[str, Any] | None = None,
) -> ErrorResponse:
    return ErrorResponse(
        error=ErrorDetail(code=code, message=message, details=details or {}),
    )


async def twin_api_exception_handler(
    _request: Request,
    exc: TwinAPIException,
) -> JSONResponse:
    error_response = build_error_response(
        code=exc.code,
        message=exc.message,
        details=exc.details,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=error_response.model_dump(mode="json"),
    )


def raise_api_error(
    *,
    status_code: int,
    code: str,
    message: str,
    details: dict[str, Any] | None = None,
) -> NoReturn:
    raise TwinAPIException(
        status_code=status_code,
        code=code,
        message=message,
        details=details,
    )


def get_state_store() -> InMemoryTwinStateStore:
    return state_store


@lru_cache(maxsize=1)
def get_disease_predictor() -> DiseasePredictor:
    return TorchTomatoDiseasePredictor()


def raise_from_store_error(exc: Exception) -> NoReturn:
    if isinstance(exc, StateNotFoundError):
        raise_api_error(
            status_code=404,
            code="STATE_NOT_FOUND",
            message=str(exc),
            details={},
        )

    if isinstance(exc, IncompleteStateError):
        raise_api_error(
            status_code=409,
            code="INCOMPLETE_STATE",
            message=str(exc),
            details={"missing": exc.missing},
        )

    if isinstance(exc, MissingCachedOutputError):
        raise_api_error(
            status_code=409,
            code="MISSING_CACHED_OUTPUT",
            message=str(exc),
            details={},
        )

    if isinstance(exc, ValueError):
        raise_api_error(
            status_code=422,
            code="STATE_ID_MISMATCH",
            message=str(exc),
            details={},
        )

    raise exc


def call_store_or_raise(
    func: Callable[..., _R],
    *args: Any,
    **kwargs: Any,
) -> _R:
    try:
        return func(*args, **kwargs)
    except Exception as exc:
        raise_from_store_error(exc)


def get_twin_record(
    state_id: str,
    store: InMemoryTwinStateStore = Depends(get_state_store),
) -> TwinSessionRecord:
    return call_store_or_raise(store.get_record, state_id)


def get_twin_current_state(
    state_id: str,
    store: InMemoryTwinStateStore = Depends(get_state_store),
) -> TwinCurrentState:
    return call_store_or_raise(store.get_current_state, state_id)


def get_twin_latest_simulation(
    state_id: str,
    store: InMemoryTwinStateStore = Depends(get_state_store),
) -> SimulateActionsResponse:
    return call_store_or_raise(store.get_latest_simulation, state_id)


def get_twin_latest_recommendation(
    state_id: str,
    store: InMemoryTwinStateStore = Depends(get_state_store),
) -> RecommendationResponse:
    return call_store_or_raise(store.get_latest_recommendation, state_id)
