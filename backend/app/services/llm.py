"""Chat models behind one small interface.

PRIVACY: the messages passed to `generate` contain the user's question AND the
document excerpts retrieved for it. With the default provider (local Ollama)
that stays on this machine. An external provider is refused at startup unless
ALLOW_EXTERNAL_LLM=true (see config.py).
"""
from functools import lru_cache
from typing import Protocol

import httpx

from app.config import settings

Messages = list[dict[str, str]]  # [{"role": "system"|"user"|"assistant", "content": ...}]


class LLMError(Exception):
    """The language model failed. The message is safe to show to the user."""


class LLMProvider(Protocol):
    def generate(self, messages: Messages) -> str: ...


_UNAVAILABLE = "The language model is unavailable"


class OllamaChat:
    def __init__(
        self,
        base_url: str,
        model: str,
        temperature: float,
        context_tokens: int,
        timeout: float,
        client: httpx.Client | None = None,
    ):
        self._url = f"{base_url.rstrip('/')}/api/chat"
        self._model = model
        self._options = {"temperature": temperature, "num_ctx": context_tokens}
        self._client = client or httpx.Client(timeout=timeout)

    def generate(self, messages: Messages) -> str:
        payload = {"model": self._model, "messages": messages, "stream": False, "options": self._options}
        try:
            response = self._client.post(self._url, json=payload)
            response.raise_for_status()
            content = response.json()["message"]["content"]
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            raise LLMError(_UNAVAILABLE) from exc
        if not content.strip():
            raise LLMError("The language model returned an empty answer")
        return content.strip()


class OpenAICompatibleChat:
    """Any service speaking the OpenAI chat-completions protocol."""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str,
        temperature: float,
        timeout: float,
        client: httpx.Client | None = None,
    ):
        self._url = f"{base_url.rstrip('/')}/chat/completions"
        self._headers = {"Authorization": f"Bearer {api_key}"}
        self._model = model
        self._temperature = temperature
        self._client = client or httpx.Client(timeout=timeout)

    def generate(self, messages: Messages) -> str:
        payload = {"model": self._model, "messages": messages, "temperature": self._temperature}
        try:
            response = self._client.post(self._url, json=payload, headers=self._headers)
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as exc:
            raise LLMError(_UNAVAILABLE) from exc
        if not content or not content.strip():
            raise LLMError("The language model returned an empty answer")
        return content.strip()


@lru_cache
def get_llm_provider() -> LLMProvider:
    """FastAPI dependency. Tests replace it with a fake."""
    if settings.llm_provider == "ollama":
        return OllamaChat(
            settings.ollama_base_url,
            settings.llm_model,
            settings.llm_temperature,
            settings.llm_context_tokens,
            settings.llm_timeout_seconds,
        )
    if settings.llm_provider == "openai_compatible":
        if not settings.llm_base_url or settings.llm_api_key is None:
            raise ValueError("An external LLM needs LLM_BASE_URL and LLM_API_KEY")
        return OpenAICompatibleChat(
            settings.llm_base_url,
            settings.llm_api_key.get_secret_value(),
            settings.llm_model,
            settings.llm_temperature,
            settings.llm_timeout_seconds,
        )
    raise ValueError(f"Unsupported LLM_PROVIDER: {settings.llm_provider}")
