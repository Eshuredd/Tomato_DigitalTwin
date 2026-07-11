"""FastAPI application wiring for the tomato digital twin API.

Route modules own domain orchestration. This entrypoint registers routers and
the project error handler without running domain computations or initializing
external services.
"""

from __future__ import annotations

from fastapi import FastAPI

from app.dependencies import TwinAPIException, twin_api_exception_handler
from app.routes import (
    disease,
    meta,
    narration,
    recommend,
    sessions,
    simulation,
    water,
)


app = FastAPI(
    title="Tomato Irrigation Disease Digital Twin API",
    version=meta.API_VERSION,
)

app.add_exception_handler(
    TwinAPIException,
    twin_api_exception_handler,
)

app.include_router(meta.router)
app.include_router(sessions.router)
app.include_router(disease.router)
app.include_router(water.router)
app.include_router(simulation.router)
app.include_router(recommend.router)
app.include_router(narration.router)
