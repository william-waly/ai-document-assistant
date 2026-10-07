"""Upload -> chunks + embeddings in the database, and their deletion."""
from sqlalchemy import func, select

from app.main import app
from app.models import EMBEDDING_DIM, Document, DocumentChunk
from app.services.embeddings import get_embedding_provider
from tests.conftest import register_and_login
from tests.fakes import FailingEmbedder
from tests.pdf_factory import make_pdf
from tests.test_documents import upload


def _chunk_count(db, **filters):
    stmt = select(func.count()).select_from(DocumentChunk)
    for column, value in filters.items():
        stmt = stmt.where(getattr(DocumentChunk, column) == value)
    return db.scalar(stmt)


def test_upload_stores_chunks_with_embeddings(client, auth_headers, db):
    pdf = make_pdf(["Cats purr when they are content.", "Dogs bark at strangers."])
    doc_id = upload(client, auth_headers, content=pdf).json()["id"]
    user_id = client.get("/users/me", headers=auth_headers).json()["id"]

    chunks = db.scalars(
        select(DocumentChunk).where(DocumentChunk.document_id == doc_id).order_by(DocumentChunk.chunk_index)
    ).all()

    assert [c.page_number for c in chunks] == [1, 2]
    assert [c.chunk_index for c in chunks] == [0, 1]
    assert "Cats purr" in chunks[0].content and "Dogs bark" in chunks[1].content
    assert all(str(c.user_id) == user_id for c in chunks)
    assert all(len(c.embedding) == EMBEDDING_DIM for c in chunks)


def test_embedder_receives_the_chunk_texts(client, auth_headers, fake_embedder):
    upload(client, auth_headers, content=make_pdf(["First page.", "Second page."]))
    assert len(fake_embedder.document_calls) == 1
    sent = fake_embedder.document_calls[0]
    assert any("First page" in t for t in sent) and any("Second page" in t for t in sent)


def test_embedding_failure_returns_502_and_stores_nothing(client, auth_headers, db):
    app.dependency_overrides[get_embedding_provider] = lambda: FailingEmbedder()
    res = upload(client, auth_headers)
    assert res.status_code == 502
    assert res.json()["detail"] == "The embedding service is unavailable"
    assert db.scalar(select(func.count()).select_from(Document)) == 0
    assert _chunk_count(db) == 0


def test_deleting_a_document_removes_its_chunks_and_embeddings(client, auth_headers, db):
    keep = upload(client, auth_headers, content=make_pdf(["Keep this one."])).json()["id"]
    drop = upload(client, auth_headers, content=make_pdf(["Delete this one.", "And this page."])).json()["id"]
    assert _chunk_count(db, document_id=drop) == 2

    assert client.delete(f"/documents/{drop}", headers=auth_headers).status_code == 204

    db.expire_all()
    assert _chunk_count(db, document_id=drop) == 0
    assert _chunk_count(db, document_id=keep) == 1


def test_deleting_a_user_removes_all_their_chunks_but_not_others(client, auth_headers, db):
    bob = register_and_login(client, "bob@example.com")
    upload(client, auth_headers, content=make_pdf(["Alice text."]))
    upload(client, bob, content=make_pdf(["Bob text."]))
    assert _chunk_count(db) == 2

    assert client.delete("/users/me", headers=auth_headers).status_code == 204

    db.expire_all()
    remaining = db.scalars(select(DocumentChunk)).all()
    assert [c.content for c in remaining] == ["Bob text."]
