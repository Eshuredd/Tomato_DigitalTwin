from __future__ import annotations

from collections.abc import Iterator
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_disease_predictor, get_state_store
from app.disease.classes import TOMATO_DISEASE_CLASS_NAMES
from app.disease.model import (
    DEFAULT_DISEASE_MODEL_VERSION,
    DiseaseArtifactValidationError,
    DiseaseInferenceError,
    DiseaseInferenceResult,
    DiseaseModelUnavailableError,
    InvalidDiseaseImageError,
)
from app.main import app
from app.schemas import (
    CreateSessionRequest,
    CropType,
    DiseaseCategory,
    DiseasePredictionResponse,
    ErrorResponse,
    Location,
    PredictDiseaseRequest,
    SoilTexture,
    UncertaintyBand,
)
from app.state_store import InMemoryTwinStateStore


class FakeDiseasePredictor:
    model_name = "fake"
    model_version = DEFAULT_DISEASE_MODEL_VERSION

    def __init__(self, exc: Exception | None = None) -> None:
        self.exc = exc
        self.calls = 0

    def predict(self, image_base64: str) -> DiseaseInferenceResult:
        self.calls += 1
        if self.exc is not None:
            raise self.exc

        predicted_label = "Tomato___Late_blight"
        class_probs = {
            label: 0.01
            for label in TOMATO_DISEASE_CLASS_NAMES
        }
        class_probs[predicted_label] = 0.91
        return DiseaseInferenceResult(
            predicted_label=predicted_label,
            disease_category=DiseaseCategory.FUNGAL,
            class_probs=class_probs,
            confidence_calibrated=0.91,
            uncertainty_score=0.09,
            uncertainty_band=UncertaintyBand.LOW,
        )


class BadCacheStore(InMemoryTwinStateStore):
    def cache_disease_state(self, state_id: str, disease_state: DiseasePredictionResponse) -> object:
        super().cache_disease_state(state_id, disease_state)
        return {"unexpected": True}


@pytest.fixture
def route_context() -> Iterator[tuple[TestClient, InMemoryTwinStateStore, FakeDiseasePredictor]]:
    store = InMemoryTwinStateStore()
    predictor = FakeDiseasePredictor()

    def override_store() -> InMemoryTwinStateStore:
        return store

    def override_predictor() -> FakeDiseasePredictor:
        return predictor

    previous_store = app.dependency_overrides.get(get_state_store)
    previous_predictor = app.dependency_overrides.get(get_disease_predictor)
    app.dependency_overrides[get_state_store] = override_store
    app.dependency_overrides[get_disease_predictor] = override_predictor

    try:
        with TestClient(app) as client:
            yield client, store, predictor
    finally:
        if previous_store is None:
            app.dependency_overrides.pop(get_state_store, None)
        else:
            app.dependency_overrides[get_state_store] = previous_store
        if previous_predictor is None:
            app.dependency_overrides.pop(get_disease_predictor, None)
        else:
            app.dependency_overrides[get_disease_predictor] = previous_predictor


def _session_request() -> CreateSessionRequest:
    return CreateSessionRequest(
        crop_type=CropType.TOMATO,
        planting_date=date(2026, 6, 1),
        location=Location(
            name="Test Farm",
            latitude=17.385,
            longitude=78.4867,
            elevation_m=542.0,
        ),
        soil_texture=SoilTexture.SANDY_LOAM,
    )


def _create_state(store: InMemoryTwinStateStore) -> str:
    return store.create_session(_session_request()).state_id


def _prediction_request(state_id: str, *, model_version: str = DEFAULT_DISEASE_MODEL_VERSION) -> dict[str, object]:
    return PredictDiseaseRequest(
        state_id=state_id,
        image_base64="not-used-by-fake",
        model_version=model_version,
    ).model_dump(mode="json")


def _error_code(response) -> str:
    return ErrorResponse.model_validate(response.json()).error.code


def test_successful_fake_predictor_request_caches_result(
    route_context: tuple[TestClient, InMemoryTwinStateStore, FakeDiseasePredictor],
) -> None:
    client, store, predictor = route_context
    state_id = _create_state(store)

    response = client.post(
        f"/sessions/{state_id}/predict-disease",
        json=_prediction_request(state_id),
    )

    assert response.status_code == 200
    assert predictor.calls == 1

    prediction = DiseasePredictionResponse.model_validate(response.json())
    assert prediction.predicted_label == "Tomato___Late_blight"
    assert prediction.disease_category is DiseaseCategory.FUNGAL
    assert prediction.confidence_calibrated == pytest.approx(0.91)
    assert prediction.uncertainty_score == pytest.approx(0.09)
    assert prediction.uncertainty_band is UncertaintyBand.LOW
    assert set(prediction.class_probs) == set(TOMATO_DISEASE_CLASS_NAMES)
    assert sum(prediction.class_probs.values()) == pytest.approx(1.0)

    cached = store.get_record(state_id).latest_disease_state
    assert cached is not None
    assert cached.predicted_label == prediction.predicted_label


def test_state_mismatch_does_not_call_predictor(
    route_context: tuple[TestClient, InMemoryTwinStateStore, FakeDiseasePredictor],
) -> None:
    client, store, predictor = route_context
    state_id = _create_state(store)

    response = client.post(
        f"/sessions/{state_id}/predict-disease",
        json=_prediction_request("other_state"),
    )

    assert response.status_code == 422
    assert _error_code(response) == "STATE_ID_MISMATCH"
    assert predictor.calls == 0


def test_unsupported_model_version_does_not_call_predictor(
    route_context: tuple[TestClient, InMemoryTwinStateStore, FakeDiseasePredictor],
) -> None:
    client, store, predictor = route_context
    state_id = _create_state(store)

    response = client.post(
        f"/sessions/{state_id}/predict-disease",
        json=_prediction_request(state_id, model_version="2.0"),
    )

    assert response.status_code == 422
    assert _error_code(response) == "UNSUPPORTED_DISEASE_MODEL_VERSION"
    assert predictor.calls == 0


def test_unknown_state_does_not_call_predictor(
    route_context: tuple[TestClient, InMemoryTwinStateStore, FakeDiseasePredictor],
) -> None:
    client, _store, predictor = route_context

    response = client.post(
        "/sessions/unknown_state/predict-disease",
        json=_prediction_request("unknown_state"),
    )

    assert response.status_code == 404
    assert _error_code(response) == "STATE_NOT_FOUND"
    assert predictor.calls == 0


@pytest.mark.parametrize(
    ("exc", "status_code", "code"),
    [
        (InvalidDiseaseImageError("bad image"), 422, "INVALID_DISEASE_IMAGE"),
        (DiseaseModelUnavailableError("missing deps"), 503, "DISEASE_MODEL_UNAVAILABLE"),
        (DiseaseArtifactValidationError("bad artifact"), 503, "DISEASE_MODEL_UNAVAILABLE"),
        (DiseaseInferenceError("bad inference"), 500, "DISEASE_INFERENCE_FAILED"),
    ],
)
def test_predictor_error_mapping(
    route_context: tuple[TestClient, InMemoryTwinStateStore, FakeDiseasePredictor],
    exc: Exception,
    status_code: int,
    code: str,
) -> None:
    client, store, predictor = route_context
    predictor.exc = exc
    state_id = _create_state(store)

    response = client.post(
        f"/sessions/{state_id}/predict-disease",
        json=_prediction_request(state_id),
    )

    assert response.status_code == status_code
    assert _error_code(response) == code
    assert predictor.calls == 1


def test_unexpected_cache_return_type_still_raises_type_error() -> None:
    store = BadCacheStore()
    predictor = FakeDiseasePredictor()
    state_id = _create_state(store)

    def override_store() -> BadCacheStore:
        return store

    def override_predictor() -> FakeDiseasePredictor:
        return predictor

    previous_store = app.dependency_overrides.get(get_state_store)
    previous_predictor = app.dependency_overrides.get(get_disease_predictor)
    app.dependency_overrides[get_state_store] = override_store
    app.dependency_overrides[get_disease_predictor] = override_predictor
    try:
        with TestClient(app) as client:
            with pytest.raises(TypeError):
                client.post(
                    f"/sessions/{state_id}/predict-disease",
                    json=_prediction_request(state_id),
                )
    finally:
        if previous_store is None:
            app.dependency_overrides.pop(get_state_store, None)
        else:
            app.dependency_overrides[get_state_store] = previous_store
        if previous_predictor is None:
            app.dependency_overrides.pop(get_disease_predictor, None)
        else:
            app.dependency_overrides[get_disease_predictor] = previous_predictor
