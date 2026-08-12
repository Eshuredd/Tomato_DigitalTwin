#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path
import sys

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
SNAPSHOT = REPOSITORY_ROOT / 'mobile' / 'src' / 'lib' / 'api' / 'openapi.json'

def main() -> int:
    with SNAPSHOT.open(encoding='utf-8') as handle:
        snapshot = json.load(handle)
    sys.path.insert(0, str(REPOSITORY_ROOT / 'backend'))
    try:
        from app.main import app
        actual = app.openapi()
    finally:
        sys.path.pop(0)
    if actual != snapshot:
        print('Mobile OpenAPI snapshot differs semantically from app.main.app.openapi(). Run api:schema:pull intentionally, then api:generate.', file=sys.stderr)
        return 1
    print('Mobile OpenAPI snapshot semantically matches the FastAPI application.')
    return 0

if __name__ == '__main__': raise SystemExit(main())
