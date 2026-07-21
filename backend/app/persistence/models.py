from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class FarmModel(Base):
    __tablename__ = "farms"

    farm_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class PlotModel(Base):
    __tablename__ = "plots"
    __table_args__ = (Index("ix_plots_farm_id", "farm_id"),)

    plot_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    farm_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("farms.farm_id"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    location_name: Mapped[str] = mapped_column(String(200), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    elevation_m: Mapped[float] = mapped_column(Float, nullable=False)
    soil_texture: Mapped[str] = mapped_column(String(40), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class CropCycleModel(Base):
    __tablename__ = "crop_cycles"
    __table_args__ = (Index("ix_crop_cycles_plot_id", "plot_id"),)

    state_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    plot_id: Mapped[str | None] = mapped_column(
        String(120),
        ForeignKey("plots.plot_id"),
        nullable=True,
    )
    crop_type: Mapped[str] = mapped_column(String(40), nullable=False)
    planting_date: Mapped[date] = mapped_column(Date, nullable=False)
    standalone_location_name: Mapped[str] = mapped_column(String(200), nullable=False)
    standalone_latitude: Mapped[float] = mapped_column(Float, nullable=False)
    standalone_longitude: Mapped[float] = mapped_column(Float, nullable=False)
    standalone_elevation_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    standalone_soil_texture: Mapped[str] = mapped_column(String(40), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="active")
    latest_observed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    latest_computed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )


class DiseaseObservationModel(Base):
    __tablename__ = "disease_observations"
    __table_args__ = (
        Index(
            "ix_disease_observations_state_computed_at",
            "state_id",
            "computed_at",
        ),
    )

    observation_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    state_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("crop_cycles.state_id"),
        nullable=False,
    )
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    observation_time_basis: Mapped[str] = mapped_column(String(40), nullable=False)
    predicted_label: Mapped[str] = mapped_column(String(200), nullable=False)
    disease_category: Mapped[str] = mapped_column(String(40), nullable=False)
    confidence_calibrated: Mapped[float] = mapped_column(Float, nullable=False)
    uncertainty_score: Mapped[float] = mapped_column(Float, nullable=False)
    uncertainty_band: Mapped[str] = mapped_column(String(40), nullable=False)
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)


class GrowthObservationModel(Base):
    __tablename__ = "growth_observations"
    __table_args__ = (
        Index(
            "ix_growth_observations_state_computed_at",
            "state_id",
            "computed_at",
        ),
    )

    observation_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    state_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("crop_cycles.state_id"),
        nullable=False,
    )
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    observation_time_basis: Mapped[str] = mapped_column(String(40), nullable=False)
    current_date: Mapped[date] = mapped_column(Date, nullable=False)
    days_since_planting: Mapped[int] = mapped_column(nullable=False)
    growth_stage: Mapped[str] = mapped_column(String(40), nullable=False)
    stage_progress: Mapped[float] = mapped_column(Float, nullable=False)
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)


class IrrigationEventModel(Base):
    __tablename__ = "irrigation_events"
    __table_args__ = (
        Index(
            "ix_irrigation_events_state_occurred_at",
            "state_id",
            "occurred_at",
        ),
    )

    irrigation_event_id: Mapped[str] = mapped_column(String(160), primary_key=True)
    state_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("crop_cycles.state_id"),
        nullable=False,
    )
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    amount_mm: Mapped[float] = mapped_column(Float, nullable=False)
    source: Mapped[str] = mapped_column(String(60), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)


class WaterObservationModel(Base):
    __tablename__ = "water_observations"
    __table_args__ = (
        UniqueConstraint(
            "state_id",
            "water_update_id",
            name="uq_water_observations_state_water_update_id",
        ),
        CheckConstraint(
            "effective_irrigation_mm >= 0",
            name="ck_water_observations_effective_irrigation_mm_non_negative",
        ),
        Index(
            "ix_water_observations_state_computed_at",
            "state_id",
            "computed_at",
        ),
        Index(
            "ux_water_observations_irrigation_event_id",
            "irrigation_event_id",
            unique=True,
        ),
        Index(
            "ix_water_observations_state_reported_irrigation_observed",
            "state_id",
            "reported_irrigation_event_id",
            "observed_at",
        ),
    )

    observation_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    state_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("crop_cycles.state_id"),
        nullable=False,
    )
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    observation_time_basis: Mapped[str] = mapped_column(String(40), nullable=False)
    water_update_id: Mapped[str] = mapped_column(String(160), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    weather_payload_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    previous_root_zone_depletion_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    raw_root_zone_depletion_mm: Mapped[float] = mapped_column(Float, nullable=False)
    root_zone_depletion_mm: Mapped[float] = mapped_column(Float, nullable=False)
    water_surplus_mm: Mapped[float] = mapped_column(Float, nullable=False)
    depletion_beyond_taw_mm: Mapped[float] = mapped_column(Float, nullable=False)
    irrigation_event_id: Mapped[str | None] = mapped_column(
        String(160),
        ForeignKey("irrigation_events.irrigation_event_id"),
        nullable=True,
    )
    reported_irrigation_event_id: Mapped[str | None] = mapped_column(
        String(160),
        ForeignKey("irrigation_events.irrigation_event_id"),
        nullable=True,
    )
    effective_irrigation_mm: Mapped[float] = mapped_column(Float, nullable=False)
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)


class TwinStateSnapshotModel(Base):
    __tablename__ = "twin_state_snapshots"
    __table_args__ = (
        Index(
            "ix_twin_state_snapshots_state_computed_at",
            "state_id",
            "computed_at",
        ),
    )

    snapshot_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    state_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("crop_cycles.state_id"),
        nullable=False,
    )
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    observation_time_basis: Mapped[str] = mapped_column(String(40), nullable=False)
    disease_observation_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("disease_observations.observation_id"),
        nullable=False,
    )
    growth_observation_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("growth_observations.observation_id"),
        nullable=False,
    )
    water_observation_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("water_observations.observation_id"),
        nullable=False,
    )
    crop_type: Mapped[str] = mapped_column(String(40), nullable=False)
    growth_stage: Mapped[str] = mapped_column(String(40), nullable=False)
    days_since_planting: Mapped[int] = mapped_column(nullable=False)
    predicted_label: Mapped[str] = mapped_column(String(200), nullable=False)
    disease_category: Mapped[str] = mapped_column(String(40), nullable=False)
    confidence_calibrated: Mapped[float] = mapped_column(Float, nullable=False)
    uncertainty_score: Mapped[float] = mapped_column(Float, nullable=False)
    uncertainty_band: Mapped[str] = mapped_column(String(40), nullable=False)
    eto_computed: Mapped[float] = mapped_column(Float, nullable=False)
    eto_method: Mapped[str] = mapped_column(String(60), nullable=False)
    kc: Mapped[float] = mapped_column(Float, nullable=False)
    etc: Mapped[float] = mapped_column(Float, nullable=False)
    taw: Mapped[float] = mapped_column(Float, nullable=False)
    raw_threshold: Mapped[float] = mapped_column(Float, nullable=False)
    raw_root_zone_depletion_mm: Mapped[float] = mapped_column(Float, nullable=False)
    root_zone_depletion_mm: Mapped[float] = mapped_column(Float, nullable=False)
    water_surplus_mm: Mapped[float] = mapped_column(Float, nullable=False)
    depletion_beyond_taw_mm: Mapped[float] = mapped_column(Float, nullable=False)
    estimated_moisture_state: Mapped[str] = mapped_column(String(60), nullable=False)
    stress_band: Mapped[str] = mapped_column(String(40), nullable=False)
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)


class SimulationRunModel(Base):
    __tablename__ = "simulation_runs"
    __table_args__ = (
        Index(
            "ix_simulation_runs_state_snapshot_computed_at",
            "state_id",
            "source_snapshot_id",
            "computed_at",
        ),
    )

    simulation_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    state_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("crop_cycles.state_id"),
        nullable=False,
    )
    source_snapshot_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("twin_state_snapshots.snapshot_id"),
        nullable=False,
    )
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)


class RecommendationRunModel(Base):
    __tablename__ = "recommendation_runs"
    __table_args__ = (
        Index(
            "ix_recommendation_runs_state_snapshot_simulation_computed_at",
            "state_id",
            "source_snapshot_id",
            "source_simulation_id",
            "computed_at",
        ),
    )

    recommendation_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    state_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("crop_cycles.state_id"),
        nullable=False,
    )
    source_snapshot_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("twin_state_snapshots.snapshot_id"),
        nullable=False,
    )
    source_simulation_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("simulation_runs.simulation_id"),
        nullable=False,
    )
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)


class ActualActionModel(Base):
    __tablename__ = "actual_actions"
    __table_args__ = (
        Index(
            "ix_actual_actions_state_performed_at",
            "state_id",
            "performed_at",
        ),
    )

    actual_action_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    state_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("crop_cycles.state_id"),
        nullable=False,
    )
    related_recommendation_id: Mapped[str | None] = mapped_column(
        String(120),
        ForeignKey("recommendation_runs.recommendation_id"),
        nullable=True,
    )
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    performed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    amount_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
