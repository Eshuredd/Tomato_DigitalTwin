"""FastAPI application wiring for the tomato digital twin API.

Route modules own domain orchestration. This entrypoint registers routers and
the project error handler without running domain computations or initializing
external services.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.responses import JSONResponse

from app.dependencies import (
    TwinAPIException,
    build_error_response,
    get_state_store,
    initialize_state_store,
    twin_api_exception_handler,
)
from app.routes import (
    actions,
    advancement,
    disease,
    farms,
    meta,
    narration,
    plots,
    recommend,
    sessions,
    simulation,
    water,
)


@asynccontextmanager
async def lifespan(fastapi_app: FastAPI):
    if get_state_store not in fastapi_app.dependency_overrides:
        initialize_state_store()
    yield


app = FastAPI(
    title="Tomato Irrigation Disease Digital Twin API",
    version=meta.API_VERSION,
    lifespan=lifespan,
)

app.add_exception_handler(
    TwinAPIException,
    twin_api_exception_handler,
)


@app.exception_handler(RequestValidationError)
async def request_validation_error_handler(
    request: Request,
    exc: RequestValidationError,
):
    if request.url.path.endswith("/advance-one-day"):
        error_response = build_error_response(
            status_code=422,
            code="INVALID_DAILY_ADVANCEMENT_REQUEST",
            message="Invalid daily advancement request.",
            details={"errors": _json_safe_validation_errors(exc.errors())},
        )
        return JSONResponse(
            status_code=422,
            content=error_response.model_dump(mode="json"),
        )
    return await request_validation_exception_handler(request, exc)


def _json_safe_validation_errors(errors: list[dict[str, object]]) -> list[dict[str, object]]:
    safe_errors: list[dict[str, object]] = []
    for error in errors:
        safe = dict(error)
        ctx = safe.get("ctx")
        if isinstance(ctx, dict):
            safe["ctx"] = {key: str(value) for key, value in ctx.items()}
        safe_errors.append(safe)
    return safe_errors

app.include_router(meta.router)
app.include_router(farms.router)
app.include_router(plots.router)
app.include_router(sessions.router)
app.include_router(disease.router)
app.include_router(water.router)
app.include_router(advancement.router)
app.include_router(simulation.router)
app.include_router(recommend.router)
app.include_router(narration.router)
app.include_router(actions.router)
