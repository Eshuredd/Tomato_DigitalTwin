"""Isolated browser-test launcher for Milestone 3.

Uses the real FastAPI routes and in-memory store while replacing only external
disease inference and weather retrieval inside this test process.
"""

from __future__ import annotations

import base64
import asyncio
from collections import defaultdict
from datetime import date, datetime, timezone
import os
from pathlib import Path
import sys
import time


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPOSITORY_ROOT / "backend"))
os.environ["CROPTWIN_STATE_STORE"] = "memory"
os.environ["CROPTWIN_CORS_ORIGINS"] = ",".join(
    (
        "http://127.0.0.1:3100",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    )
)

from app.dependencies import get_disease_predictor, get_state_store  # noqa: E402
from app.disease.model import (  # noqa: E402
    DEFAULT_DISEASE_MODEL_VERSION,
    DiseaseInferenceResult,
)
from app.main import app  # noqa: E402
from app.routes import water as water_routes  # noqa: E402
from app.schemas import (  # noqa: E402
    DiseaseCategory,
    UncertaintyBand,
    WeatherSnapshotResponse,
)
from app.state_store import InMemoryTwinStateStore  # noqa: E402


class DeterministicDiseasePredictor:
    model_name = "milestone3_browser_test"
    model_version = DEFAULT_DISEASE_MODEL_VERSION

    def predict(self, image_base64: str) -> DiseaseInferenceResult:
        image = base64.b64decode(image_base64, validate=True)
        if b"DELAY_DISEASE" in image:
            time.sleep(0.6)
        high = b"HIGH_UNCERTAINTY" in image
        confidence = 0.42 if high else 0.91
        label = "Tomato___Late_blight"
        return DiseaseInferenceResult(
            predicted_label=label,
            disease_category=DiseaseCategory.FUNGAL,
            class_probs={label: confidence, "Tomato___healthy": 1.0 - confidence},
            confidence_calibrated=confidence,
            uncertainty_score=1.0 - confidence,
            uncertainty_band=(UncertaintyBand.HIGH if high else UncertaintyBand.LOW),
        )


store = InMemoryTwinStateStore()
predictor = DeterministicDiseasePredictor()
weather_call_counts: defaultdict[date, int] = defaultdict(int)
app.dependency_overrides[get_state_store] = lambda: store
app.dependency_overrides[get_disease_predictor] = lambda: predictor


async def deterministic_weather(
    *, latitude: float, longitude: float, target_date: date, timeout_s: float = 10.0
) -> WeatherSnapshotResponse:
    del timeout_s
    weather_call_counts[target_date] += 1
    call_number = weather_call_counts[target_date]
    if target_date.day in {6, 7, 9}:
        await asyncio.sleep(0.7)
    elif target_date.day == 8:
        await asyncio.sleep(0.7 if call_number == 1 else 0.15)
    tmin_c = 20.0 + call_number if target_date.day == 8 else 21.5
    return WeatherSnapshotResponse(
        state_id="",
        target_date=target_date,
        source="open_meteo",
        source_timezone="Asia/Kolkata",
        latitude=latitude,
        longitude=longitude,
        tmin_c=tmin_c,
        tmax_c=32.25,
        humidity_pct=67.0,
        wind_speed_mps=2.55,
        wind_source_height_m=10.0,
        wind_normalized_height_m=2.0,
        rainfall_mm=0.0,
        shortwave_radiation_sum_mj_m2=19.75,
        eto_reference_feed=5.1,
        fetched_at=datetime(2026, 8, target_date.day, 4, call_number, tzinfo=timezone.utc),
    )


water_routes.fetch_daily_weather = deterministic_weather


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
