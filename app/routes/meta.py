"""Health and system metadata routes for the tomato digital twin API.

The system-info route exposes deterministic MVP assumptions without running
domain computations or mutating state.
"""

from __future__ import annotations

import json

from fastapi import APIRouter

from app.disease.classes import DISEASE_CLASSES
from app.disease.model import (
    DEFAULT_DISEASE_MODEL_NAME,
    DEFAULT_DISEASE_MODEL_VERSION,
    get_default_artifact_dir,
)
from app.disease.uncertainty import (
    ACCEPTANCE_CONFIDENCE_THRESHOLD,
    LOW_UNCERTAINTY_CONFIDENCE_THRESHOLD,
    UNCERTAINTY_POLICY_BASIS,
)
from app.growth_stage.resolver import (
    DEFAULT_STAGE_CONFIG_SOURCE,
    DEFAULT_TOMATO_STAGE_DAYS,
)
from app.narration.narrator import (
    MAX_LLM_RATIONALE_CHARS,
    MAX_LLM_RATIONALE_CHARS_BASIS,
)
from app.recommendation.engine import (
    FUNGAL_CONFIDENCE_THRESHOLD,
    FUNGAL_CONFIDENCE_THRESHOLD_BASIS,
)
from app.schemas import (
    CautionReason,
    CropType,
    EtoMethod,
    HealthResponse,
)
from app.water.crop_coefficients import (
    DEFAULT_KC_CONFIG_SOURCE,
    get_kc_config_snapshot,
)
from app.water.water_balance import (
    DEFAULT_P_ALLOWABLE,
    DEFAULT_ROOT_DEPTH_BASIS,
    DEFAULT_SOIL_PARAMETER_BASIS,
)


router = APIRouter(tags=["meta"])


PROJECT_NAME = "tomato_irrigation_disease_digital_twin"
API_STAGE = "mvp"
API_SERVICE = "tomato_irrigation_disease_digital_twin_api"
API_VERSION = "mvp"
DECISION_BOUNDARY = "deterministic_engine_decides_narrator_explains"
E_TO_FALLBACK_TRIGGER = "shortwave_radiation_sum_mj_m2_missing"
E_TO_REFERENCE_FEED = "optional_weather_eto_reference_feed_for_delta_only"
DISEASE_DATASET = "PlantVillage tomato subset, 10 classes"
DISEASE_CALIBRATION_METHOD = "temperature_scaling_on_validation_split"
DISEASE_UNCERTAINTY_METHOD = "calibrated_confidence_threshold_bands"


def _stage_days_snapshot() -> dict[str, int]:
    return {
        growth_stage.value: days
        for growth_stage, days in DEFAULT_TOMATO_STAGE_DAYS.items()
    }


def _disease_classes_snapshot() -> list[dict[str, str]]:
    return [
        {
            "label": label,
            "category": category.value,
        }
        for label, category in DISEASE_CLASSES
    ]


def _artifact_json(filename: str) -> dict[str, object]:
    path = get_default_artifact_dir() / filename
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return {}

    return data if isinstance(data, dict) else {}


def _artifact_float(
    data: dict[str, object],
    *path: str,
) -> float | None:
    current: object = data
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)

    if isinstance(current, bool) or not isinstance(current, (int, float)):
        return None

    return float(current)


def _disease_metadata_snapshot() -> dict[str, object]:
    temperature = _artifact_json("temperature.json")
    test_metrics = _artifact_json("test_metrics.json")
    uncertainty_policy = _artifact_json("uncertainty_policy.json")

    validation_ece = _artifact_float(
        temperature,
        "validation_after",
        "expected_calibration_error",
    )
    test_ece = _artifact_float(
        test_metrics,
        "calibration",
        "after",
        "expected_calibration_error",
    )

    return {
        "model_name": DEFAULT_DISEASE_MODEL_NAME,
        "model_version": DEFAULT_DISEASE_MODEL_VERSION,
        "dataset": DISEASE_DATASET,
        "calibration_method": DISEASE_CALIBRATION_METHOD,
        "uncertainty_method": DISEASE_UNCERTAINTY_METHOD,
        "uncertainty_method_basis": UNCERTAINTY_POLICY_BASIS,
        "confidence_thresholds": {
            "acceptance_confidence_gte": ACCEPTANCE_CONFIDENCE_THRESHOLD,
            "low_uncertainty_confidence_gte": (
                LOW_UNCERTAINTY_CONFIDENCE_THRESHOLD
            ),
            "medium_uncertainty_confidence_gte": (
                ACCEPTANCE_CONFIDENCE_THRESHOLD
            ),
            "medium_uncertainty_confidence_lt": (
                LOW_UNCERTAINTY_CONFIDENCE_THRESHOLD
            ),
            "high_uncertainty_confidence_lt": (
                ACCEPTANCE_CONFIDENCE_THRESHOLD
            ),
        },
        "uncertainty_thresholds": {
            "low_uncertainty_score_lte": (
                1.0 - LOW_UNCERTAINTY_CONFIDENCE_THRESHOLD
            ),
            "medium_uncertainty_score_gt": (
                1.0 - LOW_UNCERTAINTY_CONFIDENCE_THRESHOLD
            ),
            "medium_uncertainty_score_lte": (
                1.0 - ACCEPTANCE_CONFIDENCE_THRESHOLD
            ),
            "high_uncertainty_score_gt": (
                1.0 - ACCEPTANCE_CONFIDENCE_THRESHOLD
            ),
        },
        "classes": _disease_classes_snapshot(),
        "temperature": _artifact_float(temperature, "temperature"),
        "confidence_threshold": _artifact_float(
            uncertainty_policy,
            "confidence_threshold",
        ),
        "ece_validation_score": validation_ece,
        "ece_test_score": test_ece,
        "test_accuracy": _artifact_float(
            test_metrics,
            "classification",
            "accuracy",
        ),
        "macro_precision": _artifact_float(
            test_metrics,
            "classification",
            "macro_precision",
        ),
        "macro_recall": _artifact_float(
            test_metrics,
            "classification",
            "macro_recall",
        ),
        "macro_f1": _artifact_float(
            test_metrics,
            "classification",
            "macro_f1",
        ),
    }


@router.get("/health", response_model=HealthResponse)
def health_route() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service=API_SERVICE,
        version=API_VERSION,
    )


@router.get("/system-info")
def system_info_route() -> dict[str, object]:
    return {
        "project_name": PROJECT_NAME,
        "api_stage": API_STAGE,
        "decision_boundary": DECISION_BOUNDARY,
        "crop_type": CropType.TOMATO.value,
        "disease_model": _disease_metadata_snapshot(),
        "growth_stage_config": {
            "source": DEFAULT_STAGE_CONFIG_SOURCE,
            "stages_days": _stage_days_snapshot(),
        },
        "water_model_config": {
            "primary_eto_method": EtoMethod.PENMAN_MONTEITH.value,
            "fallback_eto_method": EtoMethod.HARGREAVES_SAMANI.value,
            "fallback_trigger": E_TO_FALLBACK_TRIGGER,
            "reference_feed": E_TO_REFERENCE_FEED,
            "soil_parameter_basis": DEFAULT_SOIL_PARAMETER_BASIS,
            "root_depth_basis": DEFAULT_ROOT_DEPTH_BASIS,
            "p_allowable": DEFAULT_P_ALLOWABLE,
            "kc_config_source": DEFAULT_KC_CONFIG_SOURCE,
            "kc_by_stage": get_kc_config_snapshot(),
        },
        "recommendation_policy": {
            "fungal_confidence_threshold": FUNGAL_CONFIDENCE_THRESHOLD,
            "fungal_confidence_threshold_basis": (
                FUNGAL_CONFIDENCE_THRESHOLD_BASIS
            ),
        },
        "narrator_policy": {
            "caution_triggers": [
                CautionReason.HIGH_UNCERTAINTY.value,
                CautionReason.FUNGAL_DISEASE_RISK.value,
            ],
            "max_llm_rationale_chars": MAX_LLM_RATIONALE_CHARS,
            "max_llm_rationale_chars_basis": MAX_LLM_RATIONALE_CHARS_BASIS,
            "default_mode": "deterministic_fallback_no_llm_client",
        },
    }
