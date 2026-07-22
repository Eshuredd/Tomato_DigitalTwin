from __future__ import annotations

from datetime import date, datetime, timezone, timedelta
import math

import pytest
from pydantic import ValidationError

from app.schemas import (
    ComputeWaterStateRequest,
    CropType,
    GrowthStage,
    LastIrrigationEvent,
    ObservationTimeBasis,
    SoilTexture,
    WeatherInput,
)
from app.water.water_balance import (
    RootZoneBalanceResult,
    compute_water_state,
    update_root_zone_depletion_mm,
)
from app.water.update_identity import (
    compute_water_update_fingerprint,
    derive_water_update_id,
)


def _weather(*, rainfall_mm: float = 0.0) -> WeatherInput:
    return WeatherInput(
        tmin_c=22.0,
        tmax_c=31.0,
        humidity_pct=62.0,
        wind_speed_mps=2.1,
        shortwave_radiation_sum_mj_m2=18.5,
        rainfall_mm=rainfall_mm,
        eto_reference_feed=4.9,
    )


@pytest.mark.parametrize(
    (
        "previous",
        "etc",
        "rainfall",
        "irrigation",
        "taw",
        "expected",
    ),
    [
        (4.0, 3.0, 1.0, 0.0, 40.0, (6.0, 6.0, 0.0, 0.0)),
        (4.0, 3.0, 10.0, 0.0, 40.0, (-3.0, 0.0, 3.0, 0.0)),
        (35.0, 10.0, 0.0, 0.0, 40.0, (45.0, 40.0, 0.0, 5.0)),
        (2.0, 3.0, 2.0, 8.0, 40.0, (-5.0, 0.0, 5.0, 0.0)),
    ],
)
def test_root_zone_balance_mass_accounting(
    previous: float,
    etc: float,
    rainfall: float,
    irrigation: float,
    taw: float,
    expected: tuple[float, float, float, float],
) -> None:
    result = update_root_zone_depletion_mm(
        previous_root_zone_depletion_mm=previous,
        etc_mm=etc,
        rainfall_mm=rainfall,
        irrigation_mm=irrigation,
        taw_mm=taw,
    )

    assert isinstance(result, RootZoneBalanceResult)
    assert result.raw_root_zone_depletion_mm == pytest.approx(expected[0])
    assert result.root_zone_depletion_mm == pytest.approx(expected[1])
    assert result.water_surplus_mm == pytest.approx(expected[2])
    assert result.depletion_beyond_taw_mm == pytest.approx(expected[3])
    assert 0.0 <= result.root_zone_depletion_mm <= taw
    assert not (
        result.water_surplus_mm > 0.0
        and result.depletion_beyond_taw_mm > 0.0
    )


@pytest.mark.parametrize(
    "kwargs",
    [
        {"etc_mm": -1.0},
        {"rainfall_mm": -1.0},
        {"irrigation_mm": -1.0},
        {"previous_root_zone_depletion_mm": -1.0},
        {"previous_root_zone_depletion_mm": 41.0},
        {"taw_mm": -1.0},
        {"etc_mm": math.inf},
    ],
)
def test_root_zone_balance_rejects_invalid_inputs(kwargs: dict[str, float]) -> None:
    values = {
        "previous_root_zone_depletion_mm": 4.0,
        "etc_mm": 3.0,
        "rainfall_mm": 1.0,
        "irrigation_mm": 0.0,
        "taw_mm": 40.0,
    }
    values.update(kwargs)

    with pytest.raises(ValueError):
        update_root_zone_depletion_mm(**values)


def test_water_response_tracks_surplus_without_reusing_it() -> None:
    observed_at = datetime(2026, 7, 10, 6, 0, tzinfo=timezone.utc)
    wet = compute_water_state(
        state_id="state-1",
        crop_type=CropType.TOMATO,
        growth_stage=GrowthStage.DEVELOPMENT,
        soil_texture=SoilTexture.SANDY_LOAM,
        current_date=date(2026, 7, 10),
        weather=_weather(rainfall_mm=40.0),
        latitude_deg=17.385,
        elevation_m=542.0,
        previous_root_zone_depletion_mm=2.0,
        observed_at=observed_at,
    )
    next_day = compute_water_state(
        state_id="state-1",
        crop_type=CropType.TOMATO,
        growth_stage=GrowthStage.DEVELOPMENT,
        soil_texture=SoilTexture.SANDY_LOAM,
        current_date=date(2026, 7, 11),
        weather=_weather(rainfall_mm=0.0),
        latitude_deg=17.385,
        elevation_m=542.0,
        previous_root_zone_depletion_mm=wet.root_zone_depletion,
    )

    assert wet.water_surplus_mm > 0.0
    assert wet.root_zone_depletion == 0.0
    assert next_day.raw_root_zone_depletion_mm == pytest.approx(next_day.etc)
    assert not hasattr(wet, "runoff_mm")
    assert not hasattr(wet, "deep_drainage_mm")


def test_compute_water_state_observed_at_fallback_and_explicit_basis() -> None:
    fallback = compute_water_state(
        state_id="state-1",
        crop_type=CropType.TOMATO,
        growth_stage=GrowthStage.DEVELOPMENT,
        soil_texture=SoilTexture.SANDY_LOAM,
        current_date=date(2026, 7, 10),
        weather=_weather(),
        latitude_deg=17.385,
        elevation_m=542.0,
    )

    assert fallback.observed_at == datetime(2026, 7, 10, tzinfo=timezone.utc)
    assert fallback.observation_time_basis is ObservationTimeBasis.DATE_ONLY_UTC_START

    explicit = compute_water_state(
        state_id="state-1",
        crop_type=CropType.TOMATO,
        growth_stage=GrowthStage.DEVELOPMENT,
        soil_texture=SoilTexture.SANDY_LOAM,
        current_date=date(2026, 7, 10),
        weather=_weather(),
        latitude_deg=17.385,
        elevation_m=542.0,
        observed_at=datetime(2026, 7, 10, 7, 30, tzinfo=timezone.utc),
    )

    assert explicit.observation_time_basis is ObservationTimeBasis.EXPLICIT
    assert explicit.computed_at.tzinfo is not None


def test_compute_water_request_validates_explicit_observed_at() -> None:
    ist = timezone(timedelta(hours=5, minutes=30))
    request = ComputeWaterStateRequest(
        state_id="state-1",
        current_date=date(2026, 7, 10),
        weather=_weather(),
        observed_at=datetime(2026, 7, 10, 5, 30, tzinfo=ist),
    )

    assert request.observed_at == datetime(2026, 7, 10, tzinfo=timezone.utc)

    with pytest.raises(ValidationError):
        ComputeWaterStateRequest(
            state_id="state-1",
            current_date=date(2026, 7, 10),
            weather=_weather(),
            observed_at=datetime(2026, 7, 10, 5, 30),
        )

    with pytest.raises(ValidationError):
        ComputeWaterStateRequest(
            state_id="state-1",
            current_date=date(2026, 7, 10),
            weather=_weather(),
            observed_at=datetime(2026, 7, 11, 0, 30, tzinfo=timezone.utc),
        )


def test_compute_water_request_validates_water_update_id() -> None:
    request = ComputeWaterStateRequest(
        state_id="state-1",
        water_update_id="  update-1  ",
        current_date=date(2026, 7, 10),
        weather=_weather(),
    )
    assert request.water_update_id == "update-1"

    with pytest.raises(ValidationError):
        ComputeWaterStateRequest(
            state_id="state-1",
            water_update_id="   ",
            current_date=date(2026, 7, 10),
            weather=_weather(),
        )

    with pytest.raises(ValidationError):
        ComputeWaterStateRequest(
            state_id="state-1",
            water_update_id="x" * 161,
            current_date=date(2026, 7, 10),
            weather=_weather(),
        )


def test_compute_water_request_validates_base_water_lineage() -> None:
    first_base = ComputeWaterStateRequest(
        state_id="state-1",
        current_date=date(2026, 7, 10),
        weather=_weather(),
        base_water_observation_id=None,
        base_water_sequence=0,
    )
    assert first_base.base_water_observation_id is None
    assert first_base.base_water_sequence == 0

    with pytest.raises(ValidationError):
        ComputeWaterStateRequest(
            state_id="state-1",
            current_date=date(2026, 7, 10),
            weather=_weather(),
            base_water_sequence=1,
        )

    with pytest.raises(ValidationError):
        ComputeWaterStateRequest(
            state_id="state-1",
            current_date=date(2026, 7, 10),
            weather=_weather(),
            base_water_observation_id="water-1",
        )

    with pytest.raises(ValidationError):
        ComputeWaterStateRequest(
            state_id="state-1",
            current_date=date(2026, 7, 10),
            weather=_weather(),
            base_water_observation_id="   ",
            base_water_sequence=1,
        )


def test_water_update_identity_helpers_are_stable_and_canonical() -> None:
    observed_at = datetime(2026, 7, 10, 7, 30, tzinfo=timezone.utc)
    event = LastIrrigationEvent(
        irrigation_event_id="event-1",
        timestamp=datetime(2026, 7, 9, 8, 0, tzinfo=timezone.utc),
        amount_mm=5.0,
    )
    derived = derive_water_update_id(
        state_id="state-1",
        observed_at=observed_at,
        observation_time_basis=ObservationTimeBasis.EXPLICIT,
    )

    assert derived.startswith("derived-water-update-")
    assert derived == derive_water_update_id(
        state_id="state-1",
        observed_at=observed_at,
        observation_time_basis=ObservationTimeBasis.EXPLICIT,
    )

    first = compute_water_update_fingerprint(
        state_id="state-1",
        water_update_id="update-1",
        current_date=date(2026, 7, 10),
        observed_at=observed_at,
        observation_time_basis=ObservationTimeBasis.EXPLICIT,
        weather=_weather(rainfall_mm=0.0),
        last_irrigation_event=event,
    )
    changed_weather = compute_water_update_fingerprint(
        state_id="state-1",
        water_update_id="update-1",
        current_date=date(2026, 7, 10),
        observed_at=observed_at,
        observation_time_basis=ObservationTimeBasis.EXPLICIT,
        weather=_weather(rainfall_mm=1.0),
        last_irrigation_event=event,
    )
    no_event = compute_water_update_fingerprint(
        state_id="state-1",
        water_update_id="update-1",
        current_date=date(2026, 7, 10),
        observed_at=observed_at,
        observation_time_basis=ObservationTimeBasis.EXPLICIT,
        weather=_weather(rainfall_mm=0.0),
        last_irrigation_event=None,
    )

    assert len(first) == 64
    assert first != changed_weather
    assert first != no_event


def test_last_irrigation_event_requires_aware_timestamp() -> None:
    with pytest.raises(ValidationError):
        LastIrrigationEvent(
            timestamp=datetime(2026, 7, 10, 6, 0),
            amount_mm=2.0,
        )
