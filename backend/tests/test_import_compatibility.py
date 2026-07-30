from __future__ import annotations

import importlib


def test_public_imports_remain_available() -> None:
    modules = [
        "app.main",
        "app.state_store",
        "app.persistence.sqlalchemy_store",
        "frontend.app",
        "frontend.api_client",
        "frontend.ui_helpers",
    ]

    for module_name in modules:
        importlib.import_module(module_name)


def test_refactored_module_imports_are_safe() -> None:
    modules = [
        "app.store",
        "app.store.errors",
        "app.store.identity",
        "app.store.in_memory",
        "app.store.in_memory_advancement",
        "app.store.in_memory_decisions",
        "app.store.in_memory_observations",
        "app.store.in_memory_records",
        "app.store.in_memory_sessions",
        "app.store.in_memory_snapshots",
        "app.store.in_memory_state",
        "app.store.in_memory_water",
        "app.store.types",
        "app.persistence.store",
        "app.persistence.store.advancement",
        "app.persistence.store.common",
        "app.persistence.store.decisions",
        "app.persistence.store.observations",
        "app.persistence.store.records",
        "app.persistence.store.sessions",
        "app.persistence.store.snapshots",
        "app.persistence.store.sqlalchemy_impl",
        "app.persistence.store.water",
        "frontend.workflow_state",
        "frontend.views.app_main",
        "frontend.views.style",
    ]

    for module_name in modules:
        importlib.import_module(module_name)


def test_compatibility_facades_reexport_identical_objects() -> None:
    from app.persistence.sqlalchemy_store import (
        SQLAlchemyTwinStateStore as OldSQLAlchemyTwinStateStore,
    )
    from app.persistence.store import (
        SQLAlchemyTwinStateStore as PackageSQLAlchemyTwinStateStore,
    )
    from app.persistence.store.sqlalchemy_impl import (
        SQLAlchemyTwinStateStore as NewSQLAlchemyTwinStateStore,
    )
    from app.state_store import (
        DailyAdvancementDateConflictError as OldDailyAdvancementDateConflictError,
    )
    from app.state_store import InMemoryTwinStateStore as OldInMemoryTwinStateStore
    from app.state_store import StateNotFoundError as OldStateNotFoundError
    from app.state_store import WaterBaseline as OldWaterBaseline
    from app.state_store import (
        snapshot_source_fingerprint as old_snapshot_source_fingerprint,
    )
    from app.store import InMemoryTwinStateStore as PackageInMemoryTwinStateStore
    from app.store.errors import (
        DailyAdvancementDateConflictError as NewDailyAdvancementDateConflictError,
    )
    from app.store.errors import StateNotFoundError as NewStateNotFoundError
    from app.store.identity import (
        snapshot_source_fingerprint as new_snapshot_source_fingerprint,
    )
    from app.store.in_memory import InMemoryTwinStateStore as NewInMemoryTwinStateStore
    from app.store.types import WaterBaseline as NewWaterBaseline

    assert OldInMemoryTwinStateStore is NewInMemoryTwinStateStore
    assert OldInMemoryTwinStateStore is PackageInMemoryTwinStateStore
    assert OldSQLAlchemyTwinStateStore is NewSQLAlchemyTwinStateStore
    assert OldSQLAlchemyTwinStateStore is PackageSQLAlchemyTwinStateStore
    assert OldStateNotFoundError is NewStateNotFoundError
    assert OldDailyAdvancementDateConflictError is (
        NewDailyAdvancementDateConflictError
    )
    assert OldWaterBaseline is NewWaterBaseline
    assert old_snapshot_source_fingerprint is new_snapshot_source_fingerprint


def test_facades_do_not_export_private_helpers() -> None:
    import app.state_store as state_store
    import app.store as store

    assert "_validate_water_update_id" not in state_store.__all__
    assert "_validate_water_update_id" not in store.__all__
