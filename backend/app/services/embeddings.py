"""Turns text into vectors. The rest of the app only knows `EmbeddingProvider`.

PRIVACY: whatever text is passed to `embed_documents` / `embed_query` is sent to
the configured provider. With the default (local Ollama) it never leaves your
machine. To use an external API, add another class implementing the same
protocol and select it in `get_embedding_provider()`; nothing else changes.
"""
from functools import lru_cache
from typing import Protocol

import httpx

from app.config import settings
from app.models import EMBEDDING_DIM


class EmbeddingError(Exception):
    """The embedding service failed. The message is safe to show to the user."""


class EmbeddingProvider(Protocol):
    def embed_documents(self, texts: list[str]) -> list[list[float]]: ...

    def embed_query(self, text: str) -> list[float]: ...


class OllamaEmbeddings:
    def __init__(
        self,
        base_url: str,
        model: str,
        batch_size: int = 32,
        document_prefix: str = "",
        query_prefix: str = "",
        timeout: float = 120,
        client: httpx.Client | None = None,
    ):
        self._url = f"{base_url.rstrip('/')}/api/embed"
        self._model = model
        self._batch_size = batch_size
        self._document_prefix = document_prefix
        self._query_prefix = query_prefix
        self._client = client or httpx.Client(timeout=timeout)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for start in range(0, len(texts), self._batch_size):
            batch = texts[start : start + self._batch_size]
            vectors.extend(self._embed([self._document_prefix + t for t in batch]))
        return vectors

    def embed_query(self, text: str) -> list[float]:
        return self._embed([self._query_prefix + text])[0]

    def _embed(self, inputs: list[str]) -> list[list[float]]:
        try:
            response = self._client.post(self._url, json={"model": self._model, "input": inputs})
            response.raise_for_status()
            vectors = response.json()["embeddings"]
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            raise EmbeddingError("The embedding service is unavailable") from exc
        if len(vectors) != len(inputs) or any(len(v) != EMBEDDING_DIM for v in vectors):
            raise EmbeddingError(
                f"The embedding model must return {EMBEDDING_DIM}-dimensional vectors"
            )
        return vectors


@lru_cache
def get_embedding_provider() -> EmbeddingProvider:
    """FastAPI dependency. Tests replace it with a fake."""
    if settings.embedding_provider == "ollama":
        return OllamaEmbeddings(
            base_url=settings.ollama_base_url,
            model=settings.embedding_model,
            batch_size=settings.embedding_batch_size,
            document_prefix=settings.embedding_document_prefix,
            query_prefix=settings.embedding_query_prefix,
            timeout=settings.embedding_timeout_seconds,
        )
    raise ValueError(f"Unsupported EMBEDDING_PROVIDER: {settings.embedding_provider}")
