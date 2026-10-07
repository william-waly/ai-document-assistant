"""Test doubles. Tests never talk to a real embedding service."""
import hashlib
import math
import re

from app.models import EMBEDDING_DIM
from app.services.embeddings import EmbeddingError


def _vector(text: str) -> list[float]:
    """Bag-of-words hashing: texts that share words get similar vectors, which
    makes semantic-search tests meaningful without a real model."""
    vec = [0.0] * EMBEDDING_DIM
    for word in re.findall(r"\w+", text.lower()):
        index = int.from_bytes(hashlib.sha256(word.encode()).digest()[:4], "big") % EMBEDDING_DIM
        vec[index] += 1.0
    norm = math.sqrt(sum(v * v for v in vec))
    if norm == 0:
        vec[0], norm = 1.0, 1.0
    return [v / norm for v in vec]


class FakeEmbedder:
    def __init__(self):
        self.document_calls: list[list[str]] = []

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        self.document_calls.append(list(texts))
        return [_vector(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return _vector(text)


class FailingEmbedder:
    def embed_documents(self, texts):
        raise EmbeddingError("The embedding service is unavailable")

    def embed_query(self, text):
        raise EmbeddingError("The embedding service is unavailable")
