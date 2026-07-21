"""water update identity

Revision ID: 202607200003
Revises: 202607170002
Create Date: 2026-07-20
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from alembic import op
import sqlalchemy as sa


revision = "202607200003"
down_revision = "202607170002"
branch_labels = None
depends_on = None


PROVENANCE_INDEX = "ix_water_observations_state_reported_irrigation_observed"
UPDATE_UNIQUE_CONSTRAINT = "uq_water_observations_state_water_update_id"
REPORTED_EVENT_FK = "fk_water_observations_reported_irrigation_event_id"
EFFECTIVE_IRRIGATION_CHECK = (
    "ck_water_observations_effective_irrigation_mm_non_negative"
)


def upgrade() -> None:
    with op.batch_alter_table("water_observations") as batch_op:
        batch_op.add_column(
            sa.Column("water_update_id", sa.String(length=160), nullable=True)
        )
        batch_op.add_column(
            sa.Column("request_fingerprint", sa.String(length=64), nullable=True)
        )
        batch_op.add_column(
            sa.Column(
                "reported_irrigation_event_id",
                sa.String(length=160),
                nullable=True,
            )
        )
        batch_op.add_column(
            sa.Column("effective_irrigation_mm", sa.Float(), nullable=True)
        )

    _backfill_existing_water_observations()

    with op.batch_alter_table("water_observations") as batch_op:
        batch_op.alter_column(
            "water_update_id",
            existing_type=sa.String(length=160),
            nullable=False,
        )
        batch_op.alter_column(
            "request_fingerprint",
            existing_type=sa.String(length=64),
            nullable=False,
        )
        batch_op.alter_column(
            "effective_irrigation_mm",
            existing_type=sa.Float(),
            nullable=False,
        )
        batch_op.create_foreign_key(
            REPORTED_EVENT_FK,
            "irrigation_events",
            ["reported_irrigation_event_id"],
            ["irrigation_event_id"],
        )
        batch_op.create_unique_constraint(
            UPDATE_UNIQUE_CONSTRAINT,
            ["state_id", "water_update_id"],
        )
        batch_op.create_check_constraint(
            EFFECTIVE_IRRIGATION_CHECK,
            "effective_irrigation_mm >= 0",
        )

    op.create_index(
        PROVENANCE_INDEX,
        "water_observations",
        ["state_id", "reported_irrigation_event_id", "observed_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(PROVENANCE_INDEX, table_name="water_observations")

    with op.batch_alter_table("water_observations") as batch_op:
        batch_op.drop_constraint(EFFECTIVE_IRRIGATION_CHECK, type_="check")
        batch_op.drop_constraint(UPDATE_UNIQUE_CONSTRAINT, type_="unique")
        batch_op.drop_constraint(REPORTED_EVENT_FK, type_="foreignkey")
        batch_op.drop_column("effective_irrigation_mm")
        batch_op.drop_column("reported_irrigation_event_id")
        batch_op.drop_column("request_fingerprint")
        batch_op.drop_column("water_update_id")


def _backfill_existing_water_observations() -> None:
    connection = op.get_bind()
    rows = connection.execute(
        sa.text(
            """
            SELECT
                water_observations.observation_id,
                water_observations.state_id,
                water_observations.observed_at,
                water_observations.computed_at,
                water_observations.observation_time_basis,
                water_observations.irrigation_event_id,
                water_observations.weather_payload_json,
                water_observations.previous_root_zone_depletion_mm,
                water_observations.payload_json,
                irrigation_events.amount_mm AS irrigation_amount_mm
            FROM water_observations
            LEFT JOIN irrigation_events
              ON irrigation_events.irrigation_event_id =
                 water_observations.irrigation_event_id
            """
        )
    ).mappings()

    for row in rows:
        water_update_id = _legacy_water_update_id(row)
        request_fingerprint = _legacy_request_fingerprint(row, water_update_id)
        effective_irrigation_mm = (
            0.0
            if row["irrigation_event_id"] is None
            else float(row["irrigation_amount_mm"] or 0.0)
        )
        connection.execute(
            sa.text(
                """
                UPDATE water_observations
                SET water_update_id = :water_update_id,
                    request_fingerprint = :request_fingerprint,
                    reported_irrigation_event_id = irrigation_event_id,
                    effective_irrigation_mm = :effective_irrigation_mm
                WHERE observation_id = :observation_id
                """
            ),
            {
                "observation_id": row["observation_id"],
                "water_update_id": water_update_id,
                "request_fingerprint": request_fingerprint,
                "effective_irrigation_mm": effective_irrigation_mm,
            },
        )


def _legacy_water_update_id(row: Any) -> str:
    payload = {
        "legacy_water_update": True,
        "state_id": row["state_id"],
        "observed_at": _jsonable(row["observed_at"]),
        "observation_id": row["observation_id"],
    }
    return "legacy-water-update-" + _sha256(payload)


def _legacy_request_fingerprint(row: Any, water_update_id: str) -> str:
    payload = {
        "legacy_water_update_fingerprint": True,
        "state_id": row["state_id"],
        "water_update_id": water_update_id,
        "observed_at": _jsonable(row["observed_at"]),
        "computed_at": _jsonable(row["computed_at"]),
        "observation_time_basis": row["observation_time_basis"],
        "irrigation_event_id": row["irrigation_event_id"],
        "weather_payload_json": _jsonable(row["weather_payload_json"]),
        "previous_root_zone_depletion_mm": row[
            "previous_root_zone_depletion_mm"
        ],
        "payload_json": _jsonable(row["payload_json"]),
    }
    return _sha256(payload)


def _sha256(payload: dict[str, Any]) -> str:
    canonical = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
        allow_nan=False,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _jsonable(value: Any) -> Any:
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.startswith("{") or stripped.startswith("["):
            try:
                return json.loads(stripped)
            except json.JSONDecodeError:
                return value
        return value
    return value
