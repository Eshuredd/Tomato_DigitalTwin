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
        "app.store.errors",
        "app.store.identity",
        "app.store.in_memory",
        "app.store.types",
        "app.persistence.store.sqlalchemy_impl",
        "frontend.workflow_state",
        "frontend.views.app_main",
        "frontend.views.style",
    ]

    for module_name in modules:
        importlib.import_module(module_name)
