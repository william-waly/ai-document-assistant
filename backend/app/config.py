from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All configuration comes from environment variables (never hardcoded)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    cors_origins: str = "http://localhost:5173"

    # Auth. The app refuses to start without a long secret.
    jwt_secret: str = Field(min_length=32)
    access_token_expire_minutes: int = 60

    # Rate limiting (see app/rate_limit.py)
    rate_limit_enabled: bool = True
    auth_rate_limit: str = "5/minute"

    # Document uploads
    max_upload_mb: int = 20
    max_pdf_pages: int = 500
    upload_rate_limit: str = "10/minute"

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()  # type: ignore[call-arg]
