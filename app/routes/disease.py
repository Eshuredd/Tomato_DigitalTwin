"""MVP deterministic mock tomato disease classification route.

The classification fields are deterministic for demo use. The ``predicted_at``
timestamp records when the mock prediction response was generated.

This module does not make irrigation, recommendation, narration, or treatment
decisions.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from app.dependencies import TwinAPIException, call_store_or_raise, get_state_store
from app.schemas import (
    CropType,
    DiseaseCategory,
    DiseasePredictionResponse,
    PredictDiseaseRequest,
    UncertaintyBand,
)
from app.state_store import InMemoryTwinStateStore


router = APIRouter(tags=["disease"])


INVALID_DISEASE_REQUEST_CODE = "INVALID_DISEASE_REQUEST"
STATE_ID_MISMATCH_CODE = "STATE_ID_MISMATCH"
UNSUPPORTED_DISEASE_MODEL_VERSION_CODE = "UNSUPPORTED_DISEASE_MODEL_VERSION"


DEFAULT_DISEASE_MODEL_NAME = "mvp_deterministic_tomato_disease_mock"
DEFAULT_DISEASE_MODEL_VERSION = "1.0"
DEFAULT_DISEASE_MODEL_BASIS = (
    "mvp_deterministic_mock_tomato_disease_signal_for_demo_only"
)


IMAGE_SIGNAL_MIN_LENGTH = 32
IMAGE_SIGNAL_MIN_LENGTH_BASIS = (
    "mvp_minimum_encoded_image_signal_length_for_demo_classification"
)

STRONG_IMAGE_SIGNAL_LENGTH = 256
STRONG_IMAGE_SIGNAL_LENGTH_BASIS = (
    "mvp_demo_activation_threshold_for_exercising_high_confidence_"
    "disease_aware_recommendation_flow_not_a_real_image_quality_measure"
)


STRONG_MOCK_CONFIDENCE = 0.82
STRONG_MOCK_CONFIDENCE_BASIS = (
    "mvp_demo_confidence_for_exercising_disease_aware_recommendation_flow"
)

STRONG_MOCK_UNCERTAINTY_SCORE = 0.18
STRONG_MOCK_UNCERTAINTY_SCORE_BASIS = (
    "mvp_demo_low_uncertainty_for_exercising_disease_aware_recommendation_flow"
)


MEDIUM_MOCK_CONFIDENCE = 0.70
MEDIUM_MOCK_CONFIDENCE_BASIS = (
    "mvp_confidence_below_firm_fungal_recommendation_constraint_threshold"
)

MEDIUM_MOCK_UNCERTAINTY_SCORE = 0.42
MEDIUM_MOCK_UNCERTAINTY_SCORE_BASIS = (
    "mvp_medium_uncertainty_for_digest_selected_mock_disease_signal"
)


INSUFFICIENT_SIGNAL_CONFIDENCE = 0.25
INSUFFICIENT_SIGNAL_CONFIDENCE_BASIS = (
    "mvp_low_confidence_for_insufficient_encoded_image_signal"
)

INSUFFICIENT_SIGNAL_UNCERTAINTY_SCORE = 0.85
INSUFFICIENT_SIGNAL_UNCERTAINTY_SCORE_BASIS = (
    "mvp_high_uncertainty_for_insufficient_encoded_image_signal"
)

INSUFFICIENT_IMAGE_SIGNAL_LABEL = "insufficient_image_signal"
INSUFFICIENT_IMAGE_SIGNAL_LABEL_BASIS = (
    "mvp_non_diagnostic_label_for_insufficient_or_empty_image_signal"
)


DISEASE_CLASSES: tuple[tuple[str, DiseaseCategory], ...] = (
    ("healthy", DiseaseCategory.NONE),
    ("late_blight", DiseaseCategory.FUNGAL),
    ("bacterial_spot", DiseaseCategory.BACTERIAL),
    ("tomato_mosaic_virus", DiseaseCategory.VIRAL),
)


def _validate_request_contract(
    *,
    path_state_id: str,
    request: PredictDiseaseRequest,
) -> None:
    """Validate route-level values that body validation cannot enforce."""

    if not path_state_id.strip():
        raise TwinAPIException(
            status_code=422,
            code=INVALID_DISEASE_REQUEST_CODE,
            message="Invalid disease prediction request.",
            details={
                "reason": "Path state_id must contain a non-whitespace value.",
            },
        )

    if request.state_id != path_state_id:
        raise TwinAPIException(
            status_code=422,
            code=STATE_ID_MISMATCH_CODE,
            message="Disease prediction state_id mismatch.",
            details={
                "path_state_id": path_state_id,
                "request_state_id": request.state_id,
            },
        )

    if request.model_version != DEFAULT_DISEASE_MODEL_VERSION:
        raise TwinAPIException(
            status_code=422,
            code=UNSUPPORTED_DISEASE_MODEL_VERSION_CODE,
            message="Unsupported disease model version.",
            details={
                "supported_model_version": DEFAULT_DISEASE_MODEL_VERSION,
                "requested_model_version": request.model_version,
            },
        )


def _normalized_image_signal(request: PredictDiseaseRequest) -> str:
    """Return the normalized signal used by the deterministic mock."""

    return request.image_base64.strip()


def _image_digest(image_signal: str) -> bytes:
    """Create a stable digest using only the supplied disease evidence."""

    return hashlib.sha256(image_signal.encode("utf-8")).digest()


def _class_probs(
    *,
    predicted_label: str,
    confidence: float,
) -> dict[str, float]:
    """Build a normalized probability distribution for the mock output."""

    labels = [label for label, _category in DISEASE_CLASSES]

    if predicted_label not in labels:
        labels = [predicted_label, *labels]

    other_labels = [
        label
        for label in labels
        if label != predicted_label
    ]

    remainder = round(1.0 - confidence, 6)
    other_probability = round(remainder / len(other_labels), 6)

    class_probs = {label: 0.0 for label in labels}

    for label in other_labels[:-1]:
        class_probs[label] = other_probability

    class_probs[other_labels[-1]] = round(
        remainder - other_probability * (len(other_labels) - 1),
        6,
    )
    class_probs[predicted_label] = confidence

    return class_probs


def _predict_disease_signal(
    *,
    state_id: str,
    request: PredictDiseaseRequest,
) -> DiseasePredictionResponse:
    """Create deterministic classification fields with a real timestamp."""

    image_signal = _normalized_image_signal(request)

    if len(image_signal) < IMAGE_SIGNAL_MIN_LENGTH:
        predicted_label = INSUFFICIENT_IMAGE_SIGNAL_LABEL
        disease_category = DiseaseCategory.NONE
        confidence = INSUFFICIENT_SIGNAL_CONFIDENCE
        uncertainty_score = INSUFFICIENT_SIGNAL_UNCERTAINTY_SCORE
        uncertainty_band = UncertaintyBand.HIGH
    else:
        digest = _image_digest(image_signal)
        selector = digest[0] % len(DISEASE_CLASSES)

        predicted_label, disease_category = DISEASE_CLASSES[selector]

        if len(image_signal) >= STRONG_IMAGE_SIGNAL_LENGTH:
            confidence = STRONG_MOCK_CONFIDENCE
            uncertainty_score = STRONG_MOCK_UNCERTAINTY_SCORE
            uncertainty_band = UncertaintyBand.LOW
        else:
            confidence = MEDIUM_MOCK_CONFIDENCE
            uncertainty_score = MEDIUM_MOCK_UNCERTAINTY_SCORE
            uncertainty_band = UncertaintyBand.MEDIUM

    return DiseasePredictionResponse(
        state_id=state_id,
        crop_type=CropType.TOMATO,
        predicted_label=predicted_label,
        disease_category=disease_category,
        class_probs=_class_probs(
            predicted_label=predicted_label,
            confidence=confidence,
        ),
        confidence_calibrated=confidence,
        uncertainty_score=uncertainty_score,
        uncertainty_band=uncertainty_band,
        predicted_at=datetime.now(timezone.utc),
    )


@router.post(
    "/sessions/{state_id}/predict-disease",
    response_model=DiseasePredictionResponse,
)
def predict_disease(
    state_id: str,
    request: PredictDiseaseRequest,
    store: InMemoryTwinStateStore = Depends(get_state_store),
) -> DiseasePredictionResponse:
    _validate_request_contract(
        path_state_id=state_id,
        request=request,
    )

    prediction = _predict_disease_signal(
        state_id=state_id,
        request=request,
    )

    cached_result = call_store_or_raise(
        store.cache_disease_state,
        state_id=state_id,
        disease_state=prediction,
    )

    if cached_result is None:
        return prediction

    if isinstance(cached_result, DiseasePredictionResponse):
        return cached_result

    raise TypeError(
        "cache_disease_state returned an unexpected response type: "
        f"{type(cached_result).__name__}"
    )