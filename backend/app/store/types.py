from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.schemas import (
    CropType,
    DiseasePredictionResponse,
    GrowthStageResponse,
    HistoryEvent,
    Location,
    RecommendationResponse,
    SimulateActionsResponse,
    SoilTexture,
    TwinCurrentState,
    WaterStateResponse,
)


class TwinSessionRecord(BaseModel):
    state_id: str
    plot_id: str | None = None
    crop_type: CropType
    planting_date: date
    location: Location
    soil_texture: SoilTexture
    created_at: datetime
    status: str = "active"
    latest_disease_state: DiseasePredictionResponse | None = None
    latest_growth_state: GrowthStageResponse | None = None
    latest_water_state: WaterStateResponse | None = None
    current_state: TwinCurrentState | None = None
    state_history: list[HistoryEvent] = Field(default_factory=list)
    latest_simulation: SimulateActionsResponse | None = None
    latest_recommendation: RecommendationResponse | None = None


@dataclass(frozen=True)
class WaterBaseline:
    water_observation_id: str
    water_sequence: int
    current_date: date
    observed_at: datetime
    root_zone_depletion_mm: float
    water_update_id: str


@dataclass(frozen=True)
class SnapshotSourceIdentity:
    state_id: str
    disease_observation_id: str
    growth_observation_id: str
    water_observation_id: str


__all__ = [
    "TwinSessionRecord",
    "WaterBaseline",
    "SnapshotSourceIdentity",
]
