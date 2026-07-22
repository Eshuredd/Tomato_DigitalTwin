from __future__ import annotations

from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone, timedelta
import threading

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError

from app.growth_stage.resolver import resolve_growth_stage
from app.persistence.models import GrowthObservationModel, WaterObservationModel
from app.persistence.sqlalchemy_store import SQLAlchemyTwinStateStore
from app.recommendation.engine import recommend_action
from app.schemas import (
    ActionEnum,
    ActualActionCreateRequest,
    CreateCropCycleRequest,
    CreateSessionRequest,
    CropType,
    DiseaseCategory,
    DiseasePredictionResponse,
    FarmCreateRequest,
    IrrigationEventSource,
    LastIrrigationEvent,
    Location,
    ObservationTimeBasis,
    PlotCreateRequest,
    SimulateActionsResponse,
    SoilTexture,
    UncertaintyBand,
    WeatherInput,
)
from app.simulation.simulator import simulate_actions
from app.state_store import (
    DuplicateActualActionError,
    DuplicateIrrigationEventApplicationError,
    InMemoryTwinStateStore,
    IrrigationEventPayloadConflictError,
    IrrigationEventStateMismatchError,
    MissingCachedOutputError,
    RecommendationStateMismatchError,
    RelatedRecommendationNotFoundError,
    StateNotFoundError,
    WaterBaselineMismatchError,
    WaterUpdateConcurrencyConflictError,
    WaterUpdatePayloadConflictError,
    WaterObservationTimeConflictError,
    derive_irrigation_event_id,
    with_irrigation_event_id,
)
from app.store_protocol import TwinStateStore
from app.water.update_identity import (
    compute_water_update_fingerprint,
    derive_water_update_id,
)
from app.water.water_balance import compute_water_state


StoreFactory = Callable[[], TwinStateStore]


@pytest.fixture(params=["memory", "sqlalchemy"])
def store_factory(
    request: pytest.FixtureRequest,
    tmp_path,
) -> StoreFactory:
    if request.param == "memory":
        return lambda: InMemoryTwinStateStore()

    db_path = tmp_path / "croptwin-test.db"
    database_url = f"sqlite+pysqlite:///{db_path}"

    def _factory() -> SQLAlchemyTwinStateStore:
        return SQLAlchemyTwinStateStore(
            database_url=database_url,
            auto_create=True,
        )

    return _factory


def _session_request() -> CreateSessionRequest:
    return CreateSessionRequest(
        crop_type=CropType.TOMATO,
        planting_date=date(2026, 6, 1),
        location=Location(
            name="Contract Farm",
            latitude=17.385,
            longitude=78.4867,
            elevation_m=542.0,
        ),
        soil_texture=SoilTexture.SANDY_LOAM,
    )


def _weather(*, rainfall_mm: float = 0.5) -> WeatherInput:
    return WeatherInput(
        tmin_c=22.0,
        tmax_c=31.0,
        humidity_pct=62.0,
        wind_speed_mps=2.1,
        shortwave_radiation_sum_mj_m2=18.5,
        rainfall_mm=rainfall_mm,
        eto_reference_feed=4.9,
    )


def _disease(state_id: str, *, predicted_at: datetime) -> DiseasePredictionResponse:
    return DiseasePredictionResponse(
        state_id=state_id,
        crop_type=CropType.TOMATO,
        predicted_label="Tomato___healthy",
        disease_category=DiseaseCategory.NONE,
        class_probs={"Tomato___healthy": 0.94, "Tomato___Late_blight": 0.06},
        confidence_calibrated=0.94,
        uncertainty_score=0.06,
        uncertainty_band=UncertaintyBand.LOW,
        predicted_at=predicted_at,
    )


def _cache_prerequisites(
    store: TwinStateStore,
    state_id: str,
    *,
    current_date: date = date(2026, 7, 10),
    rainfall_mm: float = 0.5,
    observed_at: datetime | None = None,
) -> None:
    record = store.get_record(state_id)
    growth = resolve_growth_stage(
        state_id=state_id,
        crop_type=record.crop_type,
        planting_date=record.planting_date,
        current_date=current_date,
    )
    water = compute_water_state(
        state_id=state_id,
        crop_type=record.crop_type,
        growth_stage=growth.growth_stage,
        soil_texture=record.soil_texture,
        current_date=current_date,
        weather=_weather(rainfall_mm=rainfall_mm),
        latitude_deg=record.location.latitude,
        elevation_m=record.location.elevation_m or 0.0,
        previous_root_zone_depletion_mm=(
            record.current_state.root_zone_depletion
            if record.current_state is not None
            else None
        ),
        observed_at=observed_at,
    )
    store.cache_growth_state(state_id, growth)
    store.cache_water_state(
        state_id,
        water,
        weather_payload=_weather(rainfall_mm=rainfall_mm).model_dump(mode="json"),
        previous_root_zone_depletion_mm=(
            record.current_state.root_zone_depletion
            if record.current_state is not None
            else None
        ),
    )


def _cache_current_state_and_recommendation(
    store: TwinStateStore,
    state_id: str,
    *,
    current_date: date = date(2026, 7, 10),
):
    store.cache_disease_state(
        state_id,
        _disease(
            state_id,
            predicted_at=datetime.combine(
                current_date,
                datetime.min.time(),
                tzinfo=timezone.utc,
            ),
        ),
    )
    _cache_prerequisites(store, state_id, current_date=current_date)
    store.update_current_state(state_id)
    current = store.get_current_state(state_id)
    simulation = store.cache_simulation(
        state_id,
        simulate_actions(
            state_id=state_id,
            current_state=current,
            actions=[ActionEnum.IRRIGATE_NOW, ActionEnum.NO_IRRIGATION_24H],
        ),
    )
    return store.cache_recommendation(
        state_id,
        recommend_action(
            state_id=state_id,
            current_state=current,
            simulation=simulation,
        ),
    )


def _observation_counts(store: TwinStateStore, state_id: str) -> tuple[int, int]:
    if isinstance(store, InMemoryTwinStateStore):
        return (
            len(store._growth_history.get(state_id, [])),  # noqa: SLF001
            len(store._water_history.get(state_id, [])),  # noqa: SLF001
        )

    assert isinstance(store, SQLAlchemyTwinStateStore)
    with store._session_factory() as session:  # noqa: SLF001
        growth_count = session.scalar(
            select(func.count())
            .select_from(GrowthObservationModel)
            .where(GrowthObservationModel.state_id == state_id)
        )
        water_count = session.scalar(
            select(func.count())
            .select_from(WaterObservationModel)
            .where(WaterObservationModel.state_id == state_id)
        )
    return int(growth_count or 0), int(water_count or 0)


def _water_observation_metadata(
    store: TwinStateStore,
    state_id: str,
) -> list[dict[str, object]]:
    if isinstance(store, InMemoryTwinStateStore):
        return list(store._water_observation_metadata.get(state_id, []))  # noqa: SLF001

    assert isinstance(store, SQLAlchemyTwinStateStore)
    with store._session_factory() as session:  # noqa: SLF001
        rows = session.execute(
            select(
                WaterObservationModel.water_update_id,
                WaterObservationModel.reported_irrigation_event_id,
                WaterObservationModel.irrigation_event_id,
                WaterObservationModel.effective_irrigation_mm,
            )
            .where(WaterObservationModel.state_id == state_id)
            .order_by(WaterObservationModel.computed_at)
        ).all()
    return [
        {
            "water_update_id": row.water_update_id,
            "reported_irrigation_event_id": row.reported_irrigation_event_id,
            "irrigation_event_id": row.irrigation_event_id,
            "effective_irrigation_mm": row.effective_irrigation_mm,
        }
        for row in rows
    ]


def _latest_growth_metadata(
    store: TwinStateStore,
    state_id: str,
) -> tuple[datetime, ObservationTimeBasis]:
    if isinstance(store, InMemoryTwinStateStore):
        observed_at, basis, _computed_at = store._growth_observation_metadata[  # noqa: SLF001
            state_id
        ][-1]
        return observed_at, basis

    assert isinstance(store, SQLAlchemyTwinStateStore)
    with store._session_factory() as session:  # noqa: SLF001
        row = session.scalars(
            select(GrowthObservationModel)
            .where(GrowthObservationModel.state_id == state_id)
            .order_by(GrowthObservationModel.computed_at.desc())
            .limit(1)
        ).one()
        observed_at = (
            row.observed_at.replace(tzinfo=timezone.utc)
            if row.observed_at.tzinfo is None
            else row.observed_at.astimezone(timezone.utc)
        )
        return observed_at, ObservationTimeBasis(row.observation_time_basis)


def _cache_water_update(
    store: TwinStateStore,
    state_id: str,
    growth,
    water,
    *,
    weather: WeatherInput | None = None,
    water_update_id: str | None = None,
    reported_irrigation_event: LastIrrigationEvent | None = None,
    effective_irrigation_mm: float = 0.0,
):
    reported_event = (
        with_irrigation_event_id(state_id, reported_irrigation_event)
        if reported_irrigation_event is not None
        else None
    )
    update_id = water_update_id or derive_water_update_id(
        state_id=state_id,
        observed_at=water.observed_at,
        observation_time_basis=water.observation_time_basis,
    )
    weather_value = weather or _weather()
    fingerprint = compute_water_update_fingerprint(
        state_id=state_id,
        water_update_id=update_id,
        current_date=growth.current_date,
        observed_at=water.observed_at,
        observation_time_basis=water.observation_time_basis,
        weather=weather_value,
        last_irrigation_event=reported_event,
    )
    return store.cache_water_update(
        state_id,
        growth,
        water,
        water_update_id=update_id,
        request_fingerprint=fingerprint,
        weather_payload=weather_value.model_dump(mode="json"),
        reported_irrigation_event=reported_event,
        effective_irrigation_mm=effective_irrigation_mm,
        computed_at=water.computed_at,
    )


def test_store_contract_current_state_history_and_detached_objects(
    store_factory: StoreFactory,
) -> None:
    store = store_factory()
    session = store.create_session(_session_request(), state_id="state-contract")

    store.cache_disease_state(
        session.state_id,
        _disease(
            session.state_id,
            predicted_at=datetime(2026, 7, 10, 6, 0, tzinfo=timezone.utc),
        ),
    )
    observed_at = datetime(2026, 7, 10, 7, 0, tzinfo=timezone.utc)
    _cache_prerequisites(store, session.state_id, observed_at=observed_at)
    first = store.update_current_state(session.state_id)

    assert first.current_state.observed_at == observed_at
    assert first.current_state.computed_at == first.current_state.last_update_time
    assert first.current_state.water_surplus_mm >= 0.0
    assert first.current_state.depletion_beyond_taw_mm >= 0.0
    assert store.get_history_response(session.state_id).history[-1].timestamp == (
        first.current_state.computed_at
    )

    detached = store.get_record(session.state_id)
    detached.location.name = "Mutated Outside Store"
    assert store.get_record(session.state_id).location.name == "Contract Farm"

    store.cache_disease_state(
        session.state_id,
        _disease(
            session.state_id,
            predicted_at=datetime(2026, 7, 11, 6, 0, tzinfo=timezone.utc),
        ),
    )
    _cache_prerequisites(
        store,
        session.state_id,
        current_date=date(2026, 7, 11),
    )
    second = store.update_current_state(session.state_id)

    assert second.state_history_count == 2
    assert second.current_state.computed_at != first.current_state.computed_at
    assert len(store.get_history_response(session.state_id).history) == 2


def test_store_contract_simulation_and_recommendation_invalidation(
    store_factory: StoreFactory,
) -> None:
    store = store_factory()
    session = store.create_session(_session_request(), state_id="state-sim")
    store.cache_disease_state(
        session.state_id,
        _disease(
            session.state_id,
            predicted_at=datetime(2026, 7, 10, 6, 0, tzinfo=timezone.utc),
        ),
    )
    _cache_prerequisites(store, session.state_id)
    store.update_current_state(session.state_id)
    current = store.get_current_state(session.state_id)

    first_simulation = store.cache_simulation(
        session.state_id,
        simulate_actions(
            state_id=session.state_id,
            current_state=current,
            actions=[ActionEnum.IRRIGATE_NOW],
        ),
    )
    first_recommendation = store.cache_recommendation(
        session.state_id,
        recommend_action(
            state_id=session.state_id,
            current_state=current,
            simulation=first_simulation,
        ),
    )
    assert store.get_latest_recommendation(session.state_id) == first_recommendation

    second_simulation = SimulateActionsResponse(
        state_id=session.state_id,
        simulations=first_simulation.simulations,
        simulated_at=first_simulation.simulated_at + timedelta(seconds=1),
    )
    store.cache_simulation(session.state_id, second_simulation)
    with pytest.raises(MissingCachedOutputError):
        store.get_latest_recommendation(session.state_id)

    store.cache_recommendation(
        session.state_id,
        recommend_action(
            state_id=session.state_id,
            current_state=current,
            simulation=second_simulation,
        ),
    )
    store.cache_disease_state(
        session.state_id,
        _disease(
            session.state_id,
            predicted_at=datetime(2026, 7, 11, 6, 0, tzinfo=timezone.utc),
        ),
    )
    _cache_prerequisites(
        store,
        session.state_id,
        current_date=date(2026, 7, 11),
    )
    store.update_current_state(session.state_id)
    with pytest.raises(MissingCachedOutputError):
        store.get_latest_simulation(session.state_id)


def test_store_contract_farms_plots_crop_cycles_and_actual_actions(
    store_factory: StoreFactory,
) -> None:
    store = store_factory()
    farm = store.create_farm(FarmCreateRequest(name="North Farm"))
    plot = store.create_plot(
        farm.farm_id,
        PlotCreateRequest(
            name="Plot A",
            location=Location(
                name="North Field",
                latitude=12.34,
                longitude=56.78,
                elevation_m=101.0,
            ),
            soil_texture=SoilTexture.LOAM,
        ),
    )
    cycle = store.create_crop_cycle_for_plot(
        plot.plot_id,
        CreateCropCycleRequest(
            crop_type=CropType.TOMATO,
            planting_date=date(2026, 6, 15),
        ),
    )

    assert store.list_farms() == [farm]
    assert store.list_plots(farm.farm_id) == [plot]
    assert cycle.location.name == "North Field"
    assert cycle.location.elevation_m == 101.0
    assert store.get_record(cycle.state_id).plot_id == plot.plot_id

    standalone = store.create_session(_session_request())
    assert store.get_record(standalone.state_id).plot_id is None

    action = store.record_actual_action(
        cycle.state_id,
        ActualActionCreateRequest(
            action=ActionEnum.IRRIGATE_NOW,
            performed_at=datetime(2026, 7, 10, 8, 0, tzinfo=timezone.utc),
            amount_mm=4.0,
            notes="Farmer opened the valve manually.",
        ),
    )
    assert store.list_actual_actions(cycle.state_id) == [action]


def test_store_contract_actual_action_recommendation_ownership(
    store_factory: StoreFactory,
) -> None:
    store = store_factory()
    first = store.create_session(_session_request(), state_id="state-actions-a")
    second = store.create_session(_session_request(), state_id="state-actions-b")
    first_recommendation = _cache_current_state_and_recommendation(
        store,
        first.state_id,
    )
    second_recommendation = _cache_current_state_and_recommendation(
        store,
        second.state_id,
    )

    assert first_recommendation.recommendation_id is not None
    assert second_recommendation.recommendation_id is not None

    action = store.record_actual_action(
        first.state_id,
        ActualActionCreateRequest(
            action=ActionEnum.IRRIGATE_NOW,
            performed_at=datetime(2026, 7, 10, 8, 0, tzinfo=timezone.utc),
            related_recommendation_id=first_recommendation.recommendation_id,
        ),
    )
    assert action.related_recommendation_id == first_recommendation.recommendation_id

    current = store.get_current_state(first.state_id)
    new_simulation = store.cache_simulation(
        first.state_id,
        SimulateActionsResponse(
            state_id=first.state_id,
            simulations=store.get_latest_simulation(first.state_id).simulations,
            simulated_at=datetime(2026, 7, 10, 9, 0, tzinfo=timezone.utc),
        ),
    )
    store.cache_recommendation(
        first.state_id,
        recommend_action(
            state_id=first.state_id,
            current_state=current,
            simulation=new_simulation,
        ),
    )
    historical_action = store.record_actual_action(
        first.state_id,
        ActualActionCreateRequest(
            action=ActionEnum.NO_IRRIGATION_24H,
            performed_at=datetime(2026, 7, 10, 10, 0, tzinfo=timezone.utc),
            related_recommendation_id=first_recommendation.recommendation_id,
        ),
    )
    assert historical_action.related_recommendation_id == (
        first_recommendation.recommendation_id
    )

    with pytest.raises(RecommendationStateMismatchError):
        store.record_actual_action(
            first.state_id,
            ActualActionCreateRequest(
                action=ActionEnum.IRRIGATE_NOW,
                performed_at=datetime(2026, 7, 10, 11, 0, tzinfo=timezone.utc),
                related_recommendation_id=second_recommendation.recommendation_id,
            ),
        )

    with pytest.raises(RelatedRecommendationNotFoundError):
        store.record_actual_action(
            first.state_id,
            ActualActionCreateRequest(
                action=ActionEnum.IRRIGATE_NOW,
                performed_at=datetime(2026, 7, 10, 12, 0, tzinfo=timezone.utc),
                related_recommendation_id="recommendation-missing",
            ),
        )

    store.record_actual_action(
        first.state_id,
        ActualActionCreateRequest(
            action=ActionEnum.IRRIGATE_NOW,
            performed_at=datetime(2026, 7, 10, 13, 0, tzinfo=timezone.utc),
        ),
        actual_action_id="actual-duplicate",
    )
    with pytest.raises(DuplicateActualActionError):
        store.record_actual_action(
            first.state_id,
            ActualActionCreateRequest(
                action=ActionEnum.IRRIGATE_NOW,
                performed_at=datetime(2026, 7, 10, 14, 0, tzinfo=timezone.utc),
            ),
            actual_action_id="actual-duplicate",
        )


def test_store_contract_irrigation_idempotency(
    store_factory: StoreFactory,
) -> None:
    store = store_factory()
    session = store.create_session(_session_request(), state_id="state-irrigation")
    event = LastIrrigationEvent(
        timestamp=datetime(2026, 7, 9, 8, 0, tzinfo=timezone.utc),
        amount_mm=8.0,
        source=IrrigationEventSource.MANUAL,
    )
    normalized = with_irrigation_event_id(session.state_id, event)
    expected_id = derive_irrigation_event_id(
        state_id=session.state_id,
        timestamp=event.timestamp,
        amount_mm=event.amount_mm,
    )

    assert normalized.irrigation_event_id == expected_id
    assert not store.has_applied_irrigation_event(session.state_id, expected_id)

    store.cache_disease_state(
        session.state_id,
        _disease(
            session.state_id,
            predicted_at=datetime(2026, 7, 10, 6, 0, tzinfo=timezone.utc),
        ),
    )
    record = store.get_record(session.state_id)
    growth = resolve_growth_stage(
        state_id=session.state_id,
        crop_type=record.crop_type,
        planting_date=record.planting_date,
        current_date=date(2026, 7, 10),
    )
    water = compute_water_state(
        state_id=session.state_id,
        crop_type=record.crop_type,
        growth_stage=growth.growth_stage,
        soil_texture=record.soil_texture,
        current_date=date(2026, 7, 10),
        weather=_weather(),
        latitude_deg=record.location.latitude,
        elevation_m=record.location.elevation_m or 0.0,
        last_irrigation_event=normalized,
    )
    store.cache_growth_state(session.state_id, growth)
    store.cache_water_state(
        session.state_id,
        water,
        irrigation_event=normalized,
    )

    assert store.has_applied_irrigation_event(session.state_id, expected_id)
    with pytest.raises(DuplicateIrrigationEventApplicationError):
        store.cache_water_state(
            session.state_id,
            water,
            irrigation_event=normalized,
        )

    explicit = LastIrrigationEvent(
        irrigation_event_id="manual-distinct-event",
        timestamp=event.timestamp,
        amount_mm=event.amount_mm,
        source=IrrigationEventSource.MANUAL,
    )
    assert with_irrigation_event_id(session.state_id, explicit).irrigation_event_id == (
        "manual-distinct-event"
    )


def test_store_contract_atomic_water_update_is_idempotent_and_timestamped(
    store_factory: StoreFactory,
) -> None:
    store = store_factory()
    session = store.create_session(_session_request(), state_id="state-water-atomic")
    record = store.get_record(session.state_id)
    observed_at = datetime(2026, 7, 10, 7, 30, tzinfo=timezone.utc)
    event = LastIrrigationEvent(
        irrigation_event_id="manual-once",
        timestamp=datetime(2026, 7, 9, 8, 0, tzinfo=timezone.utc),
        amount_mm=8.0,
        source=IrrigationEventSource.MANUAL,
    )
    growth = resolve_growth_stage(
        state_id=session.state_id,
        crop_type=record.crop_type,
        planting_date=record.planting_date,
        current_date=date(2026, 7, 10),
    )
    water = compute_water_state(
        state_id=session.state_id,
        crop_type=record.crop_type,
        growth_stage=growth.growth_stage,
        soil_texture=record.soil_texture,
        current_date=date(2026, 7, 10),
        weather=_weather(),
        latitude_deg=record.location.latitude,
        elevation_m=record.location.elevation_m or 0.0,
        last_irrigation_event=event,
        observed_at=observed_at,
        observation_time_basis=ObservationTimeBasis.EXPLICIT,
    )

    first = _cache_water_update(
        store,
        session.state_id,
        growth,
        water,
        water_update_id="update-manual-once",
        reported_irrigation_event=event,
        effective_irrigation_mm=event.amount_mm,
    )
    second = _cache_water_update(
        store,
        session.state_id,
        growth,
        water,
        water_update_id="update-manual-once",
        reported_irrigation_event=event,
        effective_irrigation_mm=event.amount_mm,
    )

    assert second == first
    assert first.water_update_id == "update-manual-once"
    assert first.reported_irrigation_event_id == "manual-once"
    assert first.applied_irrigation_event_id == "manual-once"
    assert first.effective_irrigation_mm == pytest.approx(8.0)
    assert _observation_counts(store, session.state_id) == (1, 1)
    growth_observed_at, growth_basis = _latest_growth_metadata(store, session.state_id)
    assert growth_observed_at == first.observed_at
    assert growth_basis is ObservationTimeBasis.EXPLICIT

    later_growth = resolve_growth_stage(
        state_id=session.state_id,
        crop_type=record.crop_type,
        planting_date=record.planting_date,
        current_date=date(2026, 7, 11),
    )
    no_event_water = compute_water_state(
        state_id=session.state_id,
        crop_type=record.crop_type,
        growth_stage=later_growth.growth_stage,
        soil_texture=record.soil_texture,
        current_date=date(2026, 7, 11),
        weather=_weather(),
        latitude_deg=record.location.latitude,
        elevation_m=record.location.elevation_m or 0.0,
        previous_root_zone_depletion_mm=first.root_zone_depletion_mm,
    )
    first_no_event = _cache_water_update(
        store,
        session.state_id,
        later_growth,
        no_event_water,
        effective_irrigation_mm=0.0,
    )
    second_no_event = _cache_water_update(
        store,
        session.state_id,
        later_growth,
        no_event_water,
        effective_irrigation_mm=0.0,
    )

    assert second_no_event == first_no_event
    assert _observation_counts(store, session.state_id) == (2, 2)


def test_store_contract_water_update_identity_conflicts_and_derivation(
    store_factory: StoreFactory,
) -> None:
    store = store_factory()
    session = store.create_session(_session_request(), state_id="state-update-id")
    record = store.get_record(session.state_id)
    observed_at = datetime(2026, 7, 10, 7, 30, tzinfo=timezone.utc)
    growth = resolve_growth_stage(
        state_id=session.state_id,
        crop_type=record.crop_type,
        planting_date=record.planting_date,
        current_date=date(2026, 7, 10),
    )
    first_weather = _weather(rainfall_mm=0.5)
    changed_weather = _weather(rainfall_mm=2.5)
    first_water = compute_water_state(
        state_id=session.state_id,
        crop_type=record.crop_type,
        growth_stage=growth.growth_stage,
        soil_texture=record.soil_texture,
        current_date=date(2026, 7, 10),
        weather=first_weather,
        latitude_deg=record.location.latitude,
        elevation_m=record.location.elevation_m or 0.0,
        observed_at=observed_at,
        observation_time_basis=ObservationTimeBasis.EXPLICIT,
    )
    changed_water = compute_water_state(
        state_id=session.state_id,
        crop_type=record.crop_type,
        growth_stage=growth.growth_stage,
        soil_texture=record.soil_texture,
        current_date=date(2026, 7, 10),
        weather=changed_weather,
        latitude_deg=record.location.latitude,
        elevation_m=record.location.elevation_m or 0.0,
        observed_at=observed_at,
        observation_time_basis=ObservationTimeBasis.EXPLICIT,
    )

    first = _cache_water_update(
        store,
        session.state_id,
        growth,
        first_water,
        weather=first_weather,
        water_update_id="same-update-id",
    )
    identical = _cache_water_update(
        store,
        session.state_id,
        growth,
        first_water,
        weather=first_weather,
        water_update_id="same-update-id",
    )

    assert identical == first
    assert _observation_counts(store, session.state_id) == (1, 1)
    with pytest.raises(WaterUpdatePayloadConflictError):
        _cache_water_update(
            store,
            session.state_id,
            growth,
            changed_water,
            weather=changed_weather,
            water_update_id="same-update-id",
        )

    with pytest.raises((WaterBaselineMismatchError, WaterObservationTimeConflictError)):
        _cache_water_update(
            store,
            session.state_id,
            growth,
            changed_water,
            weather=changed_weather,
            water_update_id="different-update-id",
        )
    assert _observation_counts(store, session.state_id) == (1, 1)

    derived = derive_water_update_id(
        state_id=session.state_id,
        observed_at=observed_at,
        observation_time_basis=ObservationTimeBasis.EXPLICIT,
    )
    assert derived == derive_water_update_id(
        state_id=session.state_id,
        observed_at=observed_at,
        observation_time_basis=ObservationTimeBasis.EXPLICIT,
    )
    assert derived != derive_water_update_id(
        state_id=session.state_id,
        observed_at=observed_at + timedelta(minutes=1),
        observation_time_basis=ObservationTimeBasis.EXPLICIT,
    )
    assert derived != derive_water_update_id(
        state_id="another-state",
        observed_at=observed_at,
        observation_time_basis=ObservationTimeBasis.EXPLICIT,
    )


def test_store_contract_canonical_water_baseline_can_advance_past_current_state(
    store_factory: StoreFactory,
) -> None:
    store = store_factory()
    session = store.create_session(_session_request(), state_id="state-water-chain")
    record = store.get_record(session.state_id)
    store.cache_disease_state(
        session.state_id,
        _disease(
            session.state_id,
            predicted_at=datetime(2026, 7, 10, 6, 0, tzinfo=timezone.utc),
        ),
    )
    first_growth = resolve_growth_stage(
        state_id=session.state_id,
        crop_type=record.crop_type,
        planting_date=record.planting_date,
        current_date=date(2026, 7, 10),
    )
    first_water = compute_water_state(
        state_id=session.state_id,
        crop_type=record.crop_type,
        growth_stage=first_growth.growth_stage,
        soil_texture=record.soil_texture,
        current_date=date(2026, 7, 10),
        weather=_weather(rainfall_mm=0.0),
        latitude_deg=record.location.latitude,
        elevation_m=record.location.elevation_m or 0.0,
    )
    first = _cache_water_update(
        store,
        session.state_id,
        first_growth,
        first_water,
        weather=_weather(rainfall_mm=0.0),
        water_update_id="water-chain-1",
    )
    store.update_current_state(session.state_id)
    committed = store.get_current_state(session.state_id)
    assert committed.root_zone_depletion_mm == pytest.approx(
        first.root_zone_depletion_mm
    )

    second_growth = resolve_growth_stage(
        state_id=session.state_id,
        crop_type=record.crop_type,
        planting_date=record.planting_date,
        current_date=date(2026, 7, 11),
    )
    second_water = compute_water_state(
        state_id=session.state_id,
        crop_type=record.crop_type,
        growth_stage=second_growth.growth_stage,
        soil_texture=record.soil_texture,
        current_date=date(2026, 7, 11),
        weather=_weather(rainfall_mm=0.0),
        latitude_deg=record.location.latitude,
        elevation_m=record.location.elevation_m or 0.0,
        previous_root_zone_depletion_mm=first.root_zone_depletion_mm,
    )
    second = _cache_water_update(
        store,
        session.state_id,
        second_growth,
        second_water,
        weather=_weather(rainfall_mm=0.0),
        water_update_id="water-chain-2",
    )

    baseline = store.get_canonical_water_baseline(session.state_id)
    assert baseline is not None
    assert baseline.water_sequence == 2
    assert baseline.water_observation_id == second.water_observation_id
    assert baseline.root_zone_depletion_mm == pytest.approx(
        second.root_zone_depletion_mm
    )
    assert store.get_current_state(session.state_id).root_zone_depletion_mm == pytest.approx(
        first.root_zone_depletion_mm
    )


def test_store_contract_historical_irrigation_reuse_persists_new_observation(
    store_factory: StoreFactory,
) -> None:
    store = store_factory()
    session = store.create_session(_session_request(), state_id="state-history-event")
    record = store.get_record(session.state_id)
    event = LastIrrigationEvent(
        irrigation_event_id="event-123",
        timestamp=datetime(2026, 7, 10, 6, 0, tzinfo=timezone.utc),
        amount_mm=8.0,
        source=IrrigationEventSource.MANUAL,
    )
    first_growth = resolve_growth_stage(
        state_id=session.state_id,
        crop_type=record.crop_type,
        planting_date=record.planting_date,
        current_date=date(2026, 7, 10),
    )
    first_weather = _weather(rainfall_mm=0.0)
    first_water = compute_water_state(
        state_id=session.state_id,
        crop_type=record.crop_type,
        growth_stage=first_growth.growth_stage,
        soil_texture=record.soil_texture,
        current_date=date(2026, 7, 10),
        weather=first_weather,
        latitude_deg=record.location.latitude,
        elevation_m=record.location.elevation_m or 0.0,
        last_irrigation_event=event,
    )
    first = _cache_water_update(
        store,
        session.state_id,
        first_growth,
        first_water,
        weather=first_weather,
        water_update_id="update-july-10",
        reported_irrigation_event=event,
        effective_irrigation_mm=event.amount_mm,
    )

    second_growth = resolve_growth_stage(
        state_id=session.state_id,
        crop_type=record.crop_type,
        planting_date=record.planting_date,
        current_date=date(2026, 7, 11),
    )
    second_weather = WeatherInput(
        tmin_c=25.0,
        tmax_c=35.0,
        humidity_pct=50.0,
        wind_speed_mps=2.5,
        shortwave_radiation_sum_mj_m2=22.0,
        rainfall_mm=0.0,
        eto_reference_feed=5.8,
    )
    second_water = compute_water_state(
        state_id=session.state_id,
        crop_type=record.crop_type,
        growth_stage=second_growth.growth_stage,
        soil_texture=record.soil_texture,
        current_date=date(2026, 7, 11),
        weather=second_weather,
        latitude_deg=record.location.latitude,
        elevation_m=record.location.elevation_m or 0.0,
        previous_root_zone_depletion_mm=first.root_zone_depletion,
        last_irrigation_event=None,
    )
    second = _cache_water_update(
        store,
        session.state_id,
        second_growth,
        second_water,
        weather=second_weather,
        water_update_id="update-july-11",
        reported_irrigation_event=event,
        effective_irrigation_mm=0.0,
    )

    assert second != first
    assert second.eto_computed != first.eto_computed
    assert second.etc != first.etc
    assert second.water_update_id == "update-july-11"
    assert second.reported_irrigation_event_id == "event-123"
    assert second.applied_irrigation_event_id is None
    assert second.effective_irrigation_mm == pytest.approx(0.0)
    assert second.irrigation_event_already_accounted_for is True
    assert second.root_zone_depletion > first.root_zone_depletion
    assert _observation_counts(store, session.state_id) == (2, 2)

    metadata = _water_observation_metadata(store, session.state_id)
    assert [row["water_update_id"] for row in metadata] == [
        "update-july-10",
        "update-july-11",
    ]
    assert [row["reported_irrigation_event_id"] for row in metadata] == [
        "event-123",
        "event-123",
    ]
    assert [row["irrigation_event_id"] for row in metadata] == [
        "event-123",
        None,
    ]
    assert [row["effective_irrigation_mm"] for row in metadata] == [8.0, 0.0]


def test_store_contract_irrigation_event_ownership_and_payload_conflicts(
    store_factory: StoreFactory,
) -> None:
    store = store_factory()
    first = store.create_session(_session_request(), state_id="state-event-a")
    second = store.create_session(_session_request(), state_id="state-event-b")
    first_record = store.get_record(first.state_id)
    growth = resolve_growth_stage(
        state_id=first.state_id,
        crop_type=first_record.crop_type,
        planting_date=first_record.planting_date,
        current_date=date(2026, 7, 10),
    )
    event = LastIrrigationEvent(
        irrigation_event_id="manual-owned",
        timestamp=datetime(2026, 7, 9, 8, 0, tzinfo=timezone.utc),
        amount_mm=8.0,
        source=IrrigationEventSource.MANUAL,
    )
    water = compute_water_state(
        state_id=first.state_id,
        crop_type=first_record.crop_type,
        growth_stage=growth.growth_stage,
        soil_texture=first_record.soil_texture,
        current_date=date(2026, 7, 10),
        weather=_weather(),
        latitude_deg=first_record.location.latitude,
        elevation_m=first_record.location.elevation_m or 0.0,
        last_irrigation_event=event,
    )
    _cache_water_update(
        store,
        first.state_id,
        growth,
        water,
        water_update_id="update-manual-owned",
        reported_irrigation_event=event,
        effective_irrigation_mm=event.amount_mm,
    )

    assert store.has_applied_irrigation_event(
        first.state_id,
        "manual-owned",
        irrigation_event=event,
    )
    assert not store.has_applied_irrigation_event(second.state_id, "missing-event")

    with pytest.raises(IrrigationEventStateMismatchError):
        store.has_applied_irrigation_event(
            second.state_id,
            "manual-owned",
            irrigation_event=event,
        )

    for conflicting_event in (
        LastIrrigationEvent(
            irrigation_event_id="manual-owned",
            timestamp=event.timestamp,
            amount_mm=9.0,
            source=IrrigationEventSource.MANUAL,
        ),
        LastIrrigationEvent(
            irrigation_event_id="manual-owned",
            timestamp=datetime(2026, 7, 9, 9, 0, tzinfo=timezone.utc),
            amount_mm=8.0,
            source=IrrigationEventSource.MANUAL,
        ),
        LastIrrigationEvent(
            irrigation_event_id="manual-owned",
            timestamp=event.timestamp,
            amount_mm=8.0,
            source=IrrigationEventSource.LEGACY_REQUEST,
        ),
    ):
        with pytest.raises(IrrigationEventPayloadConflictError):
            store.has_applied_irrigation_event(
                first.state_id,
                "manual-owned",
                irrigation_event=conflicting_event,
            )


def test_sqlalchemy_concurrent_identical_water_update_retry_is_idempotent(tmp_path) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'concurrent.db'}"
    setup_store = SQLAlchemyTwinStateStore(database_url=database_url, auto_create=True)
    session = setup_store.create_session(
        _session_request(),
        state_id="state-concurrent",
    )
    record = setup_store.get_record(session.state_id)
    growth = resolve_growth_stage(
        state_id=session.state_id,
        crop_type=record.crop_type,
        planting_date=record.planting_date,
        current_date=date(2026, 7, 10),
    )
    event = LastIrrigationEvent(
        irrigation_event_id="manual-concurrent",
        timestamp=datetime(2026, 7, 9, 8, 0, tzinfo=timezone.utc),
        amount_mm=8.0,
        source=IrrigationEventSource.MANUAL,
    )
    water = compute_water_state(
        state_id=session.state_id,
        crop_type=record.crop_type,
        growth_stage=growth.growth_stage,
        soil_texture=record.soil_texture,
        current_date=date(2026, 7, 10),
        weather=_weather(),
        latitude_deg=record.location.latitude,
        elevation_m=record.location.elevation_m or 0.0,
        last_irrigation_event=event,
    )
    barrier = threading.Barrier(2)

    def worker() -> object:
        store = SQLAlchemyTwinStateStore(
            database_url=database_url,
            auto_create=False,
        )
        barrier.wait(timeout=10)
        return _cache_water_update(
            store,
            session.state_id,
            growth,
            water,
            water_update_id="update-concurrent-identical",
            reported_irrigation_event=event,
            effective_irrigation_mm=event.amount_mm,
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _index: worker(), range(2)))

    assert results[0] == results[1]
    assert _observation_counts(setup_store, session.state_id) == (1, 1)
    metadata = _water_observation_metadata(setup_store, session.state_id)
    assert len(metadata) == 1
    assert metadata[0]["irrigation_event_id"] == "manual-concurrent"


def test_sqlalchemy_concurrent_conflicting_water_update_rejects_loser(tmp_path) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'conflicting-retry.db'}"
    setup_store = SQLAlchemyTwinStateStore(database_url=database_url, auto_create=True)
    session = setup_store.create_session(
        _session_request(),
        state_id="state-concurrent-conflict",
    )
    record = setup_store.get_record(session.state_id)
    observed_at = datetime(2026, 7, 10, 7, 30, tzinfo=timezone.utc)
    growth = resolve_growth_stage(
        state_id=session.state_id,
        crop_type=record.crop_type,
        planting_date=record.planting_date,
        current_date=date(2026, 7, 10),
    )
    first_weather = _weather(rainfall_mm=0.0)
    second_weather = _weather(rainfall_mm=4.0)

    def water_for(weather: WeatherInput):
        return compute_water_state(
            state_id=session.state_id,
            crop_type=record.crop_type,
            growth_stage=growth.growth_stage,
            soil_texture=record.soil_texture,
            current_date=date(2026, 7, 10),
            weather=weather,
            latitude_deg=record.location.latitude,
            elevation_m=record.location.elevation_m or 0.0,
            observed_at=observed_at,
            observation_time_basis=ObservationTimeBasis.EXPLICIT,
        )

    barrier = threading.Barrier(2)

    def worker(weather: WeatherInput) -> object:
        store = SQLAlchemyTwinStateStore(
            database_url=database_url,
            auto_create=False,
        )
        barrier.wait(timeout=10)
        try:
            return _cache_water_update(
                store,
                session.state_id,
                growth,
                water_for(weather),
                weather=weather,
                water_update_id="same-concurrent-update",
            )
        except Exception as exc:  # noqa: BLE001
            return exc

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(worker, [first_weather, second_weather]))

    successes = [result for result in results if not isinstance(result, Exception)]
    conflicts = [
        result for result in results if isinstance(result, WaterUpdatePayloadConflictError)
    ]
    assert len(successes) == 1
    assert len(conflicts) == 1
    assert _observation_counts(setup_store, session.state_id) == (1, 1)


def test_sqlalchemy_concurrent_different_updates_racing_for_event_retry_succeeds(
    tmp_path,
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'event-race.db'}"
    setup_store = SQLAlchemyTwinStateStore(database_url=database_url, auto_create=True)
    session = setup_store.create_session(
        _session_request(),
        state_id="state-event-race",
    )
    record = setup_store.get_record(session.state_id)
    event = LastIrrigationEvent(
        irrigation_event_id="manual-race",
        timestamp=datetime(2026, 7, 9, 8, 0, tzinfo=timezone.utc),
        amount_mm=8.0,
        source=IrrigationEventSource.MANUAL,
    )
    growth = resolve_growth_stage(
        state_id=session.state_id,
        crop_type=record.crop_type,
        planting_date=record.planting_date,
        current_date=date(2026, 7, 10),
    )
    weather = _weather()

    def water_for(
        observed_at: datetime,
        *,
        apply_event: bool,
        previous_root_zone_depletion_mm: float | None = None,
    ):
        return compute_water_state(
            state_id=session.state_id,
            crop_type=record.crop_type,
            growth_stage=growth.growth_stage,
            soil_texture=record.soil_texture,
            current_date=date(2026, 7, 10),
            weather=weather,
            latitude_deg=record.location.latitude,
            elevation_m=record.location.elevation_m or 0.0,
            last_irrigation_event=event if apply_event else None,
            previous_root_zone_depletion_mm=previous_root_zone_depletion_mm,
            observed_at=observed_at,
            observation_time_basis=ObservationTimeBasis.EXPLICIT,
        )

    attempts = {
        "update-race-a": datetime(2026, 7, 10, 7, 0, tzinfo=timezone.utc),
        "update-race-b": datetime(2026, 7, 10, 8, 0, tzinfo=timezone.utc),
    }
    barrier = threading.Barrier(2)

    def worker(item: tuple[str, datetime]) -> tuple[str, object]:
        update_id, observed_at = item
        store = SQLAlchemyTwinStateStore(
            database_url=database_url,
            auto_create=False,
        )
        barrier.wait(timeout=10)
        try:
            return (
                update_id,
                _cache_water_update(
                    store,
                    session.state_id,
                    growth,
                    water_for(observed_at, apply_event=True),
                    weather=weather,
                    water_update_id=update_id,
                    reported_irrigation_event=event,
                    effective_irrigation_mm=event.amount_mm,
                ),
            )
        except Exception as exc:  # noqa: BLE001
            return update_id, exc

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(worker, attempts.items()))

    successes = {
        update_id: result
        for update_id, result in results
        if not isinstance(result, Exception)
    }
    conflicts = {
        update_id: result
        for update_id, result in results
        if isinstance(result, WaterUpdateConcurrencyConflictError)
    }
    assert len(successes) == 1
    assert len(conflicts) == 1
    assert _observation_counts(setup_store, session.state_id) == (1, 1)

    losing_update_id = next(iter(conflicts))
    losing_observed_at = attempts[losing_update_id]
    retry_store = SQLAlchemyTwinStateStore(
        database_url=database_url,
        auto_create=False,
    )
    winning_water = next(iter(successes.values()))
    assert not isinstance(winning_water, Exception)
    retry_observed_at = max(
        losing_observed_at,
        winning_water.observed_at + timedelta(minutes=1),
    )
    retry = _cache_water_update(
        retry_store,
        session.state_id,
        growth,
        water_for(
            retry_observed_at,
            apply_event=False,
            previous_root_zone_depletion_mm=winning_water.root_zone_depletion_mm,
        ),
        weather=weather,
        water_update_id=losing_update_id,
        reported_irrigation_event=event,
        effective_irrigation_mm=0.0,
    )

    assert retry.water_update_id == losing_update_id
    assert retry.reported_irrigation_event_id == "manual-race"
    assert retry.applied_irrigation_event_id is None
    assert retry.effective_irrigation_mm == pytest.approx(0.0)
    assert retry.irrigation_event_already_accounted_for is True
    assert _observation_counts(setup_store, session.state_id) == (2, 2)
    metadata = _water_observation_metadata(setup_store, session.state_id)
    assert [row["irrigation_event_id"] for row in metadata].count("manual-race") == 1


def test_sqlalchemy_store_persists_across_instances_and_rolls_back(tmp_path) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'persisted.db'}"
    first = SQLAlchemyTwinStateStore(database_url=database_url, auto_create=True)
    session = first.create_session(_session_request(), state_id="state-persisted")
    farm = first.create_farm(FarmCreateRequest(name="Persistent Farm"))
    assert first.count() == 1

    with pytest.raises(ValueError):
        first.create_session(_session_request(), state_id=session.state_id)
    assert first.count() == 1

    second = SQLAlchemyTwinStateStore(database_url=database_url, auto_create=True)
    assert second.get_record(session.state_id).state_id == session.state_id
    assert second.get_farm(farm.farm_id) == farm


def test_sqlite_foreign_keys_are_enforced(tmp_path) -> None:
    store = SQLAlchemyTwinStateStore(
        database_url=f"sqlite+pysqlite:///{tmp_path / 'fk.db'}",
        auto_create=True,
    )
    with store._session_factory() as session:  # noqa: SLF001
        with pytest.raises(IntegrityError):
            with session.begin():
                session.execute(
                    text(
                        "INSERT INTO plots "
                        "(plot_id, farm_id, name, location_name, latitude, "
                        "longitude, elevation_m, soil_texture, created_at, updated_at) "
                        "VALUES "
                        "('plot-bad', 'farm-missing', 'Bad', 'Bad', 0, 0, 0, "
                        "'loam', '2026-07-10T00:00:00', '2026-07-10T00:00:00')"
                    )
                )


def test_store_unknown_ids_and_clear(
    store_factory: StoreFactory,
) -> None:
    store = store_factory()
    with pytest.raises(StateNotFoundError):
        store.get_record("missing")

    store.create_session(_session_request())
    assert store.count() == 1
    store.clear()
    assert store.count() == 0
