from __future__ import annotations

import configparser
import os
from pathlib import Path
import subprocess

from app.persistence.config import (
    DEFAULT_DATABASE_URL,
    get_persistence_settings,
    persistence_startup_summary,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
SUPERVISOR_CONF = REPO_ROOT / "docker" / "supervisord.conf"
DOCKERFILE = REPO_ROOT / "Dockerfile"
ALEMBIC_ENV = REPO_ROOT / "backend" / "alembic" / "env.py"
ALEMBIC_INITIAL_REVISION = (
    REPO_ROOT
    / "backend"
    / "alembic"
    / "versions"
    / "202607160001_initial_persistence.py"
)
COMPOSE_FILE = REPO_ROOT / "docker-compose.yml"
COMPOSE_POSTGRES_FILE = REPO_ROOT / "docker-compose.postgres.yml"
README = REPO_ROOT / "README.md"
FRONTEND_README = REPO_ROOT / "frontend" / "README.md"
GITIGNORE = REPO_ROOT / ".gitignore"


def _supervisor_config() -> configparser.ConfigParser:
    parser = configparser.ConfigParser(interpolation=None)
    parser.read(SUPERVISOR_CONF)
    return parser


def test_backend_supervisor_does_not_override_database_environment() -> None:
    backend = _supervisor_config()["program:backend"]
    environment = backend.get("environment", "")

    assert "CROPTWIN_DATABASE_URL" not in environment
    assert "CROPTWIN_STATE_STORE" not in environment
    assert "CROPTWIN_AUTO_CREATE_DB" not in environment


def test_supervisor_public_and_internal_ports_are_correct() -> None:
    config = _supervisor_config()
    backend_command = config["program:backend"]["command"]
    frontend_command = config["program:frontend"]["command"]

    assert "uvicorn app.main:app" in backend_command
    assert "--host 127.0.0.1" in backend_command
    assert "--port 8000" in backend_command
    assert "--host 0.0.0.0" not in backend_command

    assert frontend_command.startswith('/bin/sh -c "exec streamlit run')
    assert "--server.address 0.0.0.0" in frontend_command
    assert "--server.port ${PORT:-7860}" in frontend_command
    assert "--server.headless true" in frontend_command


def test_streamlit_shell_port_expression_expands_runtime_port() -> None:
    base_env = {
        key: value
        for key, value in os.environ.items()
        if key != "PORT"
    }

    fallback = subprocess.run(
        ["/bin/sh", "-c", 'printf "%s" "${PORT:-7860}"'],
        check=True,
        capture_output=True,
        text=True,
        env=base_env,
    )
    override = subprocess.run(
        ["/bin/sh", "-c", 'printf "%s" "${PORT:-7860}"'],
        check=True,
        capture_output=True,
        text=True,
        env={**base_env, "PORT": "10000"},
    )

    assert fallback.stdout == "7860"
    assert override.stdout == "10000"


def test_docker_healthcheck_uses_public_streamlit_runtime_port() -> None:
    dockerfile = DOCKERFILE.read_text(encoding="utf-8")

    assert "HEALTHCHECK" in dockerfile
    assert '${PORT:-7860}' in dockerfile
    assert "/_stcore/health" in dockerfile
    assert "127.0.0.1:8000/health" not in dockerfile


def test_persistence_settings_respect_runtime_environment(monkeypatch) -> None:
    monkeypatch.setenv(
        "CROPTWIN_DATABASE_URL",
        "postgresql+psycopg://fake_user:fake_password@db.internal:5432/croptwin",
    )
    monkeypatch.setenv("CROPTWIN_STATE_STORE", "memory")
    monkeypatch.setenv("CROPTWIN_AUTO_CREATE_DB", "false")

    settings = get_persistence_settings()

    assert settings.database_url.startswith("postgresql+psycopg://")
    assert settings.normalized_state_store == "memory"
    assert settings.auto_create_db is False


def test_persistence_settings_local_defaults(monkeypatch) -> None:
    monkeypatch.delenv("CROPTWIN_DATABASE_URL", raising=False)
    monkeypatch.delenv("CROPTWIN_STATE_STORE", raising=False)
    monkeypatch.delenv("CROPTWIN_AUTO_CREATE_DB", raising=False)

    settings = get_persistence_settings()

    assert settings.database_url == DEFAULT_DATABASE_URL
    assert settings.normalized_state_store == "sqlalchemy"
    assert settings.auto_create_db is True


def test_safe_startup_summary_redacts_database_credentials(monkeypatch) -> None:
    monkeypatch.setenv(
        "CROPTWIN_DATABASE_URL",
        "postgresql+psycopg://fake_user:fake_password@db.internal:5432/croptwin",
    )
    monkeypatch.setenv("CROPTWIN_STATE_STORE", "sqlalchemy")
    monkeypatch.setenv("CROPTWIN_AUTO_CREATE_DB", "false")

    summary = persistence_startup_summary(get_persistence_settings())

    assert summary == (
        "CropTwin persistence: "
        "store=sqlalchemy dialect=postgresql auto_create=false"
    )
    assert "fake_user" not in summary
    assert "fake_password" not in summary
    assert "db.internal" not in summary
    assert "croptwin" not in summary
    assert "postgresql+psycopg://" not in summary


def test_alembic_env_uses_runtime_database_url_setting() -> None:
    source = ALEMBIC_ENV.read_text(encoding="utf-8")

    assert "get_persistence_settings" in source
    assert 'config.attributes.get("database_url")' in source
    assert 'config.set_main_option("sqlalchemy.url", database_url)' in source
    assert "url=database_url" in source


def test_initial_alembic_migration_contains_explicit_schema_operations() -> None:
    source = ALEMBIC_INITIAL_REVISION.read_text(encoding="utf-8")

    assert "Base.metadata.create_all" not in source
    assert "Base.metadata.drop_all" not in source
    assert "op.create_table" in source
    assert "op.create_index" in source
    assert "op.drop_table" in source
    for table_name in (
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
    ):
        assert f'"{table_name}"' in source
    assert '"ix_crop_cycles_plot_id"' in source


def test_committed_compose_file_does_not_contain_postgres_password_value() -> None:
    committed_config = "\n".join(
        [
            COMPOSE_FILE.read_text(encoding="utf-8"),
            COMPOSE_POSTGRES_FILE.read_text(encoding="utf-8"),
        ]
    )

    assert "croptwin_dev_password" not in committed_config
    assert "POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:" in committed_config


def test_base_compose_is_sqlite_only_by_default() -> None:
    compose = COMPOSE_FILE.read_text(encoding="utf-8")

    assert "croptwin:" in compose
    assert "postgres:" not in compose
    assert "migrate:" not in compose
    assert "CROPTWIN_DATABASE_URL: sqlite+pysqlite:////workspace/data/croptwin.db" in compose
    assert "CROPTWIN_AUTO_CREATE_DB: \"true\"" in compose
    assert "CROPTWIN_STATE_STORE: sqlalchemy" in compose
    assert "- croptwin_sqlite_data:/workspace/data" in compose
    assert '"7860:7860"' in compose


def test_postgres_compose_override_sets_database_and_startup_order() -> None:
    override = COMPOSE_POSTGRES_FILE.read_text(encoding="utf-8")

    assert "postgres:" in override
    assert "image: postgres:16-alpine" in override
    assert "POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:" in override
    assert "pg_isready -U croptwin -d croptwin" in override
    assert "migrate:" in override
    assert "alembic upgrade head" in override
    assert "postgresql+psycopg://croptwin:${POSTGRES_PASSWORD:" in override
    assert "CROPTWIN_AUTO_CREATE_DB: \"false\"" in override
    assert "postgres:\n        condition: service_healthy" in override
    assert "migrate:\n        condition: service_completed_successfully" in override
    assert "volumes: !reset []" in override
    assert "croptwin_sqlite_data: !reset null" in override
    assert "croptwin_postgres_data:/var/lib/postgresql/data" in override
    assert "5432:5432" not in override


def test_env_example_is_allowed_without_allowing_secret_env_files() -> None:
    gitignore = GITIGNORE.read_text(encoding="utf-8")

    assert ".env" in gitignore
    assert ".env.*" in gitignore
    assert "!.env.example" in gitignore
    assert "!.env.compose.example" in gitignore


def _powershell_blocks(markdown: str) -> list[str]:
    blocks: list[str] = []
    lines = markdown.splitlines()
    in_block = False
    current: list[str] = []
    for line in lines:
        if line.strip().startswith("```powershell"):
            in_block = True
            current = []
            continue
        if in_block and line.strip() == "```":
            blocks.append("\n".join(current))
            in_block = False
            continue
        if in_block:
            current.append(line)
    return blocks


def test_powershell_docs_do_not_use_bash_environment_assignment() -> None:
    for path in (README, FRONTEND_README):
        for block in _powershell_blocks(path.read_text(encoding="utf-8")):
            assert "PYTHONPATH=backend python" not in block
            if "PYTHONPATH" in block:
                assert "$env:PYTHONPATH" in block
            if "CROPTWIN_API_BASE_URL" in block:
                assert "$env:CROPTWIN_API_BASE_URL" in block


def test_powershell_one_line_environment_commands_use_semicolon() -> None:
    for path in (README, FRONTEND_README):
        for block in _powershell_blocks(path.read_text(encoding="utf-8")):
            for line in block.splitlines():
                if "$env:" not in line:
                    continue
                has_inline_command = any(
                    token in line
                    for token in (
                        " docker ",
                        " python ",
                        " streamlit ",
                    )
                )
                if has_inline_command:
                    assert ";" in line


def test_frontend_readme_has_valid_api_base_url_override() -> None:
    frontend_readme = FRONTEND_README.read_text(encoding="utf-8")

    assert (
        '$env:CROPTWIN_API_BASE_URL = "http://127.0.0.1:8000"; '
        "streamlit run frontend/app.py"
    ) in frontend_readme
