from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = BACKEND_DIR.parent


def load_project_dotenv() -> None:
    """Load local dotenv files without overriding real runtime environment."""
    for dotenv_path in (REPOSITORY_ROOT / ".env", BACKEND_DIR / ".env"):
        if dotenv_path.exists():
            load_dotenv(dotenv_path=dotenv_path, override=False)
