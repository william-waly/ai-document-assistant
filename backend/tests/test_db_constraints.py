"""Tests the database design itself: cascades and ownership constraints."""
import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError

from app.models import Conversation, Document, DocumentChunk, Message, User

VECTOR = [0.1] * 768


def _make_user(db, email):
    user = User(email=email, password_hash="x")
    db.add(user)
    db.commit()
    return user


def _make_document_with_chunk(db, user):
    doc = Document(user_id=user.id, filename="a.pdf", size_bytes=10, status="ready")
    db.add(doc)
    db.commit()
    db.add(
        DocumentChunk(
            document_id=doc.id, user_id=user.id, page_number=1, chunk_index=0,
            content="hello", embedding=VECTOR,
        )
    )
    db.commit()
    return doc


def _count(db, model):
    return db.scalar(select(func.count()).select_from(model))


def test_deleting_user_cascades_to_everything(db):
    user = _make_user(db, "a@example.com")
    _make_document_with_chunk(db, user)
    conv = Conversation(user_id=user.id)
    db.add(conv)
    db.commit()
    db.add(Message(conversation_id=conv.id, role="user", content="hi"))
    db.commit()

    db.delete(user)
    db.commit()

    for model in (User, Document, DocumentChunk, Conversation, Message):
        assert _count(db, model) == 0, model.__name__


def test_deleting_document_removes_its_chunks_only(db):
    user = _make_user(db, "a@example.com")
    doc1 = _make_document_with_chunk(db, user)
    _make_document_with_chunk(db, user)

    db.delete(doc1)
    db.commit()

    assert _count(db, Document) == 1
    assert _count(db, DocumentChunk) == 1


def test_chunk_owner_must_match_document_owner(db):
    alice = _make_user(db, "alice@example.com")
    bob = _make_user(db, "bob@example.com")
    doc = Document(user_id=alice.id, filename="a.pdf", size_bytes=1, status="ready")
    db.add(doc)
    db.commit()

    db.add(
        DocumentChunk(
            document_id=doc.id, user_id=bob.id, page_number=1, chunk_index=0,
            content="x", embedding=VECTOR,
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()


def test_invalid_status_and_role_rejected(db):
    user = _make_user(db, "a@example.com")
    db.add(Document(user_id=user.id, filename="a.pdf", size_bytes=1, status="weird"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    conv = Conversation(user_id=user.id)
    db.add(conv)
    db.commit()
    db.add(Message(conversation_id=conv.id, role="admin", content="x"))
    with pytest.raises(IntegrityError):
        db.commit()


def test_pgvector_extension_installed(db):
    assert db.scalar(text("SELECT extname FROM pg_extension WHERE extname = 'vector'")) == "vector"
