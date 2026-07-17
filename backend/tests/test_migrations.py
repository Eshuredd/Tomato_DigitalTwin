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
    assert "applied_to_water_observation_id" not in irrigation_columns

    water_indexes = {
        index["name"]: index for index in inspector.get_indexes("water_observations")
    }
    assert water_indexes["ux_water_observations_irrigation_event_id"]["unique"]
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
        )

    with pytest.raises(IntegrityError):
        with engine.begin() as connection:
            _insert_water_observation(
                connection,
                observation_id="water-duplicate",
                irrigation_event_id="event-migration",
            )

    with pytest.raises(IntegrityError):
        with engine.begin() as connection:
            _insert_water_observation(
                connection,
                observation_id="water-missing-event",
                irrigation_event_id="missing-event",
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
        )
        _insert_water_observation(
            connection,
            observation_id="water-2",
            irrigation_event_id="event-migration",
        )

    with pytest.raises(RuntimeError, match="Cannot add unique irrigation-event"):
        command.upgrade(config, "head")

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
    irrigation_event_id: str,
) -> None:
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
