import json
import math

import httpx
import pytest

from app.config import settings
from app.models import EMBEDDING_DIM
from app.services.embeddings import EmbeddingError, OllamaEmbeddings


def make_provider(handler, **kwargs):
    client = httpx.Client(transport=httpx.MockTransport(handler))
    return OllamaEmbeddings("http://ollama.test/", "test-model", client=client, **kwargs)


def ok_handler(request: httpx.Request) -> httpx.Response:
    inputs = json.loads(request.content)["input"]
    return httpx.Response(200, json={"embeddings": [[0.5] * EMBEDDING_DIM for _ in inputs]})


def test_sends_model_and_prefixed_inputs():
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        seen["body"] = json.loads(request.content)
        return ok_handler(request)

    provider = make_provider(handler, document_prefix="doc: ", query_prefix="q: ")
    provider.embed_documents(["hello"])
    assert seen["url"] == "http://ollama.test/api/embed"
    assert seen["body"] == {"model": "test-model", "input": ["doc: hello"]}

    provider.embed_query("what?")
    assert seen["body"]["input"] == ["q: what?"]


def test_large_inputs_are_sent_in_batches():
    batch_sizes = []

    def handler(request):
        batch_sizes.append(len(json.loads(request.content)["input"]))
        return ok_handler(request)

    vectors = make_provider(handler, batch_size=4).embed_documents([f"t{i}" for i in range(10)])
    assert batch_sizes == [4, 4, 2]
    assert len(vectors) == 10


def test_wrong_dimension_is_rejected():
    provider = make_provider(lambda r: httpx.Response(200, json={"embeddings": [[0.1] * 3]}))
    with pytest.raises(EmbeddingError, match="dimensional"):
        provider.embed_documents(["x"])


def test_wrong_number_of_vectors_is_rejected():
    provider = make_provider(lambda r: httpx.Response(200, json={"embeddings": []}))
    with pytest.raises(EmbeddingError):
        provider.embed_documents(["x"])


def test_http_error_becomes_embedding_error():
    provider = make_provider(lambda r: httpx.Response(500, text="boom"))
    with pytest.raises(EmbeddingError, match="unavailable"):
        provider.embed_documents(["x"])


def test_connection_error_becomes_embedding_error():
    def handler(request):
        raise httpx.ConnectError("refused")

    with pytest.raises(EmbeddingError, match="unavailable"):
        make_provider(handler).embed_documents(["x"])


def test_malformed_response_becomes_embedding_error():
    provider = make_provider(lambda r: httpx.Response(200, json={"unexpected": 1}))
    with pytest.raises(EmbeddingError):
        provider.embed_documents(["x"])


# --- Smoke test against a REAL Ollama (skipped when it isn't running) -----------


def _ollama_available() -> bool:
    try:
        tags = httpx.get(f"{settings.ollama_base_url}/api/tags", timeout=1).json()
        return any(m["name"].startswith(settings.embedding_model) for m in tags["models"])
    except Exception:
        return False


def _cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    return dot / (math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b)))


@pytest.mark.skipif(not _ollama_available(), reason="Ollama / embedding model not available")
def test_real_ollama_ranks_related_text_higher():
    provider = OllamaEmbeddings(
        settings.ollama_base_url,
        settings.embedding_model,
        document_prefix=settings.embedding_document_prefix,
        query_prefix=settings.embedding_query_prefix,
    )
    related, unrelated = provider.embed_documents(
        [
            "The Single Responsibility Principle says a class should have one reason to change.",
            "Bake the bread at 220 degrees for thirty minutes until golden.",
        ]
    )
    query = provider.embed_query("What does the single responsibility principle mean?")
    assert len(query) == EMBEDDING_DIM
    assert _cosine(query, related) > _cosine(query, unrelated)
