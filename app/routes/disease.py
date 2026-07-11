"""Tomato disease prediction route orchestration."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from app.dependencies import (
    TwinAPIException,
    call_store_or_raise,
    get_disease_predictor,
    get_state_store,
)
from app.disease.model import (
    DEFAULT_DISEASE_MODEL_VERSION,
    DiseaseArtifactValidationError,
    DiseaseInferenceError,
    DiseaseModelUnavailableError,
    DiseasePredictor,
    InvalidDiseaseImageError,
)
from app.schemas import (
    CropType,
    DiseasePredictionResponse,
    PredictDiseaseRequest,
)
from app.state_store import InMemoryTwinStateStore


router = APIRouter(tags=["disease"])


INVALID_DISEASE_REQUEST_CODE = "INVALID_DISEASE_REQUEST"
STATE_ID_MISMATCH_CODE = "STATE_ID_MISMATCH"
UNSUPPORTED_DISEASE_MODEL_VERSION_CODE = "UNSUPPORTED_DISEASE_MODEL_VERSION"


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


def _raise_predictor_error(exc: Exception) -> None:
    if isinstance(exc, InvalidDiseaseImageError):
        raise TwinAPIException(
            status_code=422,
            code="INVALID_DISEASE_IMAGE",
            message="Invalid tomato-leaf image.",
            details={"reason": str(exc)},
        ) from exc

    if isinstance(exc, (DiseaseModelUnavailableError, DiseaseArtifactValidationError)):
        raise TwinAPIException(
            status_code=503,
            code="DISEASE_MODEL_UNAVAILABLE",
            message="The tomato disease model is unavailable.",
            details={"reason": str(exc)},
        ) from exc

    if isinstance(exc, DiseaseInferenceError):
        raise TwinAPIException(
            status_code=500,
            code="DISEASE_INFERENCE_FAILED",
            message="Tomato disease inference failed.",
            details={"reason": str(exc)},
        ) from exc

    raise exc


@router.post(
    "/sessions/{state_id}/predict-disease",
    response_model=DiseasePredictionResponse,
)
def predict_disease(
    state_id: str,
    request: PredictDiseaseRequest,
    store: InMemoryTwinStateStore = Depends(get_state_store),
    predictor: DiseasePredictor = Depends(get_disease_predictor),
) -> DiseasePredictionResponse:
    _validate_request_contract(
        path_state_id=state_id,
        request=request,
    )

    call_store_or_raise(store.get_record, state_id)

    try:
        inference = predictor.predict(request.image_base64)
    except Exception as exc:
        _raise_predictor_error(exc)

    prediction = DiseasePredictionResponse(
        state_id=state_id,
        crop_type=CropType.TOMATO,
        predicted_label=inference.predicted_label,
        disease_category=inference.disease_category,
        class_probs=inference.class_probs,
        confidence_calibrated=inference.confidence_calibrated,
        uncertainty_score=inference.uncertainty_score,
        uncertainty_band=inference.uncertainty_band,
        predicted_at=datetime.now(timezone.utc),
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
