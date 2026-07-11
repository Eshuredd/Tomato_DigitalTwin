"""FAO-56-style tomato root-zone water balance helpers.

This module computes a simplified bucket-style root-zone water balance for
MVP water-state estimation. It combines ETo, Kc, soil texture, root depth,
rainfall, and irrigation without external dependencies or route logic.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
import math

from app.schemas import (
    CropType,
    EtoMethod,
    GrowthStage,
    LastIrrigationEvent,
    MoistureState,
    SoilTexture,
    StressBand,
    WaterStateResponse,
    WeatherInput,
)
from app.water.crop_coefficients import get_kc_for_stage
from app.water.eto import compute_eto, day_of_year_from_date


@dataclass(frozen=True)
class SoilWaterParams:
    field_capacity: float
    wilting_point: float


DEFAULT_SOIL_WATER_PARAMS_BY_TEXTURE: dict[SoilTexture, SoilWaterParams] = {
    SoilTexture.SAND: SoilWaterParams(field_capacity=0.10, wilting_point=0.04),
    SoilTexture.SANDY_LOAM: SoilWaterParams(field_capacity=0.22, wilting_point=0.10),
    SoilTexture.LOAM: SoilWaterParams(field_capacity=0.27, wilting_point=0.12),
    SoilTexture.SILTY_LOAM: SoilWaterParams(field_capacity=0.33, wilting_point=0.13),
    SoilTexture.CLAY_LOAM: SoilWaterParams(field_capacity=0.34, wilting_point=0.20),
    SoilTexture.CLAY: SoilWaterParams(field_capacity=0.40, wilting_point=0.25),
}

DEFAULT_SOIL_PARAMETER_BASIS = (
    "mvp_assumed_volumetric_field_capacity_wilting_point_by_soil_texture"
)

DEFAULT_ROOT_DEPTH_M_BY_STAGE: dict[GrowthStage, float] = {
    GrowthStage.INITIAL: 0.25,
    GrowthStage.DEVELOPMENT: 0.40,
    GrowthStage.MID_SEASON: 0.70,
    GrowthStage.LATE_SEASON: 0.70,
}

DEFAULT_ROOT_DEPTH_BASIS = "mvp_assumed_tomato_root_depth_by_growth_stage"

DEFAULT_P_ALLOWABLE = 0.50


def _is_finite_number(value: object) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )


def _validate_finite_number(name: str, value: object) -> float:
    if not _is_finite_number(value):
        raise ValueError(f"{name} must be a finite number.")
    return float(value)


def _validate_finite_positive_number(name: str, value: object) -> float:
    if not _is_finite_number(value):
        raise ValueError(f"{name} must be a finite number.")

    result = float(value)

    if result <= 0.0:
        raise ValueError(f"{name} must be greater than 0.")

    return result


def _validate_finite_non_negative_number(name: str, value: object) -> float:
    if not _is_finite_number(value):
        raise ValueError(f"{name} must be a finite number.")

    result = float(value)

    if result < 0.0:
        raise ValueError(f"{name} must be >= 0.")

    return result


def validate_soil_water_params(params: SoilWaterParams) -> None:
    """Validate volumetric soil water parameters."""
    if not isinstance(params, SoilWaterParams):
        raise ValueError("params must be a SoilWaterParams instance.")

    field_capacity = _validate_finite_positive_number(
        "field_capacity",
        params.field_capacity,
    )
    wilting_point = _validate_finite_positive_number(
        "wilting_point",
        params.wilting_point,
    )

    if field_capacity <= wilting_point:
        raise ValueError("field_capacity must be greater than wilting_point.")

    if field_capacity >= 1.0:
        raise ValueError("field_capacity must be less than 1.0.")

    if wilting_point >= 1.0:
        raise ValueError("wilting_point must be less than 1.0.")


def get_soil_water_params(
    soil_texture: SoilTexture,
    params_by_texture: dict[SoilTexture, SoilWaterParams] | None = None,
) -> SoilWaterParams:
    """Return the soil water parameters for a given soil texture."""
    if not isinstance(soil_texture, SoilTexture):
        raise ValueError("soil_texture must be a SoilTexture enum member.")

    selected_params = (
        params_by_texture
        if params_by_texture is not None
        else DEFAULT_SOIL_WATER_PARAMS_BY_TEXTURE
    )

    if not isinstance(selected_params, dict):
        raise ValueError(
            "params_by_texture must be a dict of SoilTexture to SoilWaterParams."
        )

    for texture in selected_params:
        if not isinstance(texture, SoilTexture):
            raise ValueError(
                "All params_by_texture keys must be SoilTexture enum members."
            )

    texture_keys = set(selected_params.keys())
    expected_keys = set(SoilTexture)
    missing = expected_keys - texture_keys
    extra = texture_keys - expected_keys

    if missing or extra:
        raise ValueError(
            "params_by_texture must contain exactly all SoilTexture keys; "
            f"missing={missing}, extra={extra}."
        )

    for params in selected_params.values():
        validate_soil_water_params(params)

    return selected_params[soil_texture]


def validate_root_depth_by_stage(
    root_depth_by_stage: dict[GrowthStage, float],
) -> None:
    """Validate root depth configuration keyed by GrowthStage."""
    if not isinstance(root_depth_by_stage, dict):
        raise ValueError(
            "root_depth_by_stage must be a dict of GrowthStage to float values."
        )

    for stage in root_depth_by_stage:
        if not isinstance(stage, GrowthStage):
            raise ValueError(
                "All root_depth_by_stage keys must be GrowthStage enum members."
            )

    stages = set(root_depth_by_stage.keys())
    expected = set(GrowthStage)
    missing = expected - stages
    extra = stages - expected

    if missing or extra:
        raise ValueError(
            "root_depth_by_stage must contain exactly the tomato GrowthStage keys; "
            f"missing={missing}, extra={extra}."
        )

    for stage, value in root_depth_by_stage.items():
        if not _is_finite_number(value):
            raise ValueError(
                f"Root depth for {stage.value} must be a finite number."
            )

        if float(value) <= 0.0:
            raise ValueError(
                f"Root depth for {stage.value} must be greater than 0."
            )


def get_root_depth_m(
    growth_stage: GrowthStage,
    root_depth_by_stage: dict[GrowthStage, float] | None = None,
) -> float:
    """Return the root depth in meters for a given growth stage."""
    if not isinstance(growth_stage, GrowthStage):
        raise ValueError("growth_stage must be a GrowthStage enum member.")

    config = (
        root_depth_by_stage
        if root_depth_by_stage is not None
        else DEFAULT_ROOT_DEPTH_M_BY_STAGE
    )

    validate_root_depth_by_stage(config)

    return float(config[growth_stage])


def compute_taw_mm(
    *,
    field_capacity: float,
    wilting_point: float,
    root_depth_m: float,
) -> float:
    """Compute total available water, TAW, in millimeters."""
    field_capacity = _validate_finite_positive_number(
        "field_capacity",
        field_capacity,
    )
    wilting_point = _validate_finite_positive_number(
        "wilting_point",
        wilting_point,
    )
    root_depth_m = _validate_finite_positive_number(
        "root_depth_m",
        root_depth_m,
    )

    if field_capacity <= wilting_point:
        raise ValueError("field_capacity must be greater than wilting_point.")

    return 1000.0 * (field_capacity - wilting_point) * root_depth_m


def compute_raw_threshold_mm(
    *,
    taw_mm: float,
    p_allowable: float,
) -> float:
    """Compute the root-zone depletion threshold at which stress begins."""
    taw = _validate_finite_non_negative_number("taw_mm", taw_mm)
    p = _validate_finite_number("p_allowable", p_allowable)

    if p < 0.0 or p > 1.0:
        raise ValueError("p_allowable must be between 0.0 and 1.0 inclusive.")

    return taw * p


def update_root_zone_depletion_mm(
    *,
    previous_root_zone_depletion_mm: float | None,
    etc_mm: float,
    rainfall_mm: float,
    irrigation_mm: float,
    taw_mm: float,
) -> float:
    """Update root-zone depletion based on ETc, rainfall, and irrigation."""
    prev = (
        0.0
        if previous_root_zone_depletion_mm is None
        else _validate_finite_non_negative_number(
            "previous_root_zone_depletion_mm",
            previous_root_zone_depletion_mm,
        )
    )
    etc = _validate_finite_non_negative_number("etc_mm", etc_mm)
    rain = _validate_finite_non_negative_number("rainfall_mm", rainfall_mm)
    irrigation = _validate_finite_non_negative_number(
        "irrigation_mm",
        irrigation_mm,
    )
    taw = _validate_finite_non_negative_number("taw_mm", taw_mm)

    new_depletion = prev + etc - rain - irrigation

    return min(max(new_depletion, 0.0), taw)


def classify_moisture_state(
    *,
    root_zone_depletion_mm: float,
    raw_threshold_mm: float,
) -> MoistureState:
    """Classify the moisture state of the root zone."""
    depletion = _validate_finite_non_negative_number(
        "root_zone_depletion_mm",
        root_zone_depletion_mm,
    )
    raw_threshold = _validate_finite_non_negative_number(
        "raw_threshold_mm",
        raw_threshold_mm,
    )

    if raw_threshold <= 0.0:
        return MoistureState.ADEQUATE

    if depletion < 0.5 * raw_threshold:
        return MoistureState.ADEQUATE

    if depletion < raw_threshold:
        return MoistureState.MODERATE_DEFICIT

    return MoistureState.DEPLETED


def classify_stress_band(
    *,
    root_zone_depletion_mm: float,
    raw_threshold_mm: float,
) -> StressBand:
    """Classify stress band using root-zone depletion thresholds."""
    depletion = _validate_finite_non_negative_number(
        "root_zone_depletion_mm",
        root_zone_depletion_mm,
    )
    raw_threshold = _validate_finite_non_negative_number(
        "raw_threshold_mm",
        raw_threshold_mm,
    )

    if raw_threshold <= 0.0:
        return StressBand.LOW

    if depletion < 0.5 * raw_threshold:
        return StressBand.LOW

    if depletion < raw_threshold:
        return StressBand.MEDIUM

    return StressBand.HIGH


def extract_irrigation_amount_mm(
    last_irrigation_event: LastIrrigationEvent | None,
    current_date: date,
) -> float:
    """Extract irrigation amount from the last irrigation event.

    The caller is responsible for ensuring the event has not already been
    applied to previous_root_zone_depletion_mm.
    """
    if not isinstance(current_date, date):
        raise ValueError("current_date must be a date.")

    if last_irrigation_event is None:
        return 0.0

    if not isinstance(last_irrigation_event, LastIrrigationEvent):
        raise ValueError(
            "last_irrigation_event must be a LastIrrigationEvent instance."
        )

    amount_mm = _validate_finite_non_negative_number(
        "last_irrigation_event.amount_mm",
        last_irrigation_event.amount_mm,
    )

    if last_irrigation_event.timestamp.date() > current_date:
        raise ValueError("last_irrigation_event.timestamp cannot be after current_date.")

    return amount_mm


def compute_water_state(
    *,
    state_id: str,
    crop_type: CropType,
    growth_stage: GrowthStage,
    soil_texture: SoilTexture,
    current_date: date,
    weather: WeatherInput,
    latitude_deg: float,
    elevation_m: float,
    last_irrigation_event: LastIrrigationEvent | None = None,
    previous_root_zone_depletion_mm: float | None = None,
    p_allowable: float = DEFAULT_P_ALLOWABLE,
    computed_at: datetime | None = None,
) -> WaterStateResponse:
    """Compute a WaterStateResponse from weather, growth stage, and soil assumptions."""
    if not isinstance(state_id, str) or not state_id.strip():
        raise ValueError("state_id must be a non-empty string.")

    if crop_type is not CropType.TOMATO:
        raise ValueError("Only CropType.TOMATO is supported.")

    if not isinstance(growth_stage, GrowthStage):
        raise ValueError("growth_stage must be a GrowthStage enum member.")

    if not isinstance(soil_texture, SoilTexture):
        raise ValueError("soil_texture must be a SoilTexture enum member.")

    if not isinstance(current_date, date):
        raise ValueError("current_date must be a date.")

    if not isinstance(weather, WeatherInput):
        raise ValueError("weather must be a WeatherInput instance.")

    latitude = _validate_finite_number("latitude_deg", latitude_deg)
    if latitude < -90.0 or latitude > 90.0:
        raise ValueError("latitude_deg must be between -90 and 90 inclusive.")

    elevation = _validate_finite_number("elevation_m", elevation_m)

    p_allowable_value = _validate_finite_number("p_allowable", p_allowable)
    if p_allowable_value < 0.0 or p_allowable_value > 1.0:
        raise ValueError("p_allowable must be between 0.0 and 1.0 inclusive.")

    day_of_year = day_of_year_from_date(current_date.isoformat())

    eto_result = compute_eto(
        tmin_c=weather.tmin_c,
        tmax_c=weather.tmax_c,
        humidity_pct=weather.humidity_pct,
        wind_speed_mps=weather.wind_speed_mps,
        shortwave_radiation_sum_mj_m2=weather.shortwave_radiation_sum_mj_m2,
        latitude_deg=latitude,
        elevation_m=elevation,
        day_of_year=day_of_year,
        eto_reference_feed=weather.eto_reference_feed,
    )

    if "eto_value" not in eto_result or "eto_method" not in eto_result:
        raise ValueError("compute_eto did not return expected keys.")

    eto_computed = _validate_finite_non_negative_number(
        "eto_value",
        eto_result["eto_value"],
    )

    eto_method_string = eto_result["eto_method"]

    if eto_method_string == "penman_monteith":
        eto_method = EtoMethod.PENMAN_MONTEITH
    elif eto_method_string == "hargreaves_samani":
        eto_method = EtoMethod.HARGREAVES_SAMANI
    else:
        raise ValueError("Unknown eto_method returned from compute_eto.")

    kc = get_kc_for_stage(growth_stage)
    etc = eto_computed * float(kc)

    soil_params = get_soil_water_params(soil_texture)
    root_depth_assumed = get_root_depth_m(growth_stage)

    taw = compute_taw_mm(
        field_capacity=soil_params.field_capacity,
        wilting_point=soil_params.wilting_point,
        root_depth_m=root_depth_assumed,
    )
    raw_threshold = compute_raw_threshold_mm(
        taw_mm=taw,
        p_allowable=p_allowable_value,
    )

    irrigation_mm = extract_irrigation_amount_mm(
        last_irrigation_event,
        current_date,
    )

    root_zone_depletion = update_root_zone_depletion_mm(
        previous_root_zone_depletion_mm=previous_root_zone_depletion_mm,
        etc_mm=etc,
        rainfall_mm=weather.rainfall_mm,
        irrigation_mm=irrigation_mm,
        taw_mm=taw,
    )

    estimated_moisture_state = classify_moisture_state(
        root_zone_depletion_mm=root_zone_depletion,
        raw_threshold_mm=raw_threshold,
    )
    stress_band = classify_stress_band(
        root_zone_depletion_mm=root_zone_depletion,
        raw_threshold_mm=raw_threshold,
    )

    computed_at_value = (
        computed_at if computed_at is not None else datetime.now(timezone.utc)
    )
    if not isinstance(computed_at_value, datetime):
        raise ValueError("computed_at must be a datetime.")

    return WaterStateResponse(
        state_id=state_id,
        crop_type=crop_type,
        growth_stage=growth_stage,
        soil_texture=soil_texture,
        eto_computed=eto_computed,
        eto_method=eto_method,
        eto_reference_feed=eto_result.get("eto_reference_feed"),
        eto_delta_pct=eto_result.get("eto_delta_pct"),
        kc=float(kc),
        etc=etc,
        field_capacity_assumed=soil_params.field_capacity,
        wilting_point_assumed=soil_params.wilting_point,
        root_depth_assumed=root_depth_assumed,
        taw=taw,
        p_allowable=p_allowable_value,
        raw_threshold=raw_threshold,
        root_zone_depletion=root_zone_depletion,
        estimated_moisture_state=estimated_moisture_state,
        stress_band=stress_band,
        computed_at=computed_at_value,
    )