from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All configuration comes from environment variables (never hardcoded)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()  # type: ignore[call-arg]
