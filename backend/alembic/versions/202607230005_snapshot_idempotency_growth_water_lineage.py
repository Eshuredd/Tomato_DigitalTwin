"""snapshot idempotency and growth water lineage

Revision ID: 202607230005
Revises: 202607220004
Create Date: 2026-07-23
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from typing import Any

from alembic import op
import sqlalchemy as sa


revision = "202607230005"
down_revision = "202607220004"
branch_labels = None
depends_on = None


WATER_GROWTH_INDEX = "ix_water_observations_growth_observation_id"
WATER_GROWTH_FK = "fk_water_observations_growth_observation_id"
SNAPSHOT_SOURCE_UNIQUE = "uq_twin_state_snapshots_state_source_fingerprint"


def upgrade() -> None:
    with op.batch_alter_table("water_observations") as batch_op:
        batch_op.add_column(
            sa.Column("growth_observation_id", sa.String(length=120), nullable=True)
        )

    with op.batch_alter_table("twin_state_snapshots") as batch_op:
        batch_op.add_column(
            sa.Column("source_fingerprint", sa.String(length=64), nullable=True)
        )
        batch_op.add_column(sa.Column("water_sequence", sa.Integer(), nullable=True))

    _backfill_water_growth_links()
    _backfill_snapshot_source_fingerprints()

    with op.batch_alter_table("water_observations") as batch_op:
        batch_op.alter_column(
            "growth_observation_id",
            existing_type=sa.String(length=120),
            nullable=False,
        )
        batch_op.create_foreign_key(
            WATER_GROWTH_FK,
            "growth_observations",
            ["growth_observation_id"],
            ["observation_id"],
        )

    op.create_index(
        WATER_GROWTH_INDEX,
        "water_observations",
        ["growth_observation_id"],
        unique=False,
    )

    with op.batch_alter_table("twin_state_snapshots") as batch_op:
        batch_op.alter_column(
            "source_fingerprint",
            existing_type=sa.String(length=64),
            nullable=False,
        )
        batch_op.alter_column(
            "water_sequence",
            existing_type=sa.Integer(),
            nullable=False,
        )
        batch_op.create_unique_constraint(
            SNAPSHOT_SOURCE_UNIQUE,
            ["state_id", "source_fingerprint"],
        )


def downgrade() -> None:
    with op.batch_alter_table("twin_state_snapshots") as batch_op:
        batch_op.drop_constraint(SNAPSHOT_SOURCE_UNIQUE, type_="unique")
        batch_op.drop_column("water_sequence")
        batch_op.drop_column("source_fingerprint")

    op.drop_index(WATER_GROWTH_INDEX, table_name="water_observations")
    with op.batch_alter_table("water_observations") as batch_op:
        batch_op.drop_constraint(WATER_GROWTH_FK, type_="foreignkey")
        batch_op.drop_column("growth_observation_id")


def _backfill_water_growth_links() -> None:
    connection = op.get_bind()
    water_rows = connection.execute(
        sa.text(
            """
            SELECT observation_id, state_id, observed_at, computed_at,
                   observation_time_basis
            FROM water_observations
            ORDER BY state_id, observed_at, computed_at, observation_id
            """
        )
    ).mappings().all()
    growth_rows = connection.execute(
        sa.text(
            """
            SELECT observation_id, state_id, observed_at, computed_at,
                   observation_time_basis
            FROM growth_observations
            ORDER BY state_id, observed_at, computed_at, observation_id
            """
        )
    ).mappings().all()

    growth_by_state: dict[str, list[Any]] = {}
    for row in growth_rows:
        growth_by_state.setdefault(row["state_id"], []).append(row)

    for water in water_rows:
        candidates = growth_by_state.get(water["state_id"], [])
        selected = _select_growth_for_water(water, candidates)
        if selected is None:
            raise RuntimeError(
                "Cannot backfill water_observations.growth_observation_id; "
                f"no suitable growth observation exists for {water['observation_id']}."
            )
        connection.execute(
            sa.text(
                """
                UPDATE water_observations
                SET growth_observation_id = :growth_observation_id
                WHERE observation_id = :observation_id
                """
            ),
            {
                "growth_observation_id": selected["observation_id"],
                "observation_id": water["observation_id"],
            },
        )


def _select_growth_for_water(water: Any, candidates: list[Any]) -> Any | None:
    water_observed = _as_datetime(water["observed_at"])
    water_computed = _as_datetime(water["computed_at"])
    exact = [
        row
        for row in candidates
        if _as_datetime(row["observed_at"]) == water_observed
        and row["observation_time_basis"] == water["observation_time_basis"]
    ]
    if exact:
        not_after = [
            row
            for row in exact
            if _as_datetime(row["computed_at"]) <= water_computed
        ]
        pool = not_after or exact
        return sorted(
            pool,
            key=lambda row: (
                abs((_as_datetime(row["computed_at"]) - water_computed).total_seconds()),
                _as_datetime(row["computed_at"]),
                row["observation_id"],
            ),
        )[0]

    historical = [
        row
        for row in candidates
        if _as_datetime(row["observed_at"]) <= water_observed
    ]
    if not historical:
        return None
    return sorted(
        historical,
        key=lambda row: (
            _as_datetime(row["observed_at"]),
            _as_datetime(row["computed_at"]),
            row["observation_id"],
        ),
    )[-1]


def _backfill_snapshot_source_fingerprints() -> None:
    connection = op.get_bind()
    rows = connection.execute(
        sa.text(
            """
            SELECT s.snapshot_id, s.state_id, s.computed_at,
                   s.disease_observation_id, s.growth_observation_id,
                   s.water_observation_id, w.water_sequence
            FROM twin_state_snapshots s
            JOIN water_observations w
              ON w.observation_id = s.water_observation_id
            ORDER BY s.state_id, s.computed_at, s.snapshot_id
            """
        )
    ).mappings().all()

    seen: set[tuple[str, str]] = set()
    for row in rows:
        fingerprint = _source_fingerprint(row)
        key = (row["state_id"], fingerprint)
        if key in seen:
            fingerprint = _legacy_duplicate_fingerprint(
                source_fingerprint=fingerprint,
                snapshot_id=row["snapshot_id"],
            )
        seen.add((row["state_id"], fingerprint))
        connection.execute(
            sa.text(
                """
                UPDATE twin_state_snapshots
                SET source_fingerprint = :source_fingerprint,
                    water_sequence = :water_sequence
                WHERE snapshot_id = :snapshot_id
                """
            ),
            {
                "source_fingerprint": fingerprint,
                "water_sequence": row["water_sequence"],
                "snapshot_id": row["snapshot_id"],
            },
        )


def _source_fingerprint(row: Any) -> str:
    payload = {
        "state_id": row["state_id"],
        "disease_observation_id": row["disease_observation_id"],
        "growth_observation_id": row["growth_observation_id"],
        "water_observation_id": row["water_observation_id"],
    }
    return _sha256(payload)


def _legacy_duplicate_fingerprint(*, source_fingerprint: str, snapshot_id: str) -> str:
    digest = _sha256(
        {
            "legacy_duplicate_snapshot": True,
            "source_fingerprint": source_fingerprint,
            "snapshot_id": snapshot_id,
        }
    )
    return "legacy-" + digest[:57]


def _sha256(payload: dict[str, Any]) -> str:
    canonical = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _as_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        result = value
    else:
        result = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if result.tzinfo is None or result.utcoffset() is None:
        return result.replace(tzinfo=timezone.utc)
    return result.astimezone(timezone.utc)
