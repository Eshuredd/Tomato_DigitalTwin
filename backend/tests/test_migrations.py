from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
import pytest
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from app.persistence.database import create_database_engine


REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"

REQUIRED_TABLES = {
    "farms",
    "plots",
    "crop_cycles",
    "disease_observations",
    "growth_observations",
    "water_observations",
    "irrigation_events",
    "twin_state_snapshots",
    "simulation_runs",
    "recommendation_runs",
    "actual_actions",
}

REQUIRED_INDEXES = {
    "ix_disease_observations_state_computed_at",
    "ix_growth_observations_state_computed_at",
    "ix_water_observations_state_computed_at",
    "ux_water_observations_irrigation_event_id",
    "ix_twin_state_snapshots_state_computed_at",
    "ix_simulation_runs_state_snapshot_computed_at",
    "ix_recommendation_runs_state_snapshot_simulation_computed_at",
    "ix_irrigation_events_state_occurred_at",
    "ix_actual_actions_state_performed_at",
    "ix_water_observations_state_reported_irrigation_observed",
}


def _config(database_url: str) -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.attributes["database_url"] = database_url
    return config


def _database_url(tmp_path: Path, name: str = "migrated.db") -> str:
    return f"sqlite+pysqlite:///{tmp_path / name}"


def _index_names(database_url: str) -> set[str]:
    engine = create_database_engine(database_url)
    inspector = inspect(engine)
    names: set[str] = set()
    for table_name in REQUIRED_TABLES:
        if table_name in inspector.get_table_names():
            names.update(index["name"] for index in inspector.get_indexes(table_name))
    engine.dispose()
    return names


def test_alembic_upgrade_downgrade_recreates_integrity_schema(tmp_path) -> None:
    database_url = _database_url(tmp_path)
    config = _config(database_url)

    command.upgrade(config, "head")

    engine = create_database_engine(database_url)
    inspector = inspect(engine)
    assert REQUIRED_TABLES.issubset(set(inspector.get_table_names()))

    water_columns = {
        column["name"] for column in inspector.get_columns("water_observations")
    }
    irrigation_columns = {
        column["name"] for column in inspector.get_columns("irrigation_events")
    }
    assert "irrigation_event_id" in water_columns
    assert "water_update_id" in water_columns
    assert "request_fingerprint" in water_columns
    assert "reported_irrigation_event_id" in water_columns
    assert "effective_irrigation_mm" in water_columns
    assert "applied_to_water_observation_id" not in irrigation_columns

    water_indexes = {
        index["name"]: index for index in inspector.get_indexes("water_observations")
    }
    assert water_indexes["ux_water_observations_irrigation_event_id"]["unique"]
    unique_constraints = {
        constraint["name"]: constraint
        for constraint in inspector.get_unique_constraints("water_observations")
    }
    assert set(
        unique_constraints["uq_water_observations_state_water_update_id"]["column_names"]
    ) == {"state_id", "water_update_id"}
    foreign_keys = inspector.get_foreign_keys("water_observations")
    assert any(
        fk["referred_table"] == "irrigation_events"
        and fk["constrained_columns"] == ["reported_irrigation_event_id"]
        for fk in foreign_keys
    )
    engine.dispose()

    assert REQUIRED_INDEXES.issubset(_index_names(database_url))

    command.downgrade(config, "base")

    engine = create_database_engine(database_url)
    inspector = inspect(engine)
    assert REQUIRED_TABLES.isdisjoint(set(inspector.get_table_names()))
    engine.dispose()

    command.upgrade(config, "head")

    engine = create_database_engine(database_url)
    inspector = inspect(engine)
    assert REQUIRED_TABLES.issubset(set(inspector.get_table_names()))
    engine.dispose()


def test_migrated_sqlite_enforces_irrigation_event_fk_and_unique_link(tmp_path) -> None:
    database_url = _database_url(tmp_path)
    command.upgrade(_config(database_url), "head")

    engine = create_database_engine(database_url)
    with engine.begin() as connection:
        _insert_crop_cycle_and_irrigation_event(connection)
        _insert_water_observation(
            connection,
            observation_id="water-1",
            irrigation_event_id="event-migration",
            water_update_id="update-migration-1",
            reported_irrigation_event_id="event-migration",
            effective_irrigation_mm=8.0,
        )

    with pytest.raises(IntegrityError):
        with engine.begin() as connection:
            _insert_water_observation(
                connection,
                observation_id="water-duplicate",
                irrigation_event_id="event-migration",
                water_update_id="update-migration-2",
                reported_irrigation_event_id="event-migration",
                effective_irrigation_mm=8.0,
            )

    with pytest.raises(IntegrityError):
        with engine.begin() as connection:
            _insert_water_observation(
                connection,
                observation_id="water-missing-event",
                irrigation_event_id="missing-event",
                water_update_id="update-migration-3",
                reported_irrigation_event_id="missing-event",
                effective_irrigation_mm=8.0,
            )

    with pytest.raises(IntegrityError):
        with engine.begin() as connection:
            _insert_water_observation(
                connection,
                observation_id="water-duplicate-update",
                irrigation_event_id=None,
                water_update_id="update-migration-1",
                reported_irrigation_event_id=None,
                effective_irrigation_mm=0.0,
            )

    engine.dispose()


def test_integrity_migration_rejects_duplicate_irrigation_event_links(tmp_path) -> None:
    database_url = _database_url(tmp_path, "duplicate-guard.db")
    config = _config(database_url)
    command.upgrade(config, "202607160001")

    engine = create_database_engine(database_url)
    with engine.begin() as connection:
        _insert_crop_cycle_and_irrigation_event(connection)
        _insert_water_observation(
            connection,
            observation_id="water-1",
            irrigation_event_id="event-migration",
            include_identity=False,
        )
        _insert_water_observation(
            connection,
            observation_id="water-2",
            irrigation_event_id="event-migration",
            include_identity=False,
        )

    with pytest.raises(RuntimeError, match="Cannot add unique irrigation-event"):
        command.upgrade(config, "202607170002")

    engine.dispose()


def test_water_update_identity_migration_backfills_legacy_rows(tmp_path) -> None:
    database_url = _database_url(tmp_path, "water-identity-backfill.db")
    config = _config(database_url)
    command.upgrade(config, "202607170002")

    engine = create_database_engine(database_url)
    with engine.begin() as connection:
        _insert_crop_cycle_and_irrigation_event(connection)
        _insert_water_observation(
            connection,
            observation_id="legacy-water-1",
            irrigation_event_id="event-migration",
            include_identity=False,
        )
        _insert_water_observation(
            connection,
            observation_id="legacy-water-2",
            irrigation_event_id=None,
            include_identity=False,
        )

    command.upgrade(config, "head")

    with engine.connect() as connection:
        rows = connection.execute(
            text(
                """
                SELECT
                    observation_id,
                    water_update_id,
                    request_fingerprint,
                    irrigation_event_id,
                    reported_irrigation_event_id,
                    effective_irrigation_mm
                FROM water_observations
                ORDER BY observation_id
                """
            )
        ).mappings().all()

    assert len(rows) == 2
    assert all(row["water_update_id"].startswith("legacy-water-update-") for row in rows)
    assert len({(row["water_update_id"]) for row in rows}) == 2
    assert all(len(row["request_fingerprint"]) == 64 for row in rows)
    irrigated = rows[0]
    dry = rows[1]
    assert irrigated["reported_irrigation_event_id"] == "event-migration"
    assert irrigated["effective_irrigation_mm"] == pytest.approx(8.0)
    assert dry["reported_irrigation_event_id"] is None
    assert dry["effective_irrigation_mm"] == pytest.approx(0.0)

    command.downgrade(config, "202607170002")
    inspector = inspect(engine)
    water_columns = {
        column["name"] for column in inspector.get_columns("water_observations")
    }
    assert "water_update_id" not in water_columns
    assert "irrigation_event_id" in water_columns

    command.upgrade(config, "head")
    inspector = inspect(engine)
    water_columns = {
        column["name"] for column in inspector.get_columns("water_observations")
    }
    assert "water_update_id" in water_columns
    engine.dispose()


def _insert_crop_cycle_and_irrigation_event(connection) -> None:
    connection.execute(
        text(
            """
            INSERT INTO crop_cycles (
                state_id,
                plot_id,
                crop_type,
                planting_date,
                standalone_location_name,
                standalone_latitude,
                standalone_longitude,
                standalone_elevation_m,
                standalone_soil_texture,
                created_at,
                status
            )
            VALUES (
                'state-migration',
                NULL,
                'tomato',
                '2026-06-01',
                'Migration Farm',
                17.385,
                78.4867,
                542.0,
                'sandy_loam',
                '2026-07-10T00:00:00+00:00',
                'active'
            )
            """
        )
    )
    connection.execute(
        text(
            """
            INSERT INTO irrigation_events (
                irrigation_event_id,
                state_id,
                occurred_at,
                amount_mm,
                source,
                recorded_at,
                payload_json
            )
            VALUES (
                'event-migration',
                'state-migration',
                '2026-07-09T08:00:00+00:00',
                8.0,
                'MANUAL',
                '2026-07-10T00:00:00+00:00',
                '{}'
            )
            """
        )
    )


def _insert_water_observation(
    connection,
    *,
    observation_id: str,
    irrigation_event_id: str | None,
    include_identity: bool = True,
    water_update_id: str | None = None,
    reported_irrigation_event_id: str | None = None,
    effective_irrigation_mm: float = 0.0,
) -> None:
    if include_identity:
        connection.execute(
            text(
                """
                INSERT INTO water_observations (
                    observation_id,
                    state_id,
                    observed_at,
                    computed_at,
                    observation_time_basis,
                    water_update_id,
                    request_fingerprint,
                    weather_payload_json,
                    previous_root_zone_depletion_mm,
                    raw_root_zone_depletion_mm,
                    root_zone_depletion_mm,
                    water_surplus_mm,
                    depletion_beyond_taw_mm,
                    irrigation_event_id,
                    reported_irrigation_event_id,
                    effective_irrigation_mm,
                    payload_json
                )
                VALUES (
                    :observation_id,
                    'state-migration',
                    '2026-07-10T00:00:00+00:00',
                    '2026-07-10T00:01:00+00:00',
                    'DATE_ONLY_UTC_START',
                    :water_update_id,
                    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                    '{}',
                    NULL,
                    0.0,
                    0.0,
                    0.0,
                    0.0,
                    :irrigation_event_id,
                    :reported_irrigation_event_id,
                    :effective_irrigation_mm,
                    '{}'
                )
                """
            ),
            {
                "observation_id": observation_id,
                "irrigation_event_id": irrigation_event_id,
                "water_update_id": water_update_id or f"update-{observation_id}",
                "reported_irrigation_event_id": reported_irrigation_event_id,
                "effective_irrigation_mm": effective_irrigation_mm,
            },
        )
        return

    connection.execute(
        text(
            """
            INSERT INTO water_observations (
                observation_id,
                state_id,
                observed_at,
                computed_at,
                observation_time_basis,
                weather_payload_json,
                previous_root_zone_depletion_mm,
                raw_root_zone_depletion_mm,
                root_zone_depletion_mm,
                water_surplus_mm,
                depletion_beyond_taw_mm,
                irrigation_event_id,
                payload_json
            )
            VALUES (
                :observation_id,
                'state-migration',
                '2026-07-10T00:00:00+00:00',
                '2026-07-10T00:01:00+00:00',
                'DATE_ONLY_UTC_START',
                '{}',
                NULL,
                0.0,
                0.0,
                0.0,
                0.0,
                :irrigation_event_id,
                '{}'
            )
            """
        ),
        {
            "observation_id": observation_id,
            "irrigation_event_id": irrigation_event_id,
        },
    )
