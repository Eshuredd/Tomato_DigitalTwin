"""persistence integrity constraints

Revision ID: 202607170002
Revises: 202607160001
Create Date: 2026-07-17
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "202607170002"
down_revision = "202607160001"
branch_labels = None
depends_on = None


OLD_INDEXES: tuple[tuple[str, str], ...] = (
    ("ix_disease_observations_state_id", "disease_observations"),
    ("ix_disease_observations_computed_at", "disease_observations"),
    ("ix_growth_observations_state_id", "growth_observations"),
    ("ix_growth_observations_computed_at", "growth_observations"),
    ("ix_water_observations_state_id", "water_observations"),
    ("ix_water_observations_observed_at", "water_observations"),
    ("ix_twin_state_snapshots_state_id", "twin_state_snapshots"),
    ("ix_twin_state_snapshots_computed_at", "twin_state_snapshots"),
    ("ix_simulation_runs_state_id", "simulation_runs"),
    ("ix_simulation_runs_computed_at", "simulation_runs"),
    ("ix_recommendation_runs_state_id", "recommendation_runs"),
    ("ix_recommendation_runs_computed_at", "recommendation_runs"),
    ("ix_irrigation_events_state_id", "irrigation_events"),
    ("ix_irrigation_events_occurred_at", "irrigation_events"),
    ("ix_actual_actions_state_id", "actual_actions"),
    ("ix_actual_actions_performed_at", "actual_actions"),
)


NEW_INDEXES: tuple[tuple[str, str, tuple[str, ...], bool], ...] = (
    (
        "ix_disease_observations_state_computed_at",
        "disease_observations",
        ("state_id", "computed_at"),
        False,
    ),
    (
        "ix_growth_observations_state_computed_at",
        "growth_observations",
        ("state_id", "computed_at"),
        False,
    ),
    (
        "ix_water_observations_state_computed_at",
        "water_observations",
        ("state_id", "computed_at"),
        False,
    ),
    (
        "ux_water_observations_irrigation_event_id",
        "water_observations",
        ("irrigation_event_id",),
        True,
    ),
    (
        "ix_twin_state_snapshots_state_computed_at",
        "twin_state_snapshots",
        ("state_id", "computed_at"),
        False,
    ),
    (
        "ix_simulation_runs_state_snapshot_computed_at",
        "simulation_runs",
        ("state_id", "source_snapshot_id", "computed_at"),
        False,
    ),
    (
        "ix_recommendation_runs_state_snapshot_simulation_computed_at",
        "recommendation_runs",
        ("state_id", "source_snapshot_id", "source_simulation_id", "computed_at"),
        False,
    ),
    (
        "ix_irrigation_events_state_occurred_at",
        "irrigation_events",
        ("state_id", "occurred_at"),
        False,
    ),
    (
        "ix_actual_actions_state_performed_at",
        "actual_actions",
        ("state_id", "performed_at"),
        False,
    ),
)


def _fail_if_duplicate_irrigation_links() -> None:
    duplicate = op.get_bind().execute(
        sa.text(
            """
            SELECT irrigation_event_id, COUNT(*) AS link_count
            FROM water_observations
            WHERE irrigation_event_id IS NOT NULL
            GROUP BY irrigation_event_id
            HAVING COUNT(*) > 1
            LIMIT 1
            """
        )
    ).first()
    if duplicate is None:
        return

    raise RuntimeError(
        "Cannot add unique irrigation-event application link; "
        f"irrigation_event_id '{duplicate.irrigation_event_id}' is referenced "
        f"{duplicate.link_count} times."
    )


def upgrade() -> None:
    _fail_if_duplicate_irrigation_links()

    for index_name, table_name in OLD_INDEXES:
        op.drop_index(index_name, table_name=table_name)

    for index_name, table_name, columns, unique in NEW_INDEXES:
        op.create_index(index_name, table_name, list(columns), unique=unique)

    with op.batch_alter_table("irrigation_events") as batch_op:
        batch_op.drop_column("applied_to_water_observation_id")


def downgrade() -> None:
    with op.batch_alter_table("irrigation_events") as batch_op:
        batch_op.add_column(
            sa.Column(
                "applied_to_water_observation_id",
                sa.String(length=120),
                nullable=True,
            )
        )

    op.get_bind().execute(
        sa.text(
            """
            UPDATE irrigation_events
            SET applied_to_water_observation_id = (
                SELECT water_observations.observation_id
                FROM water_observations
                WHERE water_observations.irrigation_event_id =
                    irrigation_events.irrigation_event_id
                LIMIT 1
            )
            WHERE EXISTS (
                SELECT 1
                FROM water_observations
                WHERE water_observations.irrigation_event_id =
                    irrigation_events.irrigation_event_id
            )
            """
        )
    )

    for index_name, table_name, _columns, _unique in reversed(NEW_INDEXES):
        op.drop_index(index_name, table_name=table_name)

    for index_name, table_name in OLD_INDEXES:
        op.create_index(
            index_name,
            table_name,
            _old_index_columns(index_name),
            unique=False,
        )


def _old_index_columns(index_name: str) -> list[str]:
    if index_name.endswith("_state_id"):
        return ["state_id"]
    if index_name.endswith("_computed_at"):
        return ["computed_at"]
    if index_name.endswith("_observed_at"):
        return ["observed_at"]
    if index_name.endswith("_occurred_at"):
        return ["occurred_at"]
    if index_name.endswith("_performed_at"):
        return ["performed_at"]
    raise ValueError(f"Unknown legacy index: {index_name}")
