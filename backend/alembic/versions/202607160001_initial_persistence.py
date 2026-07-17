"""initial persistence schema

Revision ID: 202607160001
Revises:
Create Date: 2026-07-16
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "202607160001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "farms",
        sa.Column("farm_id", sa.String(length=120), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "plots",
        sa.Column("plot_id", sa.String(length=120), primary_key=True),
        sa.Column(
            "farm_id",
            sa.String(length=120),
            sa.ForeignKey("farms.farm_id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("location_name", sa.String(length=200), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("elevation_m", sa.Float(), nullable=False),
        sa.Column("soil_texture", sa.String(length=40), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_plots_farm_id", "plots", ["farm_id"])

    op.create_table(
        "crop_cycles",
        sa.Column("state_id", sa.String(length=120), primary_key=True),
        sa.Column(
            "plot_id",
            sa.String(length=120),
            sa.ForeignKey("plots.plot_id"),
            nullable=True,
        ),
        sa.Column("crop_type", sa.String(length=40), nullable=False),
        sa.Column("planting_date", sa.Date(), nullable=False),
        sa.Column("standalone_location_name", sa.String(length=200), nullable=False),
        sa.Column("standalone_latitude", sa.Float(), nullable=False),
        sa.Column("standalone_longitude", sa.Float(), nullable=False),
        sa.Column("standalone_elevation_m", sa.Float(), nullable=True),
        sa.Column("standalone_soil_texture", sa.String(length=40), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("latest_observed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("latest_computed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_crop_cycles_plot_id", "crop_cycles", ["plot_id"])

    op.create_table(
        "disease_observations",
        sa.Column("observation_id", sa.String(length=120), primary_key=True),
        sa.Column(
            "state_id",
            sa.String(length=120),
            sa.ForeignKey("crop_cycles.state_id"),
            nullable=False,
        ),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("observation_time_basis", sa.String(length=40), nullable=False),
        sa.Column("predicted_label", sa.String(length=200), nullable=False),
        sa.Column("disease_category", sa.String(length=40), nullable=False),
        sa.Column("confidence_calibrated", sa.Float(), nullable=False),
        sa.Column("uncertainty_score", sa.Float(), nullable=False),
        sa.Column("uncertainty_band", sa.String(length=40), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
    )
    op.create_index(
        "ix_disease_observations_state_id",
        "disease_observations",
        ["state_id"],
    )
    op.create_index(
        "ix_disease_observations_computed_at",
        "disease_observations",
        ["computed_at"],
    )

    op.create_table(
        "growth_observations",
        sa.Column("observation_id", sa.String(length=120), primary_key=True),
        sa.Column(
            "state_id",
            sa.String(length=120),
            sa.ForeignKey("crop_cycles.state_id"),
            nullable=False,
        ),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("observation_time_basis", sa.String(length=40), nullable=False),
        sa.Column("current_date", sa.Date(), nullable=False),
        sa.Column("days_since_planting", sa.Integer(), nullable=False),
        sa.Column("growth_stage", sa.String(length=40), nullable=False),
        sa.Column("stage_progress", sa.Float(), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
    )
    op.create_index(
        "ix_growth_observations_state_id",
        "growth_observations",
        ["state_id"],
    )
    op.create_index(
        "ix_growth_observations_computed_at",
        "growth_observations",
        ["computed_at"],
    )

    op.create_table(
        "irrigation_events",
        sa.Column("irrigation_event_id", sa.String(length=160), primary_key=True),
        sa.Column(
            "state_id",
            sa.String(length=120),
            sa.ForeignKey("crop_cycles.state_id"),
            nullable=False,
        ),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("amount_mm", sa.Float(), nullable=False),
        sa.Column("source", sa.String(length=60), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "applied_to_water_observation_id",
            sa.String(length=120),
            nullable=True,
            unique=True,
        ),
        sa.Column("payload_json", sa.JSON(), nullable=False),
    )
    op.create_index(
        "ix_irrigation_events_state_id",
        "irrigation_events",
        ["state_id"],
    )
    op.create_index(
        "ix_irrigation_events_occurred_at",
        "irrigation_events",
        ["occurred_at"],
    )

    op.create_table(
        "water_observations",
        sa.Column("observation_id", sa.String(length=120), primary_key=True),
        sa.Column(
            "state_id",
            sa.String(length=120),
            sa.ForeignKey("crop_cycles.state_id"),
            nullable=False,
        ),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("observation_time_basis", sa.String(length=40), nullable=False),
        sa.Column("weather_payload_json", sa.JSON(), nullable=True),
        sa.Column("previous_root_zone_depletion_mm", sa.Float(), nullable=True),
        sa.Column("raw_root_zone_depletion_mm", sa.Float(), nullable=False),
        sa.Column("root_zone_depletion_mm", sa.Float(), nullable=False),
        sa.Column("water_surplus_mm", sa.Float(), nullable=False),
        sa.Column("depletion_beyond_taw_mm", sa.Float(), nullable=False),
        sa.Column(
            "irrigation_event_id",
            sa.String(length=160),
            sa.ForeignKey("irrigation_events.irrigation_event_id"),
            nullable=True,
        ),
        sa.Column("payload_json", sa.JSON(), nullable=False),
    )
    op.create_index(
        "ix_water_observations_state_id",
        "water_observations",
        ["state_id"],
    )
    op.create_index(
        "ix_water_observations_observed_at",
        "water_observations",
        ["observed_at"],
    )

    op.create_table(
        "twin_state_snapshots",
        sa.Column("snapshot_id", sa.String(length=120), primary_key=True),
        sa.Column(
            "state_id",
            sa.String(length=120),
            sa.ForeignKey("crop_cycles.state_id"),
            nullable=False,
        ),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("observation_time_basis", sa.String(length=40), nullable=False),
        sa.Column(
            "disease_observation_id",
            sa.String(length=120),
            sa.ForeignKey("disease_observations.observation_id"),
            nullable=False,
        ),
        sa.Column(
            "growth_observation_id",
            sa.String(length=120),
            sa.ForeignKey("growth_observations.observation_id"),
            nullable=False,
        ),
        sa.Column(
            "water_observation_id",
            sa.String(length=120),
            sa.ForeignKey("water_observations.observation_id"),
            nullable=False,
        ),
        sa.Column("crop_type", sa.String(length=40), nullable=False),
        sa.Column("growth_stage", sa.String(length=40), nullable=False),
        sa.Column("days_since_planting", sa.Integer(), nullable=False),
        sa.Column("predicted_label", sa.String(length=200), nullable=False),
        sa.Column("disease_category", sa.String(length=40), nullable=False),
        sa.Column("confidence_calibrated", sa.Float(), nullable=False),
        sa.Column("uncertainty_score", sa.Float(), nullable=False),
        sa.Column("uncertainty_band", sa.String(length=40), nullable=False),
        sa.Column("eto_computed", sa.Float(), nullable=False),
        sa.Column("eto_method", sa.String(length=60), nullable=False),
        sa.Column("kc", sa.Float(), nullable=False),
        sa.Column("etc", sa.Float(), nullable=False),
        sa.Column("taw", sa.Float(), nullable=False),
        sa.Column("raw_threshold", sa.Float(), nullable=False),
        sa.Column("raw_root_zone_depletion_mm", sa.Float(), nullable=False),
        sa.Column("root_zone_depletion_mm", sa.Float(), nullable=False),
        sa.Column("water_surplus_mm", sa.Float(), nullable=False),
        sa.Column("depletion_beyond_taw_mm", sa.Float(), nullable=False),
        sa.Column("estimated_moisture_state", sa.String(length=60), nullable=False),
        sa.Column("stress_band", sa.String(length=40), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
    )
    op.create_index(
        "ix_twin_state_snapshots_state_id",
        "twin_state_snapshots",
        ["state_id"],
    )
    op.create_index(
        "ix_twin_state_snapshots_computed_at",
        "twin_state_snapshots",
        ["computed_at"],
    )

    op.create_table(
        "simulation_runs",
        sa.Column("simulation_id", sa.String(length=120), primary_key=True),
        sa.Column(
            "state_id",
            sa.String(length=120),
            sa.ForeignKey("crop_cycles.state_id"),
            nullable=False,
        ),
        sa.Column(
            "source_snapshot_id",
            sa.String(length=120),
            sa.ForeignKey("twin_state_snapshots.snapshot_id"),
            nullable=False,
        ),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
    )
    op.create_index(
        "ix_simulation_runs_state_id",
        "simulation_runs",
        ["state_id"],
    )
    op.create_index(
        "ix_simulation_runs_computed_at",
        "simulation_runs",
        ["computed_at"],
    )

    op.create_table(
        "recommendation_runs",
        sa.Column("recommendation_id", sa.String(length=120), primary_key=True),
        sa.Column(
            "state_id",
            sa.String(length=120),
            sa.ForeignKey("crop_cycles.state_id"),
            nullable=False,
        ),
        sa.Column(
            "source_snapshot_id",
            sa.String(length=120),
            sa.ForeignKey("twin_state_snapshots.snapshot_id"),
            nullable=False,
        ),
        sa.Column(
            "source_simulation_id",
            sa.String(length=120),
            sa.ForeignKey("simulation_runs.simulation_id"),
            nullable=False,
        ),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
    )
    op.create_index(
        "ix_recommendation_runs_state_id",
        "recommendation_runs",
        ["state_id"],
    )
    op.create_index(
        "ix_recommendation_runs_computed_at",
        "recommendation_runs",
        ["computed_at"],
    )

    op.create_table(
        "actual_actions",
        sa.Column("actual_action_id", sa.String(length=120), primary_key=True),
        sa.Column(
            "state_id",
            sa.String(length=120),
            sa.ForeignKey("crop_cycles.state_id"),
            nullable=False,
        ),
        sa.Column(
            "related_recommendation_id",
            sa.String(length=120),
            sa.ForeignKey("recommendation_runs.recommendation_id"),
            nullable=True,
        ),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("performed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("amount_mm", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
    )
    op.create_index(
        "ix_actual_actions_state_id",
        "actual_actions",
        ["state_id"],
    )
    op.create_index(
        "ix_actual_actions_performed_at",
        "actual_actions",
        ["performed_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_actual_actions_performed_at", table_name="actual_actions")
    op.drop_index("ix_actual_actions_state_id", table_name="actual_actions")
    op.drop_table("actual_actions")

    op.drop_index("ix_recommendation_runs_computed_at", table_name="recommendation_runs")
    op.drop_index("ix_recommendation_runs_state_id", table_name="recommendation_runs")
    op.drop_table("recommendation_runs")

    op.drop_index("ix_simulation_runs_computed_at", table_name="simulation_runs")
    op.drop_index("ix_simulation_runs_state_id", table_name="simulation_runs")
    op.drop_table("simulation_runs")

    op.drop_index(
        "ix_twin_state_snapshots_computed_at",
        table_name="twin_state_snapshots",
    )
    op.drop_index(
        "ix_twin_state_snapshots_state_id",
        table_name="twin_state_snapshots",
    )
    op.drop_table("twin_state_snapshots")

    op.drop_index("ix_water_observations_observed_at", table_name="water_observations")
    op.drop_index("ix_water_observations_state_id", table_name="water_observations")
    op.drop_table("water_observations")

    op.drop_index("ix_irrigation_events_occurred_at", table_name="irrigation_events")
    op.drop_index("ix_irrigation_events_state_id", table_name="irrigation_events")
    op.drop_table("irrigation_events")

    op.drop_index("ix_growth_observations_computed_at", table_name="growth_observations")
    op.drop_index("ix_growth_observations_state_id", table_name="growth_observations")
    op.drop_table("growth_observations")

    op.drop_index(
        "ix_disease_observations_computed_at",
        table_name="disease_observations",
    )
    op.drop_index(
        "ix_disease_observations_state_id",
        table_name="disease_observations",
    )
    op.drop_table("disease_observations")

    op.drop_index("ix_crop_cycles_plot_id", table_name="crop_cycles")
    op.drop_table("crop_cycles")

    op.drop_index("ix_plots_farm_id", table_name="plots")
    op.drop_table("plots")

    op.drop_table("farms")
