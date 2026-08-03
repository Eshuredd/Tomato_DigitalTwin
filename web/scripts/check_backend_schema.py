#!/usr/bin/env python3
"""Compare the checked-in OpenAPI snapshot with the live FastAPI application."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Any


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SNAPSHOT = REPOSITORY_ROOT / "web" / "src" / "lib" / "api" / "openapi.json"


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError(f"OpenAPI schema at {path} must be a JSON object.")
    return payload


def load_fastapi_schema() -> dict[str, Any]:
    backend_path = REPOSITORY_ROOT / "backend"
    sys.path.insert(0, str(backend_path))
    try:
        from app.main import app
    finally:
        sys.path.pop(0)
    return app.openapi()


def assert_schemas_match(actual: dict[str, Any], snapshot: dict[str, Any]) -> None:
    if actual != snapshot:
        actual_paths = set(actual.get("paths", {}))
        snapshot_paths = set(snapshot.get("paths", {}))
        added = sorted(actual_paths - snapshot_paths)
        removed = sorted(snapshot_paths - actual_paths)
        context = []
        if added:
            context.append(f"backend-only paths: {', '.join(added)}")
        if removed:
            context.append(f"snapshot-only paths: {', '.join(removed)}")
        suffix = f" ({'; '.join(context)})" if context else ""
        raise AssertionError(
            "Checked-in OpenAPI snapshot differs semantically from app.main.app.openapi()"
            f"{suffix}. Run npm run api:schema:pull intentionally, then regenerate types."
        )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--schema-path", type=Path, default=DEFAULT_SNAPSHOT)
    args = parser.parse_args()
    try:
        assert_schemas_match(load_fastapi_schema(), load_json(args.schema_path.resolve()))
    except (AssertionError, OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"OpenAPI backend-schema check failed: {exc}", file=sys.stderr)
        return 1
    print("Checked-in OpenAPI snapshot semantically matches the FastAPI application.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
