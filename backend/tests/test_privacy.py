"""GDPR features: retention, erasing my data, deleting my account, exporting my data."""
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select, text

from app.config import settings
from app.models import Conversation, Document, DocumentChunk, Message, User
from app.services import retention
from app.services.retention import purge_expired, run_sweep
from tests.conftest import delete_account, register_and_login
from tests.test_conversations import ROCKET_Q, new_conversation, rocket_doc, say
from tests.test_documents import upload


@pytest.fixture(autouse=True)
def _policy(monkeypatch):
    monkeypatch.setattr(settings, "rag_min_score", 0.3)
    monkeypatch.setattr(settings, "document_retention_days", 90)
    monkeypatch.setattr(settings, "conversation_retention_days", 90)


def in_days(days: int) -> datetime:
    return datetime.now(UTC) + timedelta(days=days)


def count(db, model):
    db.expire_all()
    return db.scalar(select(func.count()).select_from(model))


def age(db, sql: str, **params):
    """Back-dates rows, to simulate that time has passed."""
    db.execute(text(sql), params)
    db.commit()


# --- retention: documents ---------------------------------------------------------------


def test_expired_documents_are_deleted_with_their_chunks(client, auth_headers, db):
    rocket_doc(client, auth_headers)
    assert count(db, DocumentChunk) == 1

    result = purge_expired(db, now=in_days(91))

    assert result.documents == 1
    assert count(db, Document) == 0 and count(db, DocumentChunk) == 0


def test_documents_inside_the_retention_period_are_kept(client, auth_headers, db):
    rocket_doc(client, auth_headers)
    assert purge_expired(db, now=in_days(89)).documents == 0
    assert count(db, Document) == 1


def test_retention_can_be_switched_off(client, auth_headers, db, monkeypatch):
    monkeypatch.setattr(settings, "document_retention_days", 0)
    monkeypatch.setattr(settings, "conversation_retention_days", 0)
    rocket_doc(client, auth_headers)
    new_conversation(client, auth_headers)
    result = purge_expired(db, now=in_days(100_000))
    assert (result.documents, result.conversations) == (0, 0)
    assert count(db, Document) == 1 and count(db, Conversation) == 1


def test_only_the_old_document_is_purged(client, auth_headers, db):
    rocket_doc(client, auth_headers, "old.pdf")
    rocket_doc(client, auth_headers, "new.pdf")
    age(db, "UPDATE documents SET created_at = now() - interval '100 days' WHERE filename = 'old.pdf'")

    assert purge_expired(db).documents == 1

    assert [d["filename"] for d in client.get("/documents", headers=auth_headers).json()] == ["new.pdf"]


def test_purge_covers_every_users_expired_data(client, auth_headers, db):
    rocket_doc(client, auth_headers)
    rocket_doc(client, register_and_login(client, "bob@example.com"))
    assert purge_expired(db, now=in_days(91)).documents == 2


def test_expired_documents_also_disappear_from_chat_sources(client, auth_headers, db, monkeypatch):
    monkeypatch.setattr(settings, "conversation_retention_days", 0)  # keep the chat, expire the document
    rocket_doc(client, auth_headers)
    cid = new_conversation(client, auth_headers)
    assert say(client, auth_headers, cid, ROCKET_Q).json()["assistant_message"]["sources"] != []

    purge_expired(db, now=in_days(91))

    messages = client.get(f"/conversations/{cid}", headers=auth_headers).json()["messages"]
    assert messages[1]["sources"] == []


# --- retention: conversations -------------------------------------------------------------


def test_conversations_expire_after_their_last_activity(client, auth_headers, db):
    rocket_doc(client, auth_headers)
    active = new_conversation(client, auth_headers, title="active")  # old, but used recently
    stale = new_conversation(client, auth_headers, title="stale")  # old, not used since
    empty = new_conversation(client, auth_headers, title="empty")  # old, never used
    say(client, auth_headers, active, ROCKET_Q)
    say(client, auth_headers, stale, ROCKET_Q)
    age(db, "UPDATE conversations SET created_at = now() - interval '120 days'")
    age(db, "UPDATE messages SET created_at = now() - interval '100 days' WHERE conversation_id = :c",
        c=uuid.UUID(stale))

    result = purge_expired(db)

    assert result.conversations == 2
    remaining = {c["id"] for c in client.get("/conversations", headers=auth_headers).json()}
    assert remaining == {active}
    assert stale not in remaining and empty not in remaining
    assert count(db, Message) == 2  # only the active conversation's messages are left


# --- retention: visibility and robustness ---------------------------------------------------


def test_documents_tell_the_user_when_they_will_be_deleted(client, auth_headers, monkeypatch):
    body = upload(client, auth_headers).json()
    created = datetime.fromisoformat(body["created_at"])
    assert datetime.fromisoformat(body["expires_at"]) - created == timedelta(days=90)

    monkeypatch.setattr(settings, "document_retention_days", 0)
    assert upload(client, auth_headers).json()["expires_at"] is None


def test_a_failing_sweep_never_raises(monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("database exploded")

    monkeypatch.setattr(retention, "purge_expired", boom)
    run_sweep()  # must not raise: a failed sweep may not take the API down


# --- erase my data / delete my account --------------------------------------------------------


def test_deleting_the_account_requires_the_correct_password(client, auth_headers):
    assert client.request("DELETE", "/users/me", headers=auth_headers).status_code == 422
    assert delete_account(client, auth_headers, password="wrong-password").status_code == 403
    assert client.get("/users/me", headers=auth_headers).status_code == 200  # still there
    assert delete_account(client, auth_headers).status_code == 204


def test_deleting_the_account_removes_every_trace(client, auth_headers, db):
    rocket_doc(client, auth_headers)
    say(client, auth_headers, new_conversation(client, auth_headers), ROCKET_Q)
    assert delete_account(client, auth_headers).status_code == 204
    for model in (User, Document, DocumentChunk, Conversation, Message):
        assert count(db, model) == 0, model.__name__


def test_erasing_my_data_keeps_the_account_and_other_users_data(client, auth_headers, db):
    rocket_doc(client, auth_headers)
    say(client, auth_headers, new_conversation(client, auth_headers), ROCKET_Q)
    bob = register_and_login(client, "bob@example.com")
    rocket_doc(client, bob)
    new_conversation(client, bob)

    res = client.request("DELETE", "/users/me/data", headers=auth_headers, json={"password": "correct-horse-1"})

    assert res.status_code == 200
    assert res.json() == {"documents": 1, "conversations": 1}
    assert client.get("/users/me", headers=auth_headers).status_code == 200
    assert client.get("/documents", headers=auth_headers).json() == []
    assert client.get("/conversations", headers=auth_headers).json() == []
    assert len(client.get("/documents", headers=bob).json()) == 1
    assert len(client.get("/conversations", headers=bob).json()) == 1
    assert count(db, DocumentChunk) == 1 and count(db, Message) == 0


def test_erasing_my_data_requires_the_password(client, auth_headers):
    rocket_doc(client, auth_headers)
    res = client.request("DELETE", "/users/me/data", headers=auth_headers, json={"password": "nope-nope-nope"})
    assert res.status_code == 403
    assert len(client.get("/documents", headers=auth_headers).json()) == 1


def test_deletion_endpoints_require_authentication(client):
    body = {"password": "correct-horse-1"}
    assert client.request("DELETE", "/users/me", json=body).status_code == 401
    assert client.request("DELETE", "/users/me/data", json=body).status_code == 401


# --- export ------------------------------------------------------------------------------------


def test_export_contains_my_data_and_nothing_else(client, auth_headers):
    rocket_doc(client, auth_headers, "mine.pdf")
    say(client, auth_headers, new_conversation(client, auth_headers, title="mine"), ROCKET_Q)
    bob = register_and_login(client, "bob@example.com")
    rocket_doc(client, bob, "bobs-secret.pdf")

    res = client.get("/users/me/export", headers=auth_headers)

    assert res.status_code == 200
    assert "attachment" in res.headers["content-disposition"]
    data = res.json()
    assert data["account"]["email"] == "alice@example.com"
    assert [d["filename"] for d in data["documents"]] == ["mine.pdf"]
    messages = data["conversations"][0]["messages"]
    assert [m["role"] for m in messages] == ["user", "assistant"]
    assert messages[1]["sources"][0]["filename"] == "mine.pdf"
    for forbidden in ("password_hash", "embedding", "bob@example.com", "bobs-secret.pdf"):
        assert forbidden not in res.text


def test_export_includes_document_text_only_when_asked(client, auth_headers):
    rocket_doc(client, auth_headers)
    default = client.get("/users/me/export", headers=auth_headers).json()
    assert "chunks" not in default["documents"][0]

    full = client.get("/users/me/export?include_document_text=true", headers=auth_headers).json()
    chunks = full["documents"][0]["chunks"]
    assert chunks[0]["page_number"] == 1 and "Rockets burn fuel" in chunks[0]["text"]


def test_export_requires_authentication(client):
    assert client.get("/users/me/export").status_code == 401


def test_export_of_an_empty_account_is_valid(client, auth_headers):
    data = client.get("/users/me/export", headers=auth_headers).json()
    assert data["documents"] == [] and data["conversations"] == []
