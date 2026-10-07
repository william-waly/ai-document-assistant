import json

import httpx
import pytest
from pydantic import ValidationError

from app.config import Settings
from app.services.llm import LLMError, OllamaChat, OpenAICompatibleChat

MESSAGES = [{"role": "system", "content": "sys"}, {"role": "user", "content": "hi"}]


def ollama(handler):
    client = httpx.Client(transport=httpx.MockTransport(handler))
    return OllamaChat("http://ollama.test/", "gemma3:4b", 0.1, 8192, 30, client=client)


def external(handler):
    client = httpx.Client(transport=httpx.MockTransport(handler))
    return OpenAICompatibleChat("https://api.test/v1/", "sk-secret", "big-model", 0.2, 30, client=client)


def test_ollama_sends_chat_request_and_returns_content():
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"message": {"role": "assistant", "content": "  Hello!  "}})

    assert ollama(handler).generate(MESSAGES) == "Hello!"
    assert seen["url"] == "http://ollama.test/api/chat"
    assert seen["body"]["model"] == "gemma3:4b"
    assert seen["body"]["messages"] == MESSAGES
    assert seen["body"]["stream"] is False
    assert seen["body"]["options"] == {"temperature": 0.1, "num_ctx": 8192}


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(500, text="boom"),
        httpx.Response(200, json={"unexpected": True}),
        httpx.Response(200, json={"message": {"content": "   "}}),
        httpx.Response(200, text="not json"),
    ],
)
def test_ollama_failures_become_llm_error(response):
    with pytest.raises(LLMError):
        ollama(lambda r: response).generate(MESSAGES)


def test_ollama_connection_error_becomes_llm_error():
    def handler(request):
        raise httpx.ConnectError("refused")

    with pytest.raises(LLMError, match="unavailable"):
        ollama(handler).generate(MESSAGES)


def test_external_provider_sends_bearer_key_and_parses_choices():
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        seen["auth"] = request.headers["authorization"]
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": "External hi"}}]})

    assert external(handler).generate(MESSAGES) == "External hi"
    assert seen["url"] == "https://api.test/v1/chat/completions"
    assert seen["auth"] == "Bearer sk-secret"
    assert seen["body"]["model"] == "big-model"


def test_external_provider_errors_do_not_leak_the_api_key():
    with pytest.raises(LLMError) as exc:
        external(lambda r: httpx.Response(401, text="bad key")).generate(MESSAGES)
    assert "sk-secret" not in str(exc.value)


# --- privacy gate: external LLM must be an explicit opt-in -----------------------------

BASE = {"database_url": "postgresql+psycopg://x:x@h/x", "jwt_secret": "s" * 32}


def test_external_llm_is_refused_without_opt_in():
    with pytest.raises(ValidationError, match="ALLOW_EXTERNAL_LLM"):
        Settings(_env_file=None, llm_provider="openai_compatible", **BASE)


def test_external_llm_needs_url_and_key_even_when_allowed():
    with pytest.raises(ValidationError, match="LLM_BASE_URL"):
        Settings(_env_file=None, llm_provider="openai_compatible", allow_external_llm=True, **BASE)


def test_external_llm_is_accepted_when_fully_configured():
    s = Settings(
        _env_file=None, llm_provider="openai_compatible", allow_external_llm=True,
        llm_base_url="https://api.test/v1", llm_api_key="sk-secret", **BASE,
    )
    assert s.llm_api_key.get_secret_value() == "sk-secret"
    assert "sk-secret" not in repr(s)  # SecretStr hides it in logs


def test_local_ollama_is_the_default_and_needs_no_opt_in():
    s = Settings(_env_file=None, **BASE)
    assert s.llm_provider == "ollama" and s.allow_external_llm is False
