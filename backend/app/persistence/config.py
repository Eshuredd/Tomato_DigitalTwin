from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url

from app.env import load_project_dotenv


load_project_dotenv()


DEFAULT_DATABASE_URL = "sqlite+pysqlite:///./data/croptwin.db"


class PersistenceSettings(BaseSettings):
    database_url: str = Field(
        default=DEFAULT_DATABASE_URL,
        validation_alias="CROPTWIN_DATABASE_URL",
    )
    state_store: str = Field(
        default="sqlalchemy",
        validation_alias="CROPTWIN_STATE_STORE",
    )
    auto_create_db: bool = Field(
        default=True,
        validation_alias="CROPTWIN_AUTO_CREATE_DB",
    )

    model_config = SettingsConfigDict(extra="ignore")

    @property
    def normalized_state_store(self) -> str:
        value = self.state_store.strip().lower()
        if value not in {"sqlalchemy", "memory"}:
            raise ValueError("CROPTWIN_STATE_STORE must be 'sqlalchemy' or 'memory'.")
        return value


def get_persistence_settings() -> PersistenceSettings:
    return PersistenceSettings()


def database_dialect(database_url: str) -> str:
    return make_url(database_url).get_backend_name()


def persistence_startup_summary(settings: PersistenceSettings) -> str:
    auto_create = str(settings.auto_create_db).lower()
    return (
        "CropTwin persistence: "
        f"store={settings.normalized_state_store} "
        f"dialect={database_dialect(settings.database_url)} "
        f"auto_create={auto_create}"
    )


def ensure_sqlite_parent_directory(database_url: str) -> None:
    url = make_url(database_url)
    if not url.drivername.startswith("sqlite"):
        return
    if url.database in {None, "", ":memory:"}:
        return

    database_path = Path(url.database)
    database_path.parent.mkdir(parents=True, exist_ok=True)
