from __future__ import annotations

import threading
from dataclasses import dataclass, field
from datetime import date, datetime

from app.schemas import (
    ActualActionResponse,
    AdvanceOneDayResponse,
    DiseasePredictionResponse,
    FarmResponse,
    GrowthStageResponse,
    LastIrrigationEvent,
    ObservationTimeBasis,
    PlotResponse,
    RecommendationResponse,
    SimulateActionsResponse,
    TwinCurrentState,
    WaterStateResponse,
)
from app.store.types import SnapshotSourceIdentity, TwinSessionRecord


@dataclass
class InMemoryStoreState:
    sessions: dict[str, TwinSessionRecord] = field(default_factory=dict)
    farms: dict[str, FarmResponse] = field(default_factory=dict)
    plots: dict[str, PlotResponse] = field(default_factory=dict)
    actual_actions: dict[str, list[ActualActionResponse]] = field(default_factory=dict)
    irrigation_events: dict[str, tuple[str, LastIrrigationEvent]] = field(default_factory=dict)
    water_by_irrigation_event_id: dict[str, WaterStateResponse] = field(default_factory=dict)
    water_by_update_id: dict[tuple[str, str], tuple[str, WaterStateResponse]] = field(default_factory=dict)
    water_by_observation_id: dict[str, tuple[str, WaterStateResponse]] = field(default_factory=dict)
    water_growth_observation_id: dict[str, str] = field(default_factory=dict)
    latest_water_observation_id: dict[str, str | None] = field(default_factory=dict)
    water_sequence: dict[str, int] = field(default_factory=dict)
    latest_disease_observation_id: dict[str, str] = field(default_factory=dict)
    latest_growth_observation_id: dict[str, str] = field(default_factory=dict)
    disease_by_observation_id: dict[str, tuple[str, DiseasePredictionResponse]] = field(default_factory=dict)
    growth_by_observation_id: dict[str, tuple[str, GrowthStageResponse]] = field(default_factory=dict)
    snapshot_by_fingerprint: dict[tuple[str, str], tuple[str, TwinCurrentState, str]] = field(default_factory=dict)
    snapshot_sources: dict[str, SnapshotSourceIdentity] = field(default_factory=dict)
    daily_advancements: dict[tuple[str, str], tuple[str, date, str, AdvanceOneDayResponse]] = field(default_factory=dict)
    daily_advancement_by_target_date: dict[tuple[str, date], str] = field(default_factory=dict)
    recommendations_by_id: dict[str, tuple[str, RecommendationResponse]] = field(default_factory=dict)
    disease_history: dict[str, list[DiseasePredictionResponse]] = field(default_factory=dict)
    growth_history: dict[str, list[GrowthStageResponse]] = field(default_factory=dict)
    growth_observation_metadata: dict[str, list[tuple[datetime, ObservationTimeBasis, datetime]]] = field(default_factory=dict)
    water_history: dict[str, list[WaterStateResponse]] = field(default_factory=dict)
    water_observation_metadata: dict[str, list[dict[str, object]]] = field(default_factory=dict)
    max_history: int = 10
    lock: threading.RLock = field(default_factory=threading.RLock)


__all__ = ["InMemoryStoreState"]
