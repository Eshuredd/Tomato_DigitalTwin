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
    "ix_water_observations_state_observed_at",
    "ix_water_observations_growth_observation_id",
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
    assert "growth_observation_id" in water_columns
    assert "applied_to_water_observation_id" not in irrigation_columns
    snapshot_columns = {
        column["name"] for column in inspector.get_columns("twin_state_snapshots")
    }
    assert "source_fingerprint" in snapshot_columns
    assert "water_sequence" in snapshot_columns

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
    assert any(
        fk["referred_table"] == "growth_observations"
        and fk["constrained_columns"] == ["growth_observation_id"]
        for fk in foreign_keys
    )
    snapshot_unique_constraints = {
        constraint["name"]: constraint
        for constraint in inspector.get_unique_constraints("twin_state_snapshots")
    }
    assert set(
        snapshot_unique_constraints[
            "uq_twin_state_snapshots_state_source_fingerprint"
        ]["column_names"]
    ) == {"state_id", "source_fingerprint"}
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
                water_sequence=2,
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
                water_sequence=3,
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
                water_sequence=4,
            )

    with pytest.raises(IntegrityError):
        with engine.begin() as connection:
            _insert_water_observation(
                connection,
                observation_id="water-duplicate-sequence",
                irrigation_event_id=None,
                water_update_id="update-migration-5",
                reported_irrigation_event_id=None,
                effective_irrigation_mm=0.0,
                water_sequence=1,
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


def test_canonical_water_progression_migration_backfills_chain_and_reupgrades(
    tmp_path,
) -> None:
    database_url = _database_url(tmp_path, "canonical-water-progression.db")
    config = _config(database_url)
    command.upgrade(config, "202607200003")

    expected_legacy = {
        "water-a": {
            "observed_at": "2026-07-10T08:00:00+00:00",
            "computed_at": "2026-07-10T08:02:00+00:00",
            "water_update_id": "legacy-update-a",
            "request_fingerprint": "a" * 64,
            "marker": "A",
            "irrigation_event_id": None,
            "reported_irrigation_event_id": None,
            "effective_irrigation_mm": 0.0,
        },
        "water-b": {
            "observed_at": "2026-07-11T08:00:00+00:00",
            "computed_at": "2026-07-11T08:05:00+00:00",
            "water_update_id": "legacy-update-b",
            "request_fingerprint": "b" * 64,
            "marker": "B",
            "irrigation_event_id": None,
            "reported_irrigation_event_id": None,
            "effective_irrigation_mm": 0.0,
        },
        "water-c": {
            "observed_at": "2026-07-11T08:00:00+00:00",
            "computed_at": "2026-07-11T08:03:00+00:00",
            "water_update_id": "legacy-update-c",
            "request_fingerprint": "c" * 64,
            "marker": "C",
            "irrigation_event_id": None,
            "reported_irrigation_event_id": None,
            "effective_irrigation_mm": 0.0,
        },
        "water-e": {
            "observed_at": "2026-07-11T09:00:00+00:00",
            "computed_at": "2026-07-11T09:05:00+00:00",
            "water_update_id": "legacy-update-e",
            "request_fingerprint": "e" * 64,
            "marker": "E",
            "irrigation_event_id": None,
            "reported_irrigation_event_id": None,
            "effective_irrigation_mm": 0.0,
        },
        "water-f": {
            "observed_at": "2026-07-11T09:00:00+00:00",
            "computed_at": "2026-07-11T09:05:00+00:00",
            "water_update_id": "legacy-update-f",
            "request_fingerprint": "f" * 64,
            "marker": "F",
            "irrigation_event_id": None,
            "reported_irrigation_event_id": None,
            "effective_irrigation_mm": 0.0,
        },
        "water-d": {
            "observed_at": "2026-07-12T08:00:00+00:00",
            "computed_at": "2026-07-12T08:01:00+00:00",
            "water_update_id": "legacy-update-d",
            "request_fingerprint": "d" * 64,
            "marker": "D",
            "irrigation_event_id": "event-migration",
            "reported_irrigation_event_id": "event-migration",
            "effective_irrigation_mm": 8.0,
        },
    }

    engine = create_database_engine(database_url)
    with engine.begin() as connection:
        _insert_legacy_crop_cycle(connection, state_id="state-migration")
        _insert_legacy_crop_cycle(connection, state_id="state-other")
        _insert_legacy_irrigation_event(connection, state_id="state-migration")
        _insert_legacy_growth_observation(
            connection,
            observation_id="growth-jul10",
            observed_at="2026-07-10T08:00:00+00:00",
            computed_at="2026-07-10T08:01:00+00:00",
            current_date="2026-07-10",
        )
        _insert_legacy_growth_observation(
            connection,
            observation_id="growth-jul11-early",
            observed_at="2026-07-11T08:00:00+00:00",
            computed_at="2026-07-11T08:02:00+00:00",
            current_date="2026-07-11",
        )
        _insert_legacy_growth_observation(
            connection,
            observation_id="growth-jul11-late",
            observed_at="2026-07-11T08:00:00+00:00",
            computed_at="2026-07-11T08:04:00+00:00",
            current_date="2026-07-11",
        )
        _insert_legacy_growth_observation(
            connection,
            observation_id="growth-jul11-0904",
            observed_at="2026-07-11T09:00:00+00:00",
            computed_at="2026-07-11T09:04:00+00:00",
            current_date="2026-07-11",
        )
        _insert_legacy_growth_observation(
            connection,
            observation_id="growth-other-state",
            state_id="state-other",
            observed_at="2026-07-12T08:00:00+00:00",
            computed_at="2026-07-12T08:00:30+00:00",
            current_date="2026-07-12",
        )
        _insert_legacy_disease_observation(connection)
        for observation_id in (
            "water-b",
            "water-d",
            "water-f",
            "water-e",
            "water-c",
            "water-a",
        ):
            _insert_water_observation_202607200003(
                connection,
                observation_id=observation_id,
                **expected_legacy[observation_id],
            )
        _insert_snapshot_202607200003(
            connection,
            snapshot_id="snapshot-a",
            growth_observation_id="growth-jul11-early",
            water_observation_id="water-c",
        )
        _insert_snapshot_202607200003(
            connection,
            snapshot_id="snapshot-z-duplicate",
            growth_observation_id="growth-jul11-early",
            water_observation_id="water-c",
        )

    command.upgrade(config, "202607220004")

    with engine.connect() as connection:
        water_rows = connection.execute(
            text(
                """
                SELECT
                    observation_id,
                    observed_at,
                    computed_at,
                    water_sequence,
                    base_water_observation_id,
                    base_water_sequence,
                    water_update_id,
                    request_fingerprint,
                    irrigation_event_id,
                    reported_irrigation_event_id,
                    effective_irrigation_mm,
                    json_extract(payload_json, '$.marker') AS marker
                FROM water_observations
                WHERE state_id = 'state-migration'
                ORDER BY water_sequence
                """
            )
        ).mappings().all()
        crop_pointer = connection.execute(
            text(
                """
                SELECT water_sequence, latest_water_observation_id
                FROM crop_cycles
                WHERE state_id = 'state-migration'
                """
            )
        ).mappings().one()
        latest_water = connection.execute(
            text(
                """
                SELECT state_id, water_sequence
                FROM water_observations
                WHERE observation_id = :observation_id
                """
            ),
            {"observation_id": crop_pointer["latest_water_observation_id"]},
        ).mappings().one()

    assert [row["observation_id"] for row in water_rows] == [
        "water-a",
        "water-c",
        "water-b",
        "water-e",
        "water-f",
        "water-d",
    ]
    expected_lineage = {
        "water-a": (1, None, 0),
        "water-c": (2, "water-a", 1),
        "water-b": (3, "water-c", 2),
        "water-e": (4, "water-b", 3),
        "water-f": (5, "water-e", 4),
        "water-d": (6, "water-f", 5),
    }
    for row in water_rows:
        expected = expected_legacy[row["observation_id"]]
        assert (
            row["water_sequence"],
            row["base_water_observation_id"],
            row["base_water_sequence"],
        ) == expected_lineage[row["observation_id"]]
        assert row["observed_at"] == expected["observed_at"]
        assert row["computed_at"] == expected["computed_at"]
        assert row["water_update_id"] == expected["water_update_id"]
        assert row["request_fingerprint"] == expected["request_fingerprint"]
        assert row["marker"] == expected["marker"]
        assert row["irrigation_event_id"] == expected["irrigation_event_id"]
        assert (
            row["reported_irrigation_event_id"]
            == expected["reported_irrigation_event_id"]
        )
        assert row["effective_irrigation_mm"] == pytest.approx(
            expected["effective_irrigation_mm"]
        )
    assert [row["water_sequence"] for row in water_rows] == [1, 2, 3, 4, 5, 6]
    assert crop_pointer["water_sequence"] == 6
    assert crop_pointer["latest_water_observation_id"] == "water-d"
    assert latest_water["state_id"] == "state-migration"
    assert latest_water["water_sequence"] == crop_pointer["water_sequence"]

    command.downgrade(config, "202607200003")

    inspector = inspect(engine)
    assert "water_sequence" not in _column_names(inspector, "crop_cycles")
    assert "latest_water_observation_id" not in _column_names(
        inspector,
        "crop_cycles",
    )
    assert "water_sequence" not in _column_names(inspector, "water_observations")
    assert "base_water_observation_id" not in _column_names(
        inspector,
        "water_observations",
    )
    assert "base_water_sequence" not in _column_names(
        inspector,
        "water_observations",
    )

    with engine.connect() as connection:
        downgraded_rows = connection.execute(
            text(
                """
                SELECT
                    observation_id,
                    state_id,
                    observed_at,
                    computed_at,
                    water_update_id,
                    request_fingerprint,
                    irrigation_event_id,
                    reported_irrigation_event_id,
                    effective_irrigation_mm,
                    json_extract(payload_json, '$.marker') AS marker
                FROM water_observations
                WHERE state_id = 'state-migration'
                ORDER BY observation_id
                """
            )
        ).mappings().all()

    assert len(downgraded_rows) == 6
    for row in downgraded_rows:
        expected = expected_legacy[row["observation_id"]]
        assert row["state_id"] == "state-migration"
        assert row["observed_at"] == expected["observed_at"]
        assert row["computed_at"] == expected["computed_at"]
        assert row["water_update_id"] == expected["water_update_id"]
        assert row["request_fingerprint"] == expected["request_fingerprint"]
        assert row["irrigation_event_id"] == expected["irrigation_event_id"]
        assert (
            row["reported_irrigation_event_id"]
            == expected["reported_irrigation_event_id"]
        )
        assert row["effective_irrigation_mm"] == pytest.approx(
            expected["effective_irrigation_mm"]
        )
        assert row["marker"] == expected["marker"]

    command.upgrade(config, "head")

    with engine.connect() as connection:
        final_water_rows = connection.execute(
            text(
                """
                SELECT
                    w.observation_id,
                    w.water_sequence,
                    w.growth_observation_id,
                    g.state_id AS growth_state_id
                FROM water_observations w
                JOIN growth_observations g
                  ON g.observation_id = w.growth_observation_id
                WHERE w.state_id = 'state-migration'
                ORDER BY w.water_sequence
                """
            )
        ).mappings().all()
        final_pointer = connection.execute(
            text(
                """
                SELECT water_sequence, latest_water_observation_id
                FROM crop_cycles
                WHERE state_id = 'state-migration'
                """
            )
        ).mappings().one()
        snapshots = connection.execute(
            text(
                """
                SELECT snapshot_id, source_fingerprint, water_sequence
                FROM twin_state_snapshots
                ORDER BY snapshot_id
                """
            )
        ).mappings().all()

    assert {
        row["observation_id"]: row["growth_observation_id"]
        for row in final_water_rows
    } == {
        "water-a": "growth-jul10",
        "water-c": "growth-jul11-early",
        "water-b": "growth-jul11-late",
        "water-e": "growth-jul11-0904",
        "water-f": "growth-jul11-0904",
        "water-d": "growth-jul11-0904",
    }
    assert all(row["growth_state_id"] == "state-migration" for row in final_water_rows)
    assert [row["observation_id"] for row in final_water_rows] == [
        "water-a",
        "water-c",
        "water-b",
        "water-e",
        "water-f",
        "water-d",
    ]
    assert final_pointer["water_sequence"] == 6
    assert final_pointer["latest_water_observation_id"] == "water-d"
    assert [row["water_sequence"] for row in final_water_rows] == [1, 2, 3, 4, 5, 6]
    assert len(final_water_rows) == 6
    assert len(snapshots) == 2
    assert {row["water_sequence"] for row in snapshots} == {2}
    assert all(row["source_fingerprint"] for row in snapshots)
    assert snapshots[0]["snapshot_id"] == "snapshot-a"
    assert not snapshots[0]["source_fingerprint"].startswith("legacy-")
    assert snapshots[1]["snapshot_id"] == "snapshot-z-duplicate"
    assert snapshots[1]["source_fingerprint"].startswith("legacy-")

    engine.dispose()


def test_canonical_water_progression_migration_constraints(tmp_path) -> None:
    database_url = _database_url(tmp_path, "canonical-water-constraints.db")
    config = _config(database_url)
    command.upgrade(config, "202607220004")

    engine = create_database_engine(database_url)
    inspector = inspect(engine)
    assert "water_sequence" in _column_names(inspector, "crop_cycles")
    assert "latest_water_observation_id" in _column_names(inspector, "crop_cycles")
    assert "water_sequence" in _column_names(inspector, "water_observations")
    assert "base_water_observation_id" in _column_names(inspector, "water_observations")
    assert "base_water_sequence" in _column_names(inspector, "water_observations")
    unique_constraints = {
        constraint["name"]: constraint
        for constraint in inspector.get_unique_constraints("water_observations")
    }
    assert set(
        unique_constraints["uq_water_observations_state_water_sequence"][
            "column_names"
        ]
    ) == {"state_id", "water_sequence"}
    assert any(
        fk["referred_table"] == "water_observations"
        and fk["constrained_columns"] == ["base_water_observation_id"]
        for fk in inspector.get_foreign_keys("water_observations")
    )
    assert {
        index["name"]
        for index in inspector.get_indexes("water_observations")
    } >= {"ix_water_observations_state_observed_at"}

    with engine.begin() as connection:
        _insert_legacy_crop_cycle(connection, state_id="state-constraints")
        _insert_legacy_crop_cycle(connection, state_id="state-other")
        _insert_water_observation_202607220004(
            connection,
            observation_id="water-base",
            state_id="state-constraints",
            water_sequence=1,
            base_water_sequence=0,
            observed_at="2026-07-10T08:00:00+00:00",
            computed_at="2026-07-10T08:01:00+00:00",
            water_update_id="constraints-base-update",
            request_fingerprint="1" * 64,
        )

    with pytest.raises(IntegrityError):
        with engine.begin() as connection:
            _insert_water_observation_202607220004(
                connection,
                observation_id="water-duplicate-sequence",
                state_id="state-constraints",
                water_sequence=1,
                base_water_sequence=0,
                observed_at="2026-07-10T09:00:00+00:00",
                computed_at="2026-07-10T09:01:00+00:00",
                water_update_id="constraints-duplicate-sequence-update",
                request_fingerprint="2" * 64,
            )

    with engine.begin() as connection:
        _insert_water_observation_202607220004(
            connection,
            observation_id="water-other-state-same-sequence",
            state_id="state-other",
            water_sequence=1,
            base_water_sequence=0,
            observed_at="2026-07-10T09:00:00+00:00",
            computed_at="2026-07-10T09:01:00+00:00",
            water_update_id="other-state-same-sequence-update",
            request_fingerprint="3" * 64,
        )

    with pytest.raises(IntegrityError):
        with engine.begin() as connection:
            _insert_water_observation_202607220004(
                connection,
                observation_id="water-negative-base-sequence",
                state_id="state-constraints",
                water_sequence=2,
                base_water_observation_id="water-base",
                base_water_sequence=-1,
                observed_at="2026-07-10T10:00:00+00:00",
                computed_at="2026-07-10T10:01:00+00:00",
                water_update_id="constraints-negative-base-update",
                request_fingerprint="4" * 64,
            )

    with pytest.raises(IntegrityError):
        with engine.begin() as connection:
            _insert_water_observation_202607220004(
                connection,
                observation_id="water-zero-sequence",
                state_id="state-constraints",
                water_sequence=0,
                base_water_sequence=0,
                observed_at="2026-07-10T11:00:00+00:00",
                computed_at="2026-07-10T11:01:00+00:00",
                water_update_id="constraints-zero-sequence-update",
                request_fingerprint="5" * 64,
            )

    with pytest.raises(IntegrityError):
        with engine.begin() as connection:
            _insert_water_observation_202607220004(
                connection,
                observation_id="water-missing-base",
                state_id="state-constraints",
                water_sequence=3,
                base_water_observation_id="missing-water-base",
                base_water_sequence=1,
                observed_at="2026-07-10T12:00:00+00:00",
                computed_at="2026-07-10T12:01:00+00:00",
                water_update_id="constraints-missing-base-update",
                request_fingerprint="6" * 64,
            )

    with engine.begin() as connection:
        _insert_water_observation_202607220004(
            connection,
            observation_id="water-valid-chain-row",
            state_id="state-constraints",
            water_sequence=2,
            base_water_observation_id="water-base",
            base_water_sequence=1,
            observed_at="2026-07-10T13:00:00+00:00",
            computed_at="2026-07-10T13:01:00+00:00",
            water_update_id="constraints-valid-chain-update",
            request_fingerprint="7" * 64,
        )

    engine.dispose()


def test_snapshot_lineage_migration_fails_without_same_state_growth(tmp_path) -> None:
    database_url = _database_url(tmp_path, "snapshot-lineage-missing-growth.db")
    config = _config(database_url)
    command.upgrade(config, "202607220004")

    engine = create_database_engine(database_url)
    with engine.begin() as connection:
        _insert_legacy_crop_cycle(connection, state_id="state-missing-growth")
        _insert_legacy_crop_cycle(connection, state_id="state-other")
        _insert_legacy_growth_observation(
            connection,
            observation_id="growth-other-only",
            state_id="state-other",
            observed_at="2026-07-10T08:00:00+00:00",
            computed_at="2026-07-10T08:01:00+00:00",
            current_date="2026-07-10",
        )
        _insert_water_observation_202607220004(
            connection,
            observation_id="water-without-growth",
            state_id="state-missing-growth",
            water_sequence=1,
            base_water_sequence=0,
            observed_at="2026-07-10T08:00:00+00:00",
            computed_at="2026-07-10T08:02:00+00:00",
            water_update_id="missing-growth-water-update",
            request_fingerprint="8" * 64,
        )

    with pytest.raises(RuntimeError, match="no suitable growth observation"):
        command.upgrade(config, "202607230005")

    with engine.connect() as connection:
        same_state_growth_count = connection.execute(
            text(
                """
                SELECT COUNT(*)
                FROM growth_observations
                WHERE state_id = 'state-missing-growth'
                """
            )
        ).scalar_one()
        other_state_growth_count = connection.execute(
            text(
                """
                SELECT COUNT(*)
                FROM growth_observations
                WHERE state_id = 'state-other'
                """
            )
        ).scalar_one()
        growth_columns = _column_names(inspect(engine), "water_observations")
        paired_growth_id = None
        if "growth_observation_id" in growth_columns:
            paired_growth_id = connection.execute(
                text(
                    """
                    SELECT growth_observation_id
                    FROM water_observations
                    WHERE observation_id = 'water-without-growth'
                    """
                )
            ).scalar_one()

    assert same_state_growth_count == 0
    assert other_state_growth_count == 1
    assert paired_growth_id is None
    engine.dispose()


def test_snapshot_lineage_migration_backfills_growth_links_and_fingerprints(
    tmp_path,
) -> None:
    database_url = _database_url(tmp_path, "snapshot-lineage-backfill.db")
    config = _config(database_url)
    command.upgrade(config, "202607220004")

    engine = create_database_engine(database_url)
    with engine.begin() as connection:
        _insert_crop_cycle_and_irrigation_event(connection)
        _insert_disease_observation(connection)
        _insert_water_observation_202607220004(
            connection,
            observation_id="legacy-water-a",
            water_sequence=1,
            observed_at="2026-07-10T00:00:00+00:00",
            computed_at="2026-07-10T00:02:00+00:00",
            water_update_id="legacy-update-a",
        )
        _insert_snapshot_202607220004(
            connection,
            snapshot_id="snapshot-a",
            water_observation_id="legacy-water-a",
        )
        _insert_snapshot_202607220004(
            connection,
            snapshot_id="snapshot-a-duplicate",
            water_observation_id="legacy-water-a",
        )

    command.upgrade(config, "head")

    with engine.connect() as connection:
        water = connection.execute(
            text(
                """
                SELECT observation_id, growth_observation_id
                FROM water_observations
                WHERE observation_id = 'legacy-water-a'
                """
            )
        ).mappings().one()
        snapshots = connection.execute(
            text(
                """
                SELECT snapshot_id, source_fingerprint, water_sequence
                FROM twin_state_snapshots
                ORDER BY snapshot_id
                """
            )
        ).mappings().all()

    assert water["growth_observation_id"] == "growth-migration"
    assert len(snapshots) == 2
    assert all(len(row["source_fingerprint"]) == 64 for row in snapshots)
    assert len({row["source_fingerprint"] for row in snapshots}) == 2
    assert any(
        row["source_fingerprint"].startswith("legacy-")
        for row in snapshots
        if row["snapshot_id"] == "snapshot-a-duplicate"
    )
    assert {row["water_sequence"] for row in snapshots} == {1}

    command.downgrade(config, "202607220004")
    inspector = inspect(engine)
    water_columns = {
        column["name"] for column in inspector.get_columns("water_observations")
    }
    snapshot_columns = {
        column["name"] for column in inspector.get_columns("twin_state_snapshots")
    }
    assert "growth_observation_id" not in water_columns
    assert "source_fingerprint" not in snapshot_columns
    assert "water_sequence" not in snapshot_columns

    command.upgrade(config, "head")
    engine.dispose()


def _column_names(inspector, table_name: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table_name)}


def _insert_legacy_crop_cycle(connection, *, state_id: str) -> None:
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
                :state_id,
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
        ),
        {"state_id": state_id},
    )


def _insert_legacy_irrigation_event(
    connection,
    *,
    state_id: str = "state-migration",
    irrigation_event_id: str = "event-migration",
) -> None:
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
                :irrigation_event_id,
                :state_id,
                '2026-07-09T08:00:00+00:00',
                8.0,
                'MANUAL',
                '2026-07-10T00:00:00+00:00',
                '{}'
            )
            """
        ),
        {
            "irrigation_event_id": irrigation_event_id,
            "state_id": state_id,
        },
    )


def _insert_legacy_growth_observation(
    connection,
    *,
    observation_id: str,
    observed_at: str,
    computed_at: str,
    current_date: str,
    state_id: str = "state-migration",
) -> None:
    connection.execute(
        text(
            """
            INSERT INTO growth_observations (
                observation_id,
                state_id,
                observed_at,
                computed_at,
                observation_time_basis,
                current_date,
                days_since_planting,
                growth_stage,
                stage_progress,
                payload_json
            )
            VALUES (
                :observation_id,
                :state_id,
                :observed_at,
                :computed_at,
                'DATE_ONLY_UTC_START',
                :current_date,
                39,
                'development',
                0.2,
                '{}'
            )
            """
        ),
        {
            "observation_id": observation_id,
            "state_id": state_id,
            "observed_at": observed_at,
            "computed_at": computed_at,
            "current_date": current_date,
        },
    )


def _insert_legacy_disease_observation(
    connection,
    *,
    observation_id: str = "disease-migration",
    state_id: str = "state-migration",
) -> None:
    connection.execute(
        text(
            """
            INSERT INTO disease_observations (
                observation_id,
                state_id,
                observed_at,
                computed_at,
                observation_time_basis,
                predicted_label,
                disease_category,
                confidence_calibrated,
                uncertainty_score,
                uncertainty_band,
                payload_json
            )
            VALUES (
                :observation_id,
                :state_id,
                '2026-07-10T08:00:00+00:00',
                '2026-07-10T08:00:30+00:00',
                'SERVER_RECEIVED',
                'Tomato___healthy',
                'none',
                0.95,
                0.05,
                'low',
                '{}'
            )
            """
        ),
        {
            "observation_id": observation_id,
            "state_id": state_id,
        },
    )


def _insert_water_observation_202607200003(
    connection,
    *,
    observation_id: str,
    observed_at: str,
    computed_at: str,
    water_update_id: str,
    request_fingerprint: str,
    marker: str,
    irrigation_event_id: str | None,
    reported_irrigation_event_id: str | None,
    effective_irrigation_mm: float,
    state_id: str = "state-migration",
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
                :state_id,
                :observed_at,
                :computed_at,
                'DATE_ONLY_UTC_START',
                :water_update_id,
                :request_fingerprint,
                json_object('marker', :marker, 'kind', 'weather'),
                0.0,
                1.0,
                1.0,
                0.0,
                0.0,
                :irrigation_event_id,
                :reported_irrigation_event_id,
                :effective_irrigation_mm,
                json_object('marker', :marker)
            )
            """
        ),
        {
            "observation_id": observation_id,
            "state_id": state_id,
            "observed_at": observed_at,
            "computed_at": computed_at,
            "water_update_id": water_update_id,
            "request_fingerprint": request_fingerprint,
            "marker": marker,
            "irrigation_event_id": irrigation_event_id,
            "reported_irrigation_event_id": reported_irrigation_event_id,
            "effective_irrigation_mm": effective_irrigation_mm,
        },
    )


def _insert_snapshot_202607200003(
    connection,
    *,
    snapshot_id: str,
    growth_observation_id: str,
    water_observation_id: str,
    state_id: str = "state-migration",
) -> None:
    connection.execute(
        text(
            """
            INSERT INTO twin_state_snapshots (
                snapshot_id,
                state_id,
                observed_at,
                computed_at,
                observation_time_basis,
                disease_observation_id,
                growth_observation_id,
                water_observation_id,
                crop_type,
                growth_stage,
                days_since_planting,
                predicted_label,
                disease_category,
                confidence_calibrated,
                uncertainty_score,
                uncertainty_band,
                eto_computed,
                eto_method,
                kc,
                etc,
                taw,
                raw_threshold,
                raw_root_zone_depletion_mm,
                root_zone_depletion_mm,
                water_surplus_mm,
                depletion_beyond_taw_mm,
                estimated_moisture_state,
                stress_band,
                payload_json
            )
            VALUES (
                :snapshot_id,
                :state_id,
                '2026-07-11T08:00:00+00:00',
                '2026-07-11T08:06:00+00:00',
                'DATE_ONLY_UTC_START',
                'disease-migration',
                :growth_observation_id,
                :water_observation_id,
                'tomato',
                'development',
                40,
                'Tomato___healthy',
                'none',
                0.95,
                0.05,
                'low',
                4.0,
                'penman_monteith',
                0.8,
                3.2,
                48.0,
                24.0,
                1.0,
                1.0,
                0.0,
                0.0,
                'adequate',
                'low',
                '{}'
            )
            """
        ),
        {
            "snapshot_id": snapshot_id,
            "state_id": state_id,
            "growth_observation_id": growth_observation_id,
            "water_observation_id": water_observation_id,
        },
    )


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
            INSERT INTO growth_observations (
                observation_id,
                state_id,
                observed_at,
                computed_at,
                observation_time_basis,
                current_date,
                days_since_planting,
                growth_stage,
                stage_progress,
                payload_json
            )
            VALUES (
                'growth-migration',
                'state-migration',
                '2026-07-10T00:00:00+00:00',
                '2026-07-10T00:00:30+00:00',
                'DATE_ONLY_UTC_START',
                '2026-07-10',
                39,
                'development',
                0.2,
                '{}'
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


def _insert_disease_observation(connection) -> None:
    connection.execute(
        text(
            """
            INSERT INTO disease_observations (
                observation_id,
                state_id,
                observed_at,
                computed_at,
                observation_time_basis,
                predicted_label,
                disease_category,
                confidence_calibrated,
                uncertainty_score,
                uncertainty_band,
                payload_json
            )
            VALUES (
                'disease-migration',
                'state-migration',
                '2026-07-10T00:00:00+00:00',
                '2026-07-10T00:00:20+00:00',
                'SERVER_RECEIVED',
                'Tomato___healthy',
                'none',
                0.95,
                0.05,
                'low',
                '{}'
            )
            """
        )
    )


def _insert_water_observation_202607220004(
    connection,
    *,
    observation_id: str,
    water_sequence: int,
    observed_at: str,
    computed_at: str,
    water_update_id: str,
    state_id: str = "state-migration",
    base_water_observation_id: str | None = None,
    base_water_sequence: int = 0,
    request_fingerprint: str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
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
                water_sequence,
                base_water_observation_id,
                base_water_sequence,
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
                :state_id,
                :observed_at,
                :computed_at,
                'DATE_ONLY_UTC_START',
                :water_sequence,
                :base_water_observation_id,
                :base_water_sequence,
                :water_update_id,
                :request_fingerprint,
                '{}',
                0.0,
                1.0,
                1.0,
                0.0,
                0.0,
                NULL,
                NULL,
                0.0,
                '{}'
            )
            """
        ),
        {
            "observation_id": observation_id,
            "state_id": state_id,
            "observed_at": observed_at,
            "computed_at": computed_at,
            "water_sequence": water_sequence,
            "base_water_observation_id": base_water_observation_id,
            "base_water_sequence": base_water_sequence,
            "water_update_id": water_update_id,
            "request_fingerprint": request_fingerprint,
        },
    )


def _insert_snapshot_202607220004(
    connection,
    *,
    snapshot_id: str,
    water_observation_id: str,
) -> None:
    connection.execute(
        text(
            """
            INSERT INTO twin_state_snapshots (
                snapshot_id,
                state_id,
                observed_at,
                computed_at,
                observation_time_basis,
                disease_observation_id,
                growth_observation_id,
                water_observation_id,
                crop_type,
                growth_stage,
                days_since_planting,
                predicted_label,
                disease_category,
                confidence_calibrated,
                uncertainty_score,
                uncertainty_band,
                eto_computed,
                eto_method,
                kc,
                etc,
                taw,
                raw_threshold,
                raw_root_zone_depletion_mm,
                root_zone_depletion_mm,
                water_surplus_mm,
                depletion_beyond_taw_mm,
                estimated_moisture_state,
                stress_band,
                payload_json
            )
            VALUES (
                :snapshot_id,
                'state-migration',
                '2026-07-10T00:00:00+00:00',
                '2026-07-10T00:03:00+00:00',
                'DATE_ONLY_UTC_START',
                'disease-migration',
                'growth-migration',
                :water_observation_id,
                'tomato',
                'development',
                39,
                'Tomato___healthy',
                'none',
                0.95,
                0.05,
                'low',
                4.0,
                'penman_monteith',
                0.8,
                3.2,
                48.0,
                24.0,
                1.0,
                1.0,
                0.0,
                0.0,
                'adequate',
                'low',
                '{}'
            )
            """
        ),
        {
            "snapshot_id": snapshot_id,
            "water_observation_id": water_observation_id,
        },
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
    water_sequence: int = 1,
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
                    growth_observation_id,
                    water_sequence,
                    base_water_sequence,
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
                    'growth-migration',
                    :water_sequence,
                    0,
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
                "water_sequence": water_sequence,
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
