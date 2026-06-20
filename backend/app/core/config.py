from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = Field(default="development", alias="APP_ENV")
    app_base_url: str = Field(default="http://localhost:5173", alias="APP_BASE_URL")
    api_base_url: str = Field(default="http://localhost:8000", alias="API_BASE_URL")
    database_url: str = Field(
        default="postgresql+psycopg://running_planner:running_planner@localhost:5432/running_planner",
        alias="DATABASE_URL",
    )
    session_secret: str = Field(default="dev-session-secret-change-me", alias="SESSION_SECRET")
    app_username: str = Field(default="michael", alias="APP_USERNAME")
    app_password: str = Field(default="", alias="APP_PASSWORD")
    session_cookie_secure: bool = Field(default=False, alias="SESSION_COOKIE_SECURE")
    session_ttl_seconds: int = Field(default=60 * 60 * 24 * 14, alias="SESSION_TTL_SECONDS")
    token_encryption_key: str = Field(
        default="dev-token-key-change-me",
        alias="TOKEN_ENCRYPTION_KEY",
    )

    strava_client_id: str = Field(default="", alias="STRAVA_CLIENT_ID")
    strava_client_secret: str = Field(default="", alias="STRAVA_CLIENT_SECRET")
    strava_redirect_uri: str = Field(
        default="http://localhost:8000/api/auth/strava/callback",
        alias="STRAVA_REDIRECT_URI",
    )

    ai_provider: str = Field(default="stub", alias="AI_PROVIDER")
    ai_api_key: str = Field(default="", alias="AI_API_KEY")

    frontend_min_version: str = Field(default="0.1.0", alias="FRONTEND_MIN_VERSION")
    backend_version: str = Field(default="0.1.0", alias="BACKEND_VERSION")
    schema_version: str = Field(default="2026_06_17_001", alias="SCHEMA_VERSION")
    force_reload: bool = Field(default=False, alias="FORCE_RELOAD")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    cors_origins_raw: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173",
        alias="CORS_ORIGINS",
    )

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins_raw.split(",") if origin.strip()]

    @property
    def sqlite_path(self) -> Path | None:
        prefix = "sqlite:///"
        if not self.database_url.startswith(prefix):
            return None
        return Path(self.database_url.removeprefix(prefix))

    @property
    def sqlalchemy_database_url(self) -> str:
        if self.database_url.startswith("postgres://"):
            return self.database_url.replace("postgres://", "postgresql+psycopg://", 1)
        if self.database_url.startswith("postgresql://"):
            return self.database_url.replace("postgresql://", "postgresql+psycopg://", 1)
        return self.database_url


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
