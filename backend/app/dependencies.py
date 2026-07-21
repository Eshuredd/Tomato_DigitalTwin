from __future__ import annotations

from functools import lru_cache
import logging
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
    DuplicateActualActionError,
    DuplicateIrrigationEventApplicationError,
    IncompleteStateError,
    IrrigationEventPayloadConflictError,
    IrrigationEventStateMismatchError,
    MissingCachedOutputError,
    PersistenceIntegrityError,
    RecommendationStateMismatchError,
    RelatedRecommendationNotFoundError,
    StateNotFoundError,
    TwinSessionRecord,
    state_store,
    WaterUpdateConcurrencyConflictError,
    WaterUpdatePayloadConflictError,
)
from app.store_protocol import TwinStateStore

_R = TypeVar("_R")
_sqlalchemy_state_store: TwinStateStore | None = None
logger = logging.getLogger(__name__)


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
    status_code: int | None = None,
    code: str,
    message: str,
    details: dict[str, Any] | None = None,
) -> ErrorResponse:
    return ErrorResponse(
        error=ErrorDetail(
            status_code=status_code,
            code=code,
            message=message,
            details=details or {},
        ),
    )


async def twin_api_exception_handler(
    _request: Request,
    exc: TwinAPIException,
) -> JSONResponse:
    error_response = build_error_response(
        status_code=exc.status_code,
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


def _build_sqlalchemy_state_store(*, initialize_schema: bool) -> TwinStateStore:
    from app.persistence.config import get_persistence_settings
    from app.persistence.sqlalchemy_store import SQLAlchemyTwinStateStore

    settings = get_persistence_settings()
    store = SQLAlchemyTwinStateStore(
        database_url=settings.database_url,
        auto_create=initialize_schema and settings.auto_create_db,
    )
    return store


def initialize_state_store() -> TwinStateStore:
    global _sqlalchemy_state_store

    from app.persistence.config import (
        get_persistence_settings,
        persistence_startup_summary,
    )

    settings = get_persistence_settings()
    logger.info(persistence_startup_summary(settings))
    if settings.normalized_state_store == "memory":
        return state_store

    if _sqlalchemy_state_store is None:
        _sqlalchemy_state_store = _build_sqlalchemy_state_store(
            initialize_schema=True,
        )
    else:
        from app.persistence.sqlalchemy_store import SQLAlchemyTwinStateStore

        if settings.auto_create_db and isinstance(
            _sqlalchemy_state_store,
            SQLAlchemyTwinStateStore,
        ):
            _sqlalchemy_state_store.create_schema()
    return _sqlalchemy_state_store


def get_state_store() -> TwinStateStore:
    global _sqlalchemy_state_store

    from app.persistence.config import get_persistence_settings

    settings = get_persistence_settings()
    if settings.normalized_state_store == "memory":
        return state_store

    if _sqlalchemy_state_store is None:
        _sqlalchemy_state_store = _build_sqlalchemy_state_store(
            initialize_schema=False,
        )
    return _sqlalchemy_state_store


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

    if isinstance(exc, DuplicateIrrigationEventApplicationError):
        raise_api_error(
            status_code=409,
            code="IRRIGATION_EVENT_ALREADY_APPLIED",
            message=str(exc),
            details={"irrigation_event_id": exc.irrigation_event_id},
        )

    if isinstance(exc, WaterUpdatePayloadConflictError):
        raise_api_error(
            status_code=409,
            code="WATER_UPDATE_CONFLICT",
            message=str(exc),
            details={
                "state_id": exc.state_id,
                "water_update_id": exc.water_update_id,
                "existing_fingerprint_prefix": exc.existing_fingerprint_prefix,
                "request_fingerprint_prefix": exc.request_fingerprint_prefix,
            },
        )

    if isinstance(exc, WaterUpdateConcurrencyConflictError):
        raise_api_error(
            status_code=409,
            code="IRRIGATION_EVENT_APPLICATION_CONFLICT",
            message=str(exc),
            details={
                "state_id": exc.state_id,
                "irrigation_event_id": exc.irrigation_event_id,
            },
        )

    if isinstance(exc, IrrigationEventStateMismatchError):
        raise_api_error(
            status_code=422,
            code="IRRIGATION_EVENT_STATE_MISMATCH",
            message=str(exc),
            details={
                "irrigation_event_id": exc.irrigation_event_id,
                "expected_state_id": exc.expected_state_id,
                "actual_state_id": exc.actual_state_id,
            },
        )

    if isinstance(exc, IrrigationEventPayloadConflictError):
        raise_api_error(
            status_code=409,
            code="IRRIGATION_EVENT_PAYLOAD_CONFLICT",
            message=str(exc),
            details={
                "irrigation_event_id": exc.irrigation_event_id,
                "field": exc.field,
            },
        )

    if isinstance(exc, RelatedRecommendationNotFoundError):
        raise_api_error(
            status_code=422,
            code="RELATED_RECOMMENDATION_NOT_FOUND",
            message=str(exc),
            details={"recommendation_id": exc.recommendation_id},
        )

    if isinstance(exc, RecommendationStateMismatchError):
        raise_api_error(
            status_code=422,
            code="RECOMMENDATION_STATE_MISMATCH",
            message=str(exc),
            details={
                "recommendation_id": exc.recommendation_id,
                "expected_state_id": exc.expected_state_id,
                "actual_state_id": exc.actual_state_id,
            },
        )

    if isinstance(exc, DuplicateActualActionError):
        raise_api_error(
            status_code=409,
            code="DUPLICATE_ACTUAL_ACTION",
            message=str(exc),
            details={"actual_action_id": exc.actual_action_id},
        )

    if isinstance(exc, PersistenceIntegrityError):
        raise_api_error(
            status_code=500,
            code="PERSISTENCE_INTEGRITY_ERROR",
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
    store: TwinStateStore = Depends(get_state_store),
) -> TwinSessionRecord:
    return call_store_or_raise(store.get_record, state_id)


def get_twin_current_state(
    state_id: str,
    store: TwinStateStore = Depends(get_state_store),
) -> TwinCurrentState:
    return call_store_or_raise(store.get_current_state, state_id)


def get_twin_latest_simulation(
    state_id: str,
    store: TwinStateStore = Depends(get_state_store),
) -> SimulateActionsResponse:
    return call_store_or_raise(store.get_latest_simulation, state_id)


def get_twin_latest_recommendation(
    state_id: str,
    store: TwinStateStore = Depends(get_state_store),
) -> RecommendationResponse:
    return call_store_or_raise(store.get_latest_recommendation, state_id)
