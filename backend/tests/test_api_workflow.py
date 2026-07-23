from __future__ import annotations

from collections import Counter
from collections.abc import Iterator
from datetime import date, datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_disease_predictor, get_state_store
from app.disease.classes import TOMATO_DISEASE_CLASS_NAMES
from app.disease.model import (
    DEFAULT_DISEASE_MODEL_VERSION,
    DiseaseInferenceResult,
)
from app.main import app
from app.routes import meta, sessions
from app.schemas import (
    ActionEnum,
    ComputeWaterStateRequest,
    CreateSessionRequest,
    CropType,
    DiseaseCategory,
    DiseasePredictionResponse,
    ErrorResponse,
    HealthResponse,
    LastIrrigationEvent,
    Location,
    NarrationResponse,
    PredictDiseaseRequest,
    RecommendationResponse,
    SessionHistoryResponse,
    SessionResponse,
    SessionStateResponse,
    SimulateActionsRequest,
    SimulateActionsResponse,
    SoilTexture,
    StateIdRequest,
    UncertaintyBand,
    UpdateTwinStateResponse,
    WaterStateResponse,
    WeatherInput,
)
from app.state_store import InMemoryTwinStateStore


PLANTING_DATE = date(2026, 6, 1)
CURRENT_DATE = date(2026, 7, 10)
MOCK_ELEVATION_M = 542.0
DISEASE_SIGNAL = "deterministic_tomato_leaf_signal_" * 12


class FakeDiseasePredictor:
    model_name = "fake_tomato_disease_predictor"
    model_version = DEFAULT_DISEASE_MODEL_VERSION

    def __init__(self) -> None:
        self.calls = 0

    def predict(self, image_base64: str) -> DiseaseInferenceResult:
        self.calls += 1
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


@pytest.fixture(autouse=True)
def elevation_call_count(
    monkeypatch: pytest.MonkeyPatch,
) -> list[int]:
    calls = [0]

    async def fake_fetch_elevation_m(
        *,
        latitude: float,
        longitude: float,
    ) -> float:
        calls[0] += 1
        return MOCK_ELEVATION_M

    monkeypatch.setattr(
        sessions,
        "fetch_elevation_m",
        fake_fetch_elevation_m,
    )

    return calls


@pytest.fixture
def client_and_store() -> Iterator[tuple[TestClient, InMemoryTwinStateStore]]:
    store = InMemoryTwinStateStore()
    predictor = FakeDiseasePredictor()

    def override_get_state_store() -> InMemoryTwinStateStore:
        return store

    def override_get_disease_predictor() -> FakeDiseasePredictor:
        return predictor

    previous_override = app.dependency_overrides.get(get_state_store)
    previous_predictor_override = app.dependency_overrides.get(get_disease_predictor)
    app.dependency_overrides[get_state_store] = override_get_state_store
    app.dependency_overrides[get_disease_predictor] = override_get_disease_predictor

    try:
        with TestClient(app) as client:
            yield client, store
    finally:
        if previous_override is None:
            app.dependency_overrides.pop(get_state_store, None)
        else:
            app.dependency_overrides[get_state_store] = previous_override
        if previous_predictor_override is None:
            app.dependency_overrides.pop(get_disease_predictor, None)
        else:
            app.dependency_overrides[get_disease_predictor] = (
                previous_predictor_override
            )


def _weather_input() -> WeatherInput:
    return WeatherInput(
        tmin_c=22.0,
        tmax_c=31.0,
        humidity_pct=62.0,
        wind_speed_mps=2.1,
        shortwave_radiation_sum_mj_m2=18.5,
        rainfall_mm=0.5,
        eto_reference_feed=4.9,
    )


def _create_session(
    client: TestClient,
    elevation_call_count: list[int],
    *,
    expected_elevation_calls: int,
) -> str:
    request = CreateSessionRequest(
        crop_type=CropType.TOMATO,
        planting_date=PLANTING_DATE,
        location=Location(
            name="Hyderabad Test Farm",
            latitude=17.3850,
            longitude=78.4867,
        ),
        soil_texture=SoilTexture.SANDY_LOAM,
    )

    response = client.post(
        "/sessions",
        json=request.model_dump(mode="json"),
    )

    assert response.status_code == 200

    session = SessionResponse.model_validate(response.json())

    assert session.state_id
    assert session.location.elevation_m == MOCK_ELEVATION_M
    assert elevation_call_count[0] == expected_elevation_calls

    return session.state_id


def _predict_disease(
    client: TestClient,
    state_id: str,
) -> DiseasePredictionResponse:
    request = PredictDiseaseRequest(
        state_id=state_id,
        image_base64=DISEASE_SIGNAL,
        model_version=DEFAULT_DISEASE_MODEL_VERSION,
    )

    response = client.post(
        f"/sessions/{state_id}/predict-disease",
        json=request.model_dump(mode="json"),
    )

    assert response.status_code == 200

    prediction = DiseasePredictionResponse.model_validate(response.json())

    assert prediction.state_id == state_id
    assert 0.0 <= prediction.confidence_calibrated <= 1.0
    assert prediction.uncertainty_score >= 0.0
    assert prediction.uncertainty_band
    assert prediction.disease_category

    return prediction


def _compute_water_state(
    client: TestClient,
    state_id: str,
    *,
    water_update_id: str | None = None,
    current_date: date = CURRENT_DATE,
    weather: WeatherInput | None = None,
    observed_at: datetime | None = None,
    last_irrigation_event: LastIrrigationEvent | None = None,
) -> WaterStateResponse:
    request = ComputeWaterStateRequest(
        state_id=state_id,
        water_update_id=water_update_id,
        current_date=current_date,
        weather=weather or _weather_input(),
        last_irrigation_event=last_irrigation_event,
        observed_at=observed_at,
    )

    response = client.post(
        f"/sessions/{state_id}/compute-water-state",
        json=request.model_dump(mode="json"),
    )

    assert response.status_code == 200

    water_state = WaterStateResponse.model_validate(response.json())

    assert water_state.state_id == state_id
    assert water_state.eto_computed >= 0.0
    assert water_state.etc >= 0.0
    assert water_state.taw > 0.0
    assert water_state.raw_threshold >= 0.0
    assert 0.0 <= water_state.root_zone_depletion <= water_state.taw
    assert water_state.eto_method

    return water_state


def _update_twin_state(
    client: TestClient,
    state_id: str,
) -> UpdateTwinStateResponse:
    request = StateIdRequest(state_id=state_id)

    response = client.post(
        f"/sessions/{state_id}/update-twin-state",
        json=request.model_dump(mode="json"),
    )

    assert response.status_code == 200

    updated = UpdateTwinStateResponse.model_validate(response.json())

    assert updated.state_id == state_id
    assert updated.current_state.predicted_label
    assert updated.current_state.days_since_planting >= 0
    assert updated.current_state.taw > 0.0

    return updated


def _simulate_actions(
    client: TestClient,
    state_id: str,
    actions: list[ActionEnum] | None = None,
) -> SimulateActionsResponse:
    requested_actions = actions if actions is not None else list(ActionEnum)

    request = SimulateActionsRequest(
        state_id=state_id,
        actions=requested_actions,
    )

    response = client.post(
        f"/sessions/{state_id}/simulate-actions",
        json=request.model_dump(mode="json"),
    )

    assert response.status_code == 200

    simulation = SimulateActionsResponse.model_validate(response.json())

    assert simulation.state_id == state_id
    assert len(simulation.simulations) == len(requested_actions)
    assert [
        result.action
        for result in simulation.simulations
    ] == requested_actions

    for result in simulation.simulations:
        assert result.action in requested_actions
        assert result.projected_root_zone_depletion >= 0.0
        assert isinstance(result.projected_raw_crossing, bool)

    return simulation


def _recommend(
    client: TestClient,
    state_id: str,
) -> RecommendationResponse:
    response = client.post(
        f"/sessions/{state_id}/recommend",
    )

    assert response.status_code == 200

    recommendation = RecommendationResponse.model_validate(response.json())

    assert recommendation.state_id == state_id
    assert recommendation.chosen_action in set(ActionEnum)
    assert isinstance(recommendation.inspection_advisory, bool)
    assert recommendation.irrigation_constraint
    assert isinstance(
        recommendation.evidence_summary_structured,
        dict,
    )

    return recommendation


def _narrate(
    client: TestClient,
    state_id: str,
) -> NarrationResponse:
    response = client.post(
        f"/sessions/{state_id}/narrate",
    )

    assert response.status_code == 200

    narration = NarrationResponse.model_validate(response.json())

    assert narration.state_id == state_id
    assert narration.headline.strip()
    assert narration.rationale.strip()

    return narration


def _complete_current_state_prerequisites(
    client: TestClient,
    state_id: str,
) -> UpdateTwinStateResponse:
    _predict_disease(client, state_id)
    _compute_water_state(client, state_id)

    return _update_twin_state(client, state_id)


def _assert_error_envelope(response) -> dict[str, object]:
    error_response = ErrorResponse.model_validate(response.json())
    error = error_response.error.model_dump()

    assert isinstance(error["code"], str)
    assert isinstance(error["message"], str)
    assert isinstance(error["details"], dict)
    assert isinstance(error["status_code"], int)

    return error


def test_registered_routes_match_accepted_contract() -> None:
    registered_routes = Counter(
        (method, route.path)
        for route in app.routes
        for method in getattr(route, "methods", set())
    )

    expected_routes = {
        ("GET", "/health"),
        ("GET", "/system-info"),
        ("POST", "/sessions"),
        ("GET", "/sessions/{state_id}"),
        ("GET", "/sessions/{state_id}/history"),
        ("GET", "/sessions/{state_id}/weather-snapshot"),
        ("POST", "/sessions/{state_id}/predict-disease"),
        ("POST", "/sessions/{state_id}/compute-water-state"),
        ("POST", "/sessions/{state_id}/update-twin-state"),
        ("POST", "/sessions/{state_id}/simulate-actions"),
        ("POST", "/sessions/{state_id}/recommend"),
        ("POST", "/sessions/{state_id}/narrate"),
    }

    for expected_route in expected_routes:
        assert registered_routes[expected_route] == 1


def test_update_twin_state_is_http_idempotent_and_preserves_current_decisions(
    client_and_store: tuple[TestClient, InMemoryTwinStateStore],
    elevation_call_count: list[int],
) -> None:
    client, store = client_and_store
    state_id = _create_session(
        client,
        elevation_call_count,
        expected_elevation_calls=1,
    )
    _predict_disease(client, state_id)
    _compute_water_state(client, state_id)
    first = _update_twin_state(client, state_id)
    simulation = _simulate_actions(client, state_id, [ActionEnum.IRRIGATE_NOW])
    recommendation = _recommend(client, state_id)
    narration = _narrate(client, state_id)
    first_history_response = client.get(f"/sessions/{state_id}/history")
    assert first_history_response.status_code == 200
    first_history = SessionHistoryResponse.model_validate(
        first_history_response.json(),
    )

    second = _update_twin_state(client, state_id)
    second_history_response = client.get(f"/sessions/{state_id}/history")
    assert second_history_response.status_code == 200
    second_history = SessionHistoryResponse.model_validate(
        second_history_response.json(),
    )

    assert first.snapshot_id is not None
    assert first.snapshot_created is True
    assert second.snapshot_id == first.snapshot_id
    assert second.snapshot_created is False
    assert second.state_history_count == first.state_history_count
    assert second.current_state == first.current_state
    assert len(second_history.history) == len(first_history.history)
    assert store.get_latest_simulation(state_id) == simulation
    assert store.get_latest_recommendation(state_id) == recommendation
    assert _narrate(client, state_id) == narration

    _predict_disease(client, state_id)
    third = _update_twin_state(client, state_id)
    third_history_response = client.get(f"/sessions/{state_id}/history")
    assert third_history_response.status_code == 200
    third_history = SessionHistoryResponse.model_validate(
        third_history_response.json(),
    )

    assert third.snapshot_created is True
    assert third.snapshot_id != second.snapshot_id
    assert third.state_history_count == second.state_history_count + 1
    assert len(third_history.history) == len(second_history.history) + 1

    stale_recommendation_response = client.post(f"/sessions/{state_id}/recommend")
    assert stale_recommendation_response.status_code == 409
    stale_recommendation_error = _assert_error_envelope(stale_recommendation_response)
    assert stale_recommendation_error["code"] == "MISSING_CACHED_OUTPUT"

    stale_narration_before_simulation_response = client.post(
        f"/sessions/{state_id}/narrate",
    )
    assert stale_narration_before_simulation_response.status_code == 409
    stale_narration_before_simulation_error = _assert_error_envelope(
        stale_narration_before_simulation_response,
    )
    assert stale_narration_before_simulation_error["code"] == "MISSING_CACHED_OUTPUT"

    _simulate_actions(client, state_id, [ActionEnum.IRRIGATE_NOW])
    stale_narration_response = client.post(f"/sessions/{state_id}/narrate")
    assert stale_narration_response.status_code == 409
    stale_narration_error = _assert_error_envelope(stale_narration_response)
    assert stale_narration_error["code"] == "MISSING_CACHED_OUTPUT"
    new_recommendation = _recommend(client, state_id)
    new_narration = _narrate(client, state_id)
    assert new_recommendation.state_id == state_id
    assert new_narration.state_id == state_id


def test_health_and_system_information(
    client_and_store: tuple[TestClient, InMemoryTwinStateStore],
) -> None:
    client, _store = client_and_store

    health_response = client.get("/health")

    assert health_response.status_code == 200

    health = HealthResponse.model_validate(health_response.json())

    assert health.status == "ok"
    assert health.service == meta.API_SERVICE
    assert health.version == meta.API_VERSION

    system_response = client.get("/system-info")

    assert system_response.status_code == 200

    system_info = system_response.json()

    assert system_info["crop_type"] == CropType.TOMATO.value
    assert system_info["disease_model"]["model_name"]
    assert system_info["disease_model"]["model_version"]
    assert system_info["growth_stage_config"]["source"]
    assert system_info["growth_stage_config"]["stages_days"]
    assert system_info["water_model_config"]["kc_config_source"]
    assert system_info["water_model_config"]["p_allowable"] >= 0.0
    assert system_info["recommendation_policy"][
        "fungal_confidence_threshold"
    ] >= 0.0
    assert system_info["narrator_policy"]["caution_triggers"]
    assert (
        system_info["narrator_policy"]["default_mode"]
        == "deterministic_fallback_no_llm_client"
    )


def test_complete_api_workflow(
    client_and_store: tuple[TestClient, InMemoryTwinStateStore],
    elevation_call_count: list[int],
) -> None:
    client, _store = client_and_store

    state_id = _create_session(
        client,
        elevation_call_count,
        expected_elevation_calls=1,
    )

    prediction = _predict_disease(client, state_id)

    assert prediction.crop_type == CropType.TOMATO

    water_state = _compute_water_state(client, state_id)

    assert water_state.crop_type == CropType.TOMATO

    updated = _update_twin_state(client, state_id)

    assert updated.current_state.growth_stage == water_state.growth_stage
    assert (
        updated.current_state.predicted_label
        == prediction.predicted_label
    )

    simulation = _simulate_actions(client, state_id)
    simulated_actions = {
        result.action
        for result in simulation.simulations
    }

    recommendation = _recommend(client, state_id)

    assert recommendation.chosen_action in simulated_actions
    assert recommendation.decision_reason_codes
    assert all(recommendation.decision_reason_codes)

    narration = _narrate(client, state_id)

    assert narration.state_id == recommendation.state_id

    state_response = client.get(
        f"/sessions/{state_id}",
    )

    assert state_response.status_code == 200

    session_state = SessionStateResponse.model_validate(
        state_response.json(),
    )

    assert session_state.state_id == state_id
    assert (
        session_state.current_state.predicted_label
        == prediction.predicted_label
    )

    history_response = client.get(
        f"/sessions/{state_id}/history",
    )

    assert history_response.status_code == 200

    history = SessionHistoryResponse.model_validate(
        history_response.json(),
    )

    assert history.state_id == state_id
    assert len(history.history) >= 1


def test_prerequisite_error_chain(
    client_and_store: tuple[TestClient, InMemoryTwinStateStore],
    elevation_call_count: list[int],
) -> None:
    client, _store = client_and_store

    state_id = _create_session(
        client,
        elevation_call_count,
        expected_elevation_calls=1,
    )

    update_request = StateIdRequest(state_id=state_id)

    update_response = client.post(
        f"/sessions/{state_id}/update-twin-state",
        json=update_request.model_dump(mode="json"),
    )

    assert update_response.status_code == 409

    update_error = _assert_error_envelope(update_response)

    assert update_error["code"] == "INCOMPLETE_STATE"
    assert set(update_error["details"]["missing"]) == {
        "latest_disease_state",
        "latest_growth_state",
        "latest_water_state",
    }

    simulation_request = SimulateActionsRequest(
        state_id=state_id,
        actions=list(ActionEnum),
    )

    simulation_response = client.post(
        f"/sessions/{state_id}/simulate-actions",
        json=simulation_request.model_dump(mode="json"),
    )

    assert simulation_response.status_code == 409

    simulation_error = _assert_error_envelope(simulation_response)

    assert simulation_error["code"] == "MISSING_CACHED_OUTPUT"

    _complete_current_state_prerequisites(client, state_id)

    recommendation_response = client.post(
        f"/sessions/{state_id}/recommend",
    )

    assert recommendation_response.status_code == 409

    recommendation_error = _assert_error_envelope(
        recommendation_response,
    )

    assert recommendation_error["code"] == "MISSING_CACHED_OUTPUT"

    _simulate_actions(client, state_id)

    narration_response = client.post(
        f"/sessions/{state_id}/narrate",
    )

    assert narration_response.status_code == 409

    narration_error = _assert_error_envelope(narration_response)

    assert narration_error["code"] == "MISSING_CACHED_OUTPUT"


def test_path_body_state_id_mismatch(
    client_and_store: tuple[TestClient, InMemoryTwinStateStore],
    elevation_call_count: list[int],
) -> None:
    client, _store = client_and_store

    state_id = _create_session(
        client,
        elevation_call_count,
        expected_elevation_calls=1,
    )

    water_request = ComputeWaterStateRequest(
        state_id="different_state_id",
        current_date=CURRENT_DATE,
        weather=_weather_input(),
        last_irrigation_event=None,
    )

    water_response = client.post(
        f"/sessions/{state_id}/compute-water-state",
        json=water_request.model_dump(mode="json"),
    )

    assert water_response.status_code == 422

    water_error = _assert_error_envelope(water_response)

    assert water_error["code"] == "STATE_ID_MISMATCH"
    assert water_error["details"]["path_state_id"] == state_id
    assert (
        water_error["details"]["request_state_id"]
        == "different_state_id"
    )

    disease_request = PredictDiseaseRequest(
        state_id="different_state_id",
        image_base64=DISEASE_SIGNAL,
        model_version=DEFAULT_DISEASE_MODEL_VERSION,
    )

    disease_response = client.post(
        f"/sessions/{state_id}/predict-disease",
        json=disease_request.model_dump(mode="json"),
    )

    assert disease_response.status_code == 422

    disease_error = _assert_error_envelope(disease_response)

    assert disease_error["code"] == "STATE_ID_MISMATCH"
    assert disease_error["details"]["path_state_id"] == state_id
    assert (
        disease_error["details"]["request_state_id"]
        == "different_state_id"
    )


def test_unknown_session_errors(
    client_and_store: tuple[TestClient, InMemoryTwinStateStore],
) -> None:
    client, _store = client_and_store
    unknown_state_id = "unknown_state"

    state_response = client.get(
        f"/sessions/{unknown_state_id}",
    )

    assert state_response.status_code == 404

    state_error = _assert_error_envelope(state_response)

    assert state_error["code"] == "STATE_NOT_FOUND"

    water_request = ComputeWaterStateRequest(
        state_id=unknown_state_id,
        current_date=CURRENT_DATE,
        weather=_weather_input(),
        last_irrigation_event=None,
    )

    water_response = client.post(
        f"/sessions/{unknown_state_id}/compute-water-state",
        json=water_request.model_dump(mode="json"),
    )

    assert water_response.status_code == 404

    water_error = _assert_error_envelope(water_response)

    assert water_error["code"] == "STATE_NOT_FOUND"


def test_deterministic_narration_without_llm(
    client_and_store: tuple[TestClient, InMemoryTwinStateStore],
    elevation_call_count: list[int],
) -> None:
    client, _store = client_and_store

    state_id = _create_session(
        client,
        elevation_call_count,
        expected_elevation_calls=1,
    )

    _complete_current_state_prerequisites(client, state_id)
    _simulate_actions(client, state_id)

    recommendation = _recommend(client, state_id)
    narration = _narrate(client, state_id)

    assert narration.state_id == recommendation.state_id
    assert narration.headline
    assert narration.rationale


def test_irrigation_event_double_counting(
    client_and_store: tuple[TestClient, InMemoryTwinStateStore],
    elevation_call_count: list[int],
) -> None:
    client, store = client_and_store

    irrigated_state_id = _create_session(
        client,
        elevation_call_count,
        expected_elevation_calls=1,
    )

    event = LastIrrigationEvent(
        timestamp=datetime(
            2026,
            7,
            9,
            8,
            0,
            tzinfo=timezone.utc,
        ),
        amount_mm=8.0,
    )

    first_irrigated_water_state = _compute_water_state(
        client,
        irrigated_state_id,
        water_update_id="update-july-10",
        last_irrigation_event=event,
    )

    baseline_state_id = _create_session(
        client,
        elevation_call_count,
        expected_elevation_calls=2,
    )

    baseline_first_water_state = _compute_water_state(
        client,
        baseline_state_id,
        water_update_id="baseline-july-10",
        last_irrigation_event=None,
    )

    assert (
        first_irrigated_water_state.root_zone_depletion
        < baseline_first_water_state.root_zone_depletion
    )

    _predict_disease(client, irrigated_state_id)
    _update_twin_state(client, irrigated_state_id)

    repeated_event_water_state = _compute_water_state(
        client,
        irrigated_state_id,
        water_update_id="update-july-10",
        last_irrigation_event=event,
    )

    assert len(store._water_history[irrigated_state_id]) == 1  # noqa: SLF001

    assert repeated_event_water_state == first_irrigated_water_state
    assert repeated_event_water_state.applied_irrigation_event_id is not None
    assert repeated_event_water_state.effective_irrigation_mm == pytest.approx(8.0)

    later_weather = WeatherInput(
        tmin_c=25.0,
        tmax_c=35.0,
        humidity_pct=50.0,
        wind_speed_mps=2.5,
        shortwave_radiation_sum_mj_m2=22.0,
        rainfall_mm=0.0,
        eto_reference_feed=5.8,
    )
    later_event_water_state = _compute_water_state(
        client,
        irrigated_state_id,
        water_update_id="update-july-11",
        current_date=date(2026, 7, 11),
        weather=later_weather,
        last_irrigation_event=event,
    )

    assert later_event_water_state != first_irrigated_water_state
    assert later_event_water_state.water_update_id == "update-july-11"
    assert later_event_water_state.reported_irrigation_event_id is not None
    assert later_event_water_state.applied_irrigation_event_id is None
    assert later_event_water_state.effective_irrigation_mm == pytest.approx(0.0)
    assert later_event_water_state.irrigation_event_already_accounted_for is True
    assert later_event_water_state.eto_computed != (
        first_irrigated_water_state.eto_computed
    )
    assert len(store._growth_history[irrigated_state_id]) == 2  # noqa: SLF001
    assert len(store._water_history[irrigated_state_id]) == 2  # noqa: SLF001


def test_water_update_id_conflict_returns_409(
    client_and_store: tuple[TestClient, InMemoryTwinStateStore],
    elevation_call_count: list[int],
) -> None:
    client, _store = client_and_store
    state_id = _create_session(
        client,
        elevation_call_count,
        expected_elevation_calls=1,
    )
    first_request = ComputeWaterStateRequest(
        state_id=state_id,
        water_update_id="same-water-update",
        current_date=CURRENT_DATE,
        weather=_weather_input(),
    )
    first_response = client.post(
        f"/sessions/{state_id}/compute-water-state",
        json=first_request.model_dump(mode="json"),
    )
    assert first_response.status_code == 200

    changed_request = ComputeWaterStateRequest(
        state_id=state_id,
        water_update_id="same-water-update",
        current_date=CURRENT_DATE,
        weather=WeatherInput(
            tmin_c=25.0,
            tmax_c=35.0,
            humidity_pct=50.0,
            wind_speed_mps=2.5,
            shortwave_radiation_sum_mj_m2=22.0,
            rainfall_mm=0.0,
            eto_reference_feed=5.8,
        ),
    )
    changed_response = client.post(
        f"/sessions/{state_id}/compute-water-state",
        json=changed_request.model_dump(mode="json"),
    )

    assert changed_response.status_code == 409
    error = _assert_error_envelope(changed_response)
    assert error["code"] == "WATER_UPDATE_CONFLICT"
    assert error["details"]["water_update_id"] == "same-water-update"


def test_omitted_water_update_id_derives_stable_retry_identity(
    client_and_store: tuple[TestClient, InMemoryTwinStateStore],
    elevation_call_count: list[int],
) -> None:
    client, store = client_and_store
    state_id = _create_session(
        client,
        elevation_call_count,
        expected_elevation_calls=1,
    )
    request = ComputeWaterStateRequest(
        state_id=state_id,
        current_date=CURRENT_DATE,
        weather=_weather_input(),
    )

    first_response = client.post(
        f"/sessions/{state_id}/compute-water-state",
        json=request.model_dump(mode="json"),
    )
    second_response = client.post(
        f"/sessions/{state_id}/compute-water-state",
        json=request.model_dump(mode="json"),
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert WaterStateResponse.model_validate(first_response.json()) == (
        WaterStateResponse.model_validate(second_response.json())
    )
    body = first_response.json()
    assert body["water_update_id"].startswith("derived-water-update-")
    assert len(store._water_history[state_id]) == 1  # noqa: SLF001


def test_actual_action_accepts_same_state_recommendation(
    client_and_store: tuple[TestClient, InMemoryTwinStateStore],
    elevation_call_count: list[int],
) -> None:
    client, _store = client_and_store
    state_id = _create_session(
        client,
        elevation_call_count,
        expected_elevation_calls=1,
    )
    _complete_current_state_prerequisites(client, state_id)
    _simulate_actions(client, state_id)
    recommendation = _recommend(client, state_id)

    assert recommendation.recommendation_id is not None

    response = client.post(
        f"/sessions/{state_id}/actual-actions",
        json={
            "action": ActionEnum.IRRIGATE_NOW.value,
            "performed_at": "2026-07-10T08:00:00Z",
            "amount_mm": 8.0,
            "related_recommendation_id": recommendation.recommendation_id,
        },
    )

    assert response.status_code == 200
    assert response.json()["related_recommendation_id"] == (
        recommendation.recommendation_id
    )


def test_actual_action_rejects_cross_state_recommendation(
    client_and_store: tuple[TestClient, InMemoryTwinStateStore],
    elevation_call_count: list[int],
) -> None:
    client, _store = client_and_store
    first_state_id = _create_session(
        client,
        elevation_call_count,
        expected_elevation_calls=1,
    )
    second_state_id = _create_session(
        client,
        elevation_call_count,
        expected_elevation_calls=2,
    )
    _complete_current_state_prerequisites(client, second_state_id)
    _simulate_actions(client, second_state_id)
    recommendation = _recommend(client, second_state_id)

    response = client.post(
        f"/sessions/{first_state_id}/actual-actions",
        json={
            "action": ActionEnum.IRRIGATE_NOW.value,
            "performed_at": "2026-07-10T08:00:00Z",
            "related_recommendation_id": recommendation.recommendation_id,
        },
    )

    assert response.status_code == 422
    assert _assert_error_envelope(response)["code"] == "RECOMMENDATION_STATE_MISMATCH"


def test_actual_action_rejects_unknown_recommendation(
    client_and_store: tuple[TestClient, InMemoryTwinStateStore],
    elevation_call_count: list[int],
) -> None:
    client, _store = client_and_store
    state_id = _create_session(
        client,
        elevation_call_count,
        expected_elevation_calls=1,
    )

    response = client.post(
        f"/sessions/{state_id}/actual-actions",
        json={
            "action": ActionEnum.IRRIGATE_NOW.value,
            "performed_at": "2026-07-10T08:00:00Z",
            "related_recommendation_id": "recommendation-missing",
        },
    )

    assert response.status_code == 422
    assert _assert_error_envelope(response)["code"] == (
        "RELATED_RECOMMENDATION_NOT_FOUND"
    )


def test_cross_state_irrigation_event_is_rejected(
    client_and_store: tuple[TestClient, InMemoryTwinStateStore],
    elevation_call_count: list[int],
) -> None:
    client, _store = client_and_store
    first_state_id = _create_session(
        client,
        elevation_call_count,
        expected_elevation_calls=1,
    )
    second_state_id = _create_session(
        client,
        elevation_call_count,
        expected_elevation_calls=2,
    )
    event = LastIrrigationEvent(
        irrigation_event_id="manual-shared-id",
        timestamp=datetime(2026, 7, 9, 8, 0, tzinfo=timezone.utc),
        amount_mm=8.0,
    )
    _compute_water_state(client, first_state_id, last_irrigation_event=event)

    request = ComputeWaterStateRequest(
        state_id=second_state_id,
        current_date=CURRENT_DATE,
        weather=_weather_input(),
        last_irrigation_event=event,
    )
    response = client.post(
        f"/sessions/{second_state_id}/compute-water-state",
        json=request.model_dump(mode="json"),
    )

    assert response.status_code == 422
    assert _assert_error_envelope(response)["code"] == (
        "IRRIGATION_EVENT_STATE_MISMATCH"
    )


def test_irrigation_event_payload_conflict_is_rejected(
    client_and_store: tuple[TestClient, InMemoryTwinStateStore],
    elevation_call_count: list[int],
) -> None:
    client, _store = client_and_store
    state_id = _create_session(
        client,
        elevation_call_count,
        expected_elevation_calls=1,
    )
    event = LastIrrigationEvent(
        irrigation_event_id="manual-conflict-id",
        timestamp=datetime(2026, 7, 9, 8, 0, tzinfo=timezone.utc),
        amount_mm=8.0,
    )
    _compute_water_state(
        client,
        state_id,
        water_update_id="event-conflict-first",
        last_irrigation_event=event,
    )

    conflicting_event = LastIrrigationEvent(
        irrigation_event_id="manual-conflict-id",
        timestamp=event.timestamp,
        amount_mm=9.0,
    )
    request = ComputeWaterStateRequest(
        state_id=state_id,
        water_update_id="event-conflict-second",
        current_date=CURRENT_DATE,
        weather=_weather_input(),
        last_irrigation_event=conflicting_event,
    )
    response = client.post(
        f"/sessions/{state_id}/compute-water-state",
        json=request.model_dump(mode="json"),
    )

    assert response.status_code == 409
    error = _assert_error_envelope(response)
    assert error["code"] == "IRRIGATION_EVENT_PAYLOAD_CONFLICT"
    assert error["details"]["field"] == "amount_mm"
