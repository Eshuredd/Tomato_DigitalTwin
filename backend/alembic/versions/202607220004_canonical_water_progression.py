"""canonical water progression

Revision ID: 202607220004
Revises: 202607200003
Create Date: 2026-07-22
"""

from __future__ import annotations

from collections import defaultdict

from alembic import op
import sqlalchemy as sa


revision = "202607220004"
down_revision = "202607200003"
branch_labels = None
depends_on = None


LATEST_WATER_INDEX = "ix_crop_cycles_latest_water_observation_id"
STATE_SEQUENCE_UNIQUE = "uq_water_observations_state_water_sequence"
WATER_SEQUENCE_CHECK = "ck_water_observations_water_sequence_positive"
BASE_SEQUENCE_CHECK = "ck_water_observations_base_water_sequence_non_negative"
CROP_SEQUENCE_CHECK = "ck_crop_cycles_water_sequence_non_negative"
BASE_WATER_FK = "fk_water_observations_base_water_observation_id"
STATE_OBSERVED_INDEX = "ix_water_observations_state_observed_at"


def upgrade() -> None:
    with op.batch_alter_table("crop_cycles") as batch_op:
        batch_op.add_column(
            sa.Column("water_sequence", sa.Integer(), nullable=False, server_default="0")
        )
        batch_op.add_column(
            sa.Column("latest_water_observation_id", sa.String(length=120), nullable=True)
        )
        batch_op.create_check_constraint(CROP_SEQUENCE_CHECK, "water_sequence >= 0")

    with op.batch_alter_table("water_observations") as batch_op:
        batch_op.add_column(sa.Column("water_sequence", sa.Integer(), nullable=True))
        batch_op.add_column(
            sa.Column("base_water_observation_id", sa.String(length=120), nullable=True)
        )
        batch_op.add_column(sa.Column("base_water_sequence", sa.Integer(), nullable=True))

    _backfill_sequences()

    with op.batch_alter_table("water_observations") as batch_op:
        batch_op.alter_column(
            "water_sequence",
            existing_type=sa.Integer(),
            nullable=False,
        )
        batch_op.alter_column(
            "base_water_sequence",
            existing_type=sa.Integer(),
            nullable=False,
        )
        batch_op.create_unique_constraint(
            STATE_SEQUENCE_UNIQUE,
            ["state_id", "water_sequence"],
        )
        batch_op.create_check_constraint(WATER_SEQUENCE_CHECK, "water_sequence > 0")
        batch_op.create_check_constraint(BASE_SEQUENCE_CHECK, "base_water_sequence >= 0")
        batch_op.create_foreign_key(
            BASE_WATER_FK,
            "water_observations",
            ["base_water_observation_id"],
            ["observation_id"],
        )

    op.create_index(
        LATEST_WATER_INDEX,
        "crop_cycles",
        ["latest_water_observation_id"],
        unique=False,
    )
    op.create_index(
        STATE_OBSERVED_INDEX,
        "water_observations",
        ["state_id", "observed_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(STATE_OBSERVED_INDEX, table_name="water_observations")
    op.drop_index(LATEST_WATER_INDEX, table_name="crop_cycles")

    with op.batch_alter_table("water_observations") as batch_op:
        batch_op.drop_constraint(BASE_WATER_FK, type_="foreignkey")
        batch_op.drop_constraint(BASE_SEQUENCE_CHECK, type_="check")
        batch_op.drop_constraint(WATER_SEQUENCE_CHECK, type_="check")
        batch_op.drop_constraint(STATE_SEQUENCE_UNIQUE, type_="unique")
        batch_op.drop_column("base_water_sequence")
        batch_op.drop_column("base_water_observation_id")
        batch_op.drop_column("water_sequence")

    with op.batch_alter_table("crop_cycles") as batch_op:
        batch_op.drop_constraint(CROP_SEQUENCE_CHECK, type_="check")
        batch_op.drop_column("latest_water_observation_id")
        batch_op.drop_column("water_sequence")


def _backfill_sequences() -> None:
    connection = op.get_bind()
    rows = connection.execute(
        sa.text(
            """
            SELECT observation_id, state_id, observed_at, computed_at
            FROM water_observations
            ORDER BY state_id, observed_at, computed_at, observation_id
            """
        )
    ).mappings().all()

    by_state: dict[str, list[object]] = defaultdict(list)
    for row in rows:
        by_state[row["state_id"]].append(row)

    for state_id, state_rows in by_state.items():
        previous_id: str | None = None
        previous_sequence = 0
        for sequence, row in enumerate(state_rows, start=1):
            connection.execute(
                sa.text(
                    """
                    UPDATE water_observations
                    SET water_sequence = :water_sequence,
                        base_water_observation_id = :base_water_observation_id,
                        base_water_sequence = :base_water_sequence
                    WHERE observation_id = :observation_id
                    """
                ),
                {
                    "water_sequence": sequence,
                    "base_water_observation_id": previous_id,
                    "base_water_sequence": previous_sequence,
                    "observation_id": row["observation_id"],
                },
            )
            previous_id = row["observation_id"]
            previous_sequence = sequence

        connection.execute(
            sa.text(
                """
                UPDATE crop_cycles
                SET water_sequence = :water_sequence,
                    latest_water_observation_id = :latest_water_observation_id
                WHERE state_id = :state_id
                """
            ),
            {
                "state_id": state_id,
                "water_sequence": previous_sequence,
                "latest_water_observation_id": previous_id,
            },
        )
