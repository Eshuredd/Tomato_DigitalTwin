from __future__ import annotations

from datetime import date, datetime, timezone
from enum import Enum
import math
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class CropType(str, Enum):
    TOMATO = "tomato"


class GrowthStage(str, Enum):
    INITIAL = "initial"
    DEVELOPMENT = "development"
    MID_SEASON = "mid_season"
    LATE_SEASON = "late_season"


class SoilTexture(str, Enum):
    SAND = "sand"
    SANDY_LOAM = "sandy_loam"
    LOAM = "loam"
    SILTY_LOAM = "silty_loam"
    CLAY_LOAM = "clay_loam"
    CLAY = "clay"


class ObservationTimeBasis(str, Enum):
    EXPLICIT = "EXPLICIT"
    DATE_ONLY_UTC_START = "DATE_ONLY_UTC_START"
    SERVER_RECEIVED = "SERVER_RECEIVED"


class IrrigationEventSource(str, Enum):
    MANUAL = "MANUAL"
    CONVERTED_FROM_LITRES = "CONVERTED_FROM_LITRES"
    CONVERTED_FROM_DRIP_RUNTIME = "CONVERTED_FROM_DRIP_RUNTIME"
    CONTROLLER = "CONTROLLER"
    SENSOR = "SENSOR"
    LEGACY_REQUEST = "LEGACY_REQUEST"


class ActionEnum(str, Enum):
    IRRIGATE_NOW = "IRRIGATE_NOW"
    IRRIGATE_IN_6H = "IRRIGATE_IN_6H"
    IRRIGATE_TOMORROW_AM = "IRRIGATE_TOMORROW_AM"
    NO_IRRIGATION_24H = "NO_IRRIGATION_24H"


class IrrigationConstraint(str, Enum):
    NONE = "NONE"
    AVOID_OVERHEAD_IRRIGATION = "AVOID_OVERHEAD_IRRIGATION"
    PREFER_EARLY_MORNING_WINDOW = "PREFER_EARLY_MORNING_WINDOW"


class UncertaintyBand(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class StressBand(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class MoistureState(str, Enum):
    ADEQUATE = "adequate"
    MODERATE_DEFICIT = "moderate_deficit"
    DEPLETED = "depleted"


class EtoMethod(str, Enum):
    PENMAN_MONTEITH = "penman_monteith"
    HARGREAVES_SAMANI = "hargreaves_samani"


class DiseaseCategory(str, Enum):
    FUNGAL = "fungal"
    BACTERIAL = "bacterial"
    VIRAL = "viral"
    NONE = "none"


class CautionReason(str, Enum):
    HIGH_UNCERTAINTY = "HIGH_UNCERTAINTY"
    FUNGAL_DISEASE_RISK = "FUNGAL_DISEASE_RISK"


class Location(BaseModel):
    name: Annotated[str, Field(min_length=1)]
    latitude: float
    longitude: float
    elevation_m: float | None = None

    model_config = ConfigDict(extra="forbid")

    @field_validator("latitude", "longitude", "elevation_m")
    @classmethod
    def _finite_location_number(cls, value: float | None) -> float | None:
        if value is None:
            return None
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("Location numeric fields must be finite numbers.")
        if not math.isfinite(float(value)):
            raise ValueError("Location numeric fields must be finite numbers.")
        return float(value)

    @model_validator(mode="after")
    def _valid_coordinates(self) -> Location:
        if self.latitude < -90.0 or self.latitude > 90.0:
            raise ValueError("latitude must be between -90 and 90 inclusive.")
        if self.longitude < -180.0 or self.longitude > 180.0:
            raise ValueError("longitude must be between -180 and 180 inclusive.")
        return self


class StateIdRequest(BaseModel):
    state_id: str

    model_config = ConfigDict(extra="forbid")


class HistoryEvent(BaseModel):
    timestamp: datetime
    growth_stage: GrowthStage
    predicted_label: str
    root_zone_depletion: float
    stress_band: StressBand


def _ensure_utc_aware(value: datetime, field_name: str) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{field_name} must be timezone-aware.")
    return value.astimezone(timezone.utc)


def _finite_non_negative_float(value: float | None, field_name: str) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field_name} must be a finite number.")
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(f"{field_name} must be a finite number.")
    if result < 0.0:
        raise ValueError(f"{field_name} must be >= 0.")
    return result


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str


class DiseaseClassInfo(BaseModel):
    label: str
    category: DiseaseCategory


class UncertaintyThresholds(BaseModel):
    low_lt: float
    medium_lt: float
    high_gte: float


class DiseaseModelInfo(BaseModel):
    model_name: str
    model_version: str
    dataset: str
    calibration_method: str
    uncertainty_method: str
    uncertainty_thresholds: UncertaintyThresholds
    classes: list[DiseaseClassInfo]
    ece_validation_score: float


class GrowthStageConfigInfo(BaseModel):
    source: str
    stages_days: dict[str, int]


class WaterModelConfigInfo(BaseModel):
    primary_eto_method: EtoMethod
    fallback_eto_method: EtoMethod
    fallback_trigger: str
    reference_feed: str
    soil_parameter_basis: str
    root_depth_basis: str
    kc_config_source: str
    kc_by_stage: dict[str, Annotated[float, Field(gt=0.0)]]


class NarratorPolicyInfo(BaseModel):
    caution_triggers: list[CautionReason]


class SystemInfoResponse(BaseModel):
    crop_type: CropType
    disease_model: DiseaseModelInfo
    growth_stage_config: GrowthStageConfigInfo
    water_model_config: WaterModelConfigInfo
    narrator_policy: NarratorPolicyInfo


class FarmCreateRequest(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=200)]

    model_config = ConfigDict(extra="forbid")


class FarmResponse(BaseModel):
    farm_id: str
    name: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(extra="forbid")


class PlotCreateRequest(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=200)]
    location: Location
    soil_texture: SoilTexture

    model_config = ConfigDict(extra="forbid")


class PlotResponse(BaseModel):
    plot_id: str
    farm_id: str
    name: str
    location: Location
    soil_texture: SoilTexture
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(extra="forbid")


class CreateCropCycleRequest(BaseModel):
    crop_type: CropType
    planting_date: date

    model_config = ConfigDict(extra="forbid")


class CreateSessionRequest(BaseModel):
    crop_type: CropType
    planting_date: date
    location: Location
    soil_texture: SoilTexture

    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "crop_type": "tomato",
                "planting_date": "2026-07-01",
                "location": {
                    "name": "Hyderabad Farm",
                    "latitude": 17.3850,
                    "longitude": 78.4867
                },
                "soil_texture": "sandy_loam"
            }
        },
    )


class SessionResponse(BaseModel):
    state_id: str
    crop_type: CropType
    planting_date: date
    location: Location
    soil_texture: SoilTexture
    created_at: datetime


class PredictDiseaseRequest(BaseModel):
    state_id: str
    image_base64: str
    model_version: str

    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "state_id": "state-123",
                "image_base64": "iVBORw0KGgoAAAANSUhEUgAAAAUA",
                "model_version": "tomato_disease_v1.2"
            }
        },
    )


class DiseasePredictionResponse(BaseModel):
    state_id: str
    crop_type: CropType
    predicted_label: str
    disease_category: DiseaseCategory
    class_probs: dict[str, Annotated[float, Field(ge=0.0, le=1.0)]]
    confidence_calibrated: Annotated[float, Field(ge=0.0, le=1.0)]
    uncertainty_score: float
    uncertainty_band: UncertaintyBand
    predicted_at: datetime


class ResolveGrowthStageRequest(BaseModel):
    state_id: str
    current_date: date

    model_config = ConfigDict(extra="forbid")


class GrowthStageResponse(BaseModel):
    state_id: str
    crop_type: CropType
    planting_date: date
    current_date: date
    days_since_planting: int
    growth_stage: GrowthStage
    stage_progress: Annotated[float, Field(ge=0.0, le=1.0)]
    stage_config_source: str


class WeatherInput(BaseModel):
    tmin_c: float
    tmax_c: float
    humidity_pct: Annotated[float, Field(ge=0.0, le=100.0)]
    wind_speed_mps: Annotated[float, Field(ge=0.0)]
    shortwave_radiation_sum_mj_m2: Annotated[float | None, Field(ge=0.0)] = None
    rainfall_mm: Annotated[float, Field(ge=0.0)]
    eto_reference_feed: float | None = None

    model_config = ConfigDict(extra="forbid")


class WeatherSnapshotResponse(BaseModel):
    state_id: str
    target_date: date
    source: Literal["open_meteo"]
    source_timezone: str
    latitude: float
    longitude: float
    tmin_c: float
    tmax_c: float
    humidity_pct: Annotated[float, Field(ge=0.0, le=100.0)]
    wind_speed_mps: Annotated[float, Field(ge=0.0)]
    wind_source_height_m: Annotated[float, Field(gt=0.0)]
    wind_normalized_height_m: Annotated[float, Field(gt=0.0)]
    rainfall_mm: Annotated[float, Field(ge=0.0)]
    shortwave_radiation_sum_mj_m2: Annotated[float, Field(ge=0.0)]
    eto_reference_feed: Annotated[float, Field(ge=0.0)]
    fetched_at: datetime

    model_config = ConfigDict(extra="forbid", strict=True)


class LastIrrigationEvent(BaseModel):
    irrigation_event_id: str | None = None
    timestamp: datetime
    amount_mm: Annotated[float, Field(ge=0.0)]
    source: IrrigationEventSource = IrrigationEventSource.LEGACY_REQUEST

    model_config = ConfigDict(extra="forbid")

    @field_validator("timestamp")
    @classmethod
    def _timestamp_must_be_aware(cls, value: datetime) -> datetime:
        return _ensure_utc_aware(value, "last_irrigation_event.timestamp")

    @field_validator("amount_mm")
    @classmethod
    def _amount_must_be_finite(cls, value: float) -> float:
        result = _finite_non_negative_float(value, "last_irrigation_event.amount_mm")
        if result is None:
            raise ValueError("last_irrigation_event.amount_mm is required.")
        return result


class ComputeWaterStateRequest(BaseModel):
    state_id: str
    water_update_id: str | None = None
    current_date: date
    weather: WeatherInput
    last_irrigation_event: LastIrrigationEvent | None = None
    observed_at: datetime | None = None

    model_config = ConfigDict(extra="forbid")

    @field_validator("water_update_id", mode="before")
    @classmethod
    def _water_update_id_must_be_bounded(
        cls,
        value: object,
    ) -> object:
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        stripped = value.strip()
        if not stripped:
            raise ValueError("water_update_id must be non-empty when supplied.")
        if len(stripped) > 160:
            raise ValueError("water_update_id must be at most 160 characters.")
        return stripped

    @field_validator("observed_at")
    @classmethod
    def _observed_at_must_be_aware(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        return _ensure_utc_aware(value, "observed_at")

    @model_validator(mode="after")
    def _observed_at_matches_current_date(self) -> ComputeWaterStateRequest:
        if self.observed_at is None:
            return self
        if self.observed_at.date() != self.current_date:
            raise ValueError(
                "observed_at.date() must match current_date after UTC normalization."
            )
        return self


class WaterStateResponse(BaseModel):
    state_id: str
    water_update_id: str | None = None
    reported_irrigation_event_id: str | None = None
    applied_irrigation_event_id: str | None = None
    effective_irrigation_mm: Annotated[float, Field(ge=0.0)] = 0.0
    irrigation_event_already_accounted_for: bool = False
    crop_type: CropType
    growth_stage: GrowthStage
    soil_texture: SoilTexture
    eto_computed: float
    eto_method: EtoMethod
    eto_reference_feed: float | None
    eto_delta_pct: float | None
    kc: float
    etc: float
    field_capacity_assumed: float
    wilting_point_assumed: float
    root_depth_assumed: float
    taw: float
    p_allowable: Annotated[float, Field(ge=0.0, le=1.0)]
    raw_threshold: float
    raw_root_zone_depletion_mm: float
    root_zone_depletion_mm: float
    root_zone_depletion: float
    water_surplus_mm: float
    depletion_beyond_taw_mm: float
    estimated_moisture_state: MoistureState
    stress_band: StressBand
    observed_at: datetime
    computed_at: datetime
    observation_time_basis: ObservationTimeBasis

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "state_id": "state-123",
                "crop_type": "tomato",
                "growth_stage": "development",
                "soil_texture": "sandy_loam",
                "eto_computed": 4.8,
                "eto_method": "penman_monteith",
                "eto_reference_feed": 5.0,
                "eto_delta_pct": -4.0,
                "kc": 0.80,
                "etc": 3.84,
                "field_capacity_assumed": 0.22,
                "wilting_point_assumed": 0.10,
                "root_depth_assumed": 0.40,
                "taw": 48.0,
                "p_allowable": 0.5,
                "raw_threshold": 24.0,
                "raw_root_zone_depletion_mm": 18.0,
                "root_zone_depletion_mm": 18.0,
                "root_zone_depletion": 18.0,
                "water_surplus_mm": 0.0,
                "depletion_beyond_taw_mm": 0.0,
                "estimated_moisture_state": "moderate_deficit",
                "stress_band": "medium",
                "observed_at": "2026-07-05T00:00:00Z",
                "observation_time_basis": "DATE_ONLY_UTC_START",
                "computed_at": "2026-07-05T10:00:00Z"
            }
        }
    )


class TwinCurrentState(BaseModel):
    crop_type: CropType
    growth_stage: GrowthStage
    days_since_planting: int
    predicted_label: str
    disease_category: DiseaseCategory
    confidence_calibrated: Annotated[float, Field(ge=0.0, le=1.0)]
    uncertainty_score: float
    uncertainty_band: UncertaintyBand
    eto_computed: float
    eto_method: EtoMethod
    kc: float
    etc: float
    taw: float
    raw_threshold: float
    raw_root_zone_depletion_mm: float
    root_zone_depletion_mm: float
    root_zone_depletion: float
    water_surplus_mm: float
    depletion_beyond_taw_mm: float
    estimated_moisture_state: MoistureState
    stress_band: StressBand
    observed_at: datetime
    computed_at: datetime
    observation_time_basis: ObservationTimeBasis
    last_update_time: datetime


class UpdateTwinStateResponse(BaseModel):
    state_id: str
    current_state: TwinCurrentState
    state_history_count: int


class SessionStateResponse(BaseModel):
    state_id: str
    crop_type: CropType
    planting_date: date
    location: Location
    soil_texture: SoilTexture
    current_state: TwinCurrentState


class SessionHistoryResponse(BaseModel):
    state_id: str
    history: list[HistoryEvent]


class SimulateActionsRequest(BaseModel):
    state_id: str
    actions: Annotated[list[ActionEnum], Field(min_length=1)]

    model_config = ConfigDict(extra="forbid")


class SimulatedActionResult(BaseModel):
    action: ActionEnum
    projected_root_zone_depletion: float
    projected_raw_crossing: bool
    projected_stress_band: StressBand
    projected_water_use: float
    disease_wetness_risk_note: str


class SimulateActionsResponse(BaseModel):
    state_id: str
    simulations: list[SimulatedActionResult]
    simulated_at: datetime


class RecommendationResponse(BaseModel):
    recommendation_id: str | None = None
    state_id: str
    chosen_action: ActionEnum
    irrigation_constraint: IrrigationConstraint
    inspection_advisory: bool
    decision_reason_codes: list[str]
    caution_reasons: list[CautionReason]
    evidence_summary_structured: dict[str, object]
    recommended_at: datetime

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "state_id": "state-123",
                "chosen_action": "IRRIGATE_TOMORROW_AM",
                "irrigation_constraint": "AVOID_OVERHEAD_IRRIGATION",
                "inspection_advisory": False,
                "decision_reason_codes": [
                    "DEPLETION_EXCEEDS_RAW",
                    "FUNGAL_WETNESS_RISK",
                    "LOW_UNCERTAINTY_CONFIRMS_CONSTRAINT"
                ],
                "caution_reasons": ["FUNGAL_DISEASE_RISK"],
                "evidence_summary_structured": {
                    "predicted_label": "late_blight",
                    "disease_category": "fungal",
                    "confidence_calibrated": 0.91,
                    "uncertainty_score": 0.06,
                    "uncertainty_band": "low",
                    "root_zone_depletion": 31.0,
                    "raw_threshold": 27.0
                },
                "recommended_at": "2026-07-05T10:00:00Z"
            }
        }
    )


class ActualActionCreateRequest(BaseModel):
    action: ActionEnum
    performed_at: datetime
    amount_mm: Annotated[float | None, Field(ge=0.0)] = None
    related_recommendation_id: str | None = None
    notes: Annotated[str | None, Field(max_length=1000)] = None

    model_config = ConfigDict(extra="forbid")

    @field_validator("performed_at")
    @classmethod
    def _performed_at_must_be_aware(cls, value: datetime) -> datetime:
        return _ensure_utc_aware(value, "performed_at")

    @field_validator("amount_mm")
    @classmethod
    def _amount_must_be_finite(cls, value: float | None) -> float | None:
        return _finite_non_negative_float(value, "amount_mm")


class ActualActionResponse(BaseModel):
    actual_action_id: str
    state_id: str
    related_recommendation_id: str | None
    action: ActionEnum
    performed_at: datetime
    amount_mm: float | None
    notes: str | None
    recorded_at: datetime

    model_config = ConfigDict(extra="forbid")


class NarrationResponse(BaseModel):
    state_id: str
    headline: str
    rationale: str
    caution: str | None = None


class ErrorDetail(BaseModel):
    status_code: int | None = None
    code: str
    message: str
    details: dict[str, object] = Field(default_factory=dict)


class ErrorResponse(BaseModel):
    error: ErrorDetail
