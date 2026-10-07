from pydantic import Field, SecretStr, model_validator
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

    # Chunking (characters, not tokens: simple and predictable)
    chunk_size: int = 1000
    chunk_overlap: int = 150

    # Embeddings. Document text is sent ONLY to this URL. Default = local Ollama.
    embedding_provider: str = "ollama"
    ollama_base_url: str = "http://localhost:11434"
    embedding_model: str = "nomic-embed-text"
    embedding_batch_size: int = 32
    embedding_timeout_seconds: float = 120
    # nomic-embed-text is trained with task prefixes; they improve retrieval quality.
    embedding_document_prefix: str = "search_document: "
    embedding_query_prefix: str = "search_query: "

    # Search
    search_rate_limit: str = "30/minute"
    search_default_limit: int = 5

    # LLM. Default = local Ollama: document excerpts never leave this machine.
    llm_provider: str = "ollama"  # "ollama" | "openai_compatible"
    llm_model: str = "gemma3:4b"
    llm_temperature: float = 0.1
    llm_context_tokens: int = 8192
    llm_timeout_seconds: float = 180
    llm_rate_limit: str = "10/minute"
    # Only used by an external ("openai_compatible") provider:
    llm_base_url: str | None = None
    llm_api_key: SecretStr | None = None
    # Safety switch: sending document excerpts to a third party must be opted into.
    allow_external_llm: bool = False

    # RAG. Measured with nomic-embed-text: relevant questions score 0.64-0.88,
    # unrelated ones 0.48-0.60. Below this, we answer "not enough information"
    # WITHOUT calling the LLM at all.
    rag_top_k: int = 5
    rag_min_score: float = 0.60

    @model_validator(mode="after")
    def _external_llm_needs_opt_in(self):
        if self.llm_provider != "ollama":
            if not self.allow_external_llm:
                raise ValueError(
                    "LLM_PROVIDER is external, which would send document excerpts to a "
                    "third party. Set ALLOW_EXTERNAL_LLM=true to confirm."
                )
            if not self.llm_base_url or self.llm_api_key is None:
                raise ValueError("An external LLM needs LLM_BASE_URL and LLM_API_KEY")
        return self

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()  # type: ignore[call-arg]
