"""daily advancement ledger

Revision ID: 202607290006
Revises: 202607230005
Create Date: 2026-07-29
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "202607290006"
down_revision = "202607230005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "daily_advancements",
        sa.Column("daily_advancement_record_id", sa.String(length=120), nullable=False),
        sa.Column("state_id", sa.String(length=120), nullable=False),
        sa.Column("advancement_id", sa.String(length=120), nullable=False),
        sa.Column("request_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("target_date", sa.Date(), nullable=False),
        sa.Column("base_water_observation_id", sa.String(length=120), nullable=False),
        sa.Column("base_water_sequence", sa.Integer(), nullable=False),
        sa.Column("disease_observation_id", sa.String(length=120), nullable=False),
        sa.Column("growth_observation_id", sa.String(length=120), nullable=False),
        sa.Column("water_observation_id", sa.String(length=120), nullable=False),
        sa.Column("snapshot_id", sa.String(length=120), nullable=False),
        sa.Column("water_sequence", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "base_water_sequence >= 1",
            name="ck_daily_advancements_base_water_sequence_gte_1",
        ),
        sa.CheckConstraint(
            "water_sequence >= 2",
            name="ck_daily_advancements_water_sequence_gte_2",
        ),
        sa.CheckConstraint(
            "water_sequence = base_water_sequence + 1",
            name="ck_daily_advancements_water_sequence_next",
        ),
        sa.ForeignKeyConstraint(
            ["base_water_observation_id"],
            ["water_observations.observation_id"],
        ),
        sa.ForeignKeyConstraint(
            ["disease_observation_id"],
            ["disease_observations.observation_id"],
        ),
        sa.ForeignKeyConstraint(
            ["growth_observation_id"],
            ["growth_observations.observation_id"],
        ),
        sa.ForeignKeyConstraint(["snapshot_id"], ["twin_state_snapshots.snapshot_id"]),
        sa.ForeignKeyConstraint(["state_id"], ["crop_cycles.state_id"]),
        sa.ForeignKeyConstraint(
            ["water_observation_id"],
            ["water_observations.observation_id"],
        ),
        sa.PrimaryKeyConstraint("daily_advancement_record_id"),
        sa.UniqueConstraint(
            "state_id",
            "advancement_id",
            name="uq_daily_advancements_state_advancement",
        ),
        sa.UniqueConstraint(
            "state_id",
            "target_date",
            name="uq_daily_advancements_state_target_date",
        ),
        sa.UniqueConstraint(
            "water_observation_id",
            name="uq_daily_advancements_water_observation_id",
        ),
    )
    op.create_index(
        "ix_daily_advancements_state_target_date",
        "daily_advancements",
        ["state_id", "target_date"],
        unique=False,
    )
    op.create_index(
        "ix_daily_advancements_state_advancement",
        "daily_advancements",
        ["state_id", "advancement_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_daily_advancements_state_advancement",
        table_name="daily_advancements",
    )
    op.drop_index(
        "ix_daily_advancements_state_target_date",
        table_name="daily_advancements",
    )
    op.drop_table("daily_advancements")
