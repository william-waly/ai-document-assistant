import uuid

import pytest
from sqlalchemy import func, select

from app.config import settings
from app.main import app
from app.models import Conversation, Message
from app.services.llm import get_llm_provider
from app.services.rag import NO_ANSWER, Turn, condense_question
from tests.conftest import register_and_login
from tests.fakes import FailingLLM, FakeLLM
from tests.pdf_factory import make_pdf
from tests.test_documents import upload

ROCKET_Q = "How do rockets reach orbit?"


@pytest.fixture(autouse=True)
def _fake_embedding_scores(monkeypatch):
    monkeypatch.setattr(settings, "rag_min_score", 0.3)


def new_conversation(client, headers, **body):
    res = client.post("/conversations", headers=headers, json=body or None)
    assert res.status_code == 201
    return res.json()["id"]


def say(client, headers, conversation_id, content, **extra):
    return client.post(
        f"/conversations/{conversation_id}/messages", headers=headers, json={"content": content, **extra}
    )


def rocket_doc(client, headers, name="space.pdf"):
    return upload(client, headers, filename=name, content=make_pdf(["Rockets burn fuel to reach orbit around the planet."])).json()["id"]


def count(db, model):
    db.expire_all()
    return db.scalar(select(func.count()).select_from(model))


# --- create / list / read / delete -----------------------------------------------------


def test_create_conversation_with_default_and_custom_title(client, auth_headers):
    default = client.post("/conversations", headers=auth_headers)
    assert default.status_code == 201
    assert default.json()["title"] == "Ny samtale"
    assert default.json()["message_count"] == 0

    custom = client.post("/conversations", headers=auth_headers, json={"title": "  Eksamen  "})
    assert custom.json()["title"] == "Eksamen"
    assert client.post("/conversations", headers=auth_headers, json={"title": "x" * 201}).status_code == 422


def test_list_shows_only_own_conversations_most_recently_active_first(client, auth_headers):
    rocket_doc(client, auth_headers)
    first = new_conversation(client, auth_headers, title="first")
    second = new_conversation(client, auth_headers, title="second")
    bobs = new_conversation(client, register_and_login(client, "bob@example.com"))

    assert [c["id"] for c in client.get("/conversations", headers=auth_headers).json()] == [second, first]

    say(client, auth_headers, first, ROCKET_Q)  # activity moves "first" to the top
    listed = client.get("/conversations", headers=auth_headers).json()
    assert [c["id"] for c in listed] == [first, second]
    assert listed[0]["message_count"] == 2 and listed[0]["last_message_at"] is not None
    assert bobs not in [c["id"] for c in listed]


def test_send_message_stores_question_and_answer_with_sources(client, auth_headers, fake_llm):
    rocket_doc(client, auth_headers)
    cid = new_conversation(client, auth_headers)
    fake_llm.reply = "Fuel is burned [1]."

    res = say(client, auth_headers, cid, ROCKET_Q)

    assert res.status_code == 201
    body = res.json()
    assert body["user_message"]["role"] == "user" and body["user_message"]["content"] == ROCKET_Q
    assistant = body["assistant_message"]
    assert assistant["role"] == "assistant" and assistant["content"] == "Fuel is burned [1]."
    assert [(s["filename"], s["page_number"], s["ref"]) for s in assistant["sources"]] == [("space.pdf", 1, 1)]

    detail = client.get(f"/conversations/{cid}", headers=auth_headers).json()
    assert [m["role"] for m in detail["messages"]] == ["user", "assistant"]
    assert detail["messages"][1]["sources"][0]["filename"] == "space.pdf"


def test_history_keeps_order_across_several_turns(client, auth_headers):
    rocket_doc(client, auth_headers)
    cid = new_conversation(client, auth_headers)
    for i in range(3):
        say(client, auth_headers, cid, f"{ROCKET_Q} #{i}")

    messages = client.get(f"/conversations/{cid}", headers=auth_headers).json()["messages"]
    assert [m["role"] for m in messages] == ["user", "assistant"] * 3
    assert [m["content"] for m in messages if m["role"] == "user"] == [f"{ROCKET_Q} #{i}" for i in range(3)]


def test_first_question_becomes_the_title_and_later_ones_do_not_change_it(client, auth_headers):
    rocket_doc(client, auth_headers)
    cid = new_conversation(client, auth_headers)
    say(client, auth_headers, cid, ROCKET_Q)
    say(client, auth_headers, cid, "Another question about rockets")
    assert client.get(f"/conversations/{cid}", headers=auth_headers).json()["title"] == ROCKET_Q


def test_long_first_question_gives_a_shortened_title(client, auth_headers):
    cid = new_conversation(client, auth_headers)
    say(client, auth_headers, cid, "word " * 50)
    title = client.get(f"/conversations/{cid}", headers=auth_headers).json()["title"]
    assert len(title) <= 60 and title.endswith("…")


def test_unanswerable_question_is_stored_as_the_fixed_answer(client, auth_headers, fake_llm):
    cid = new_conversation(client, auth_headers)
    assistant = say(client, auth_headers, cid, "Anything?").json()["assistant_message"]
    assert assistant["content"] == NO_ANSWER and assistant["sources"] == []
    assert fake_llm.calls == []


def test_delete_conversation_removes_its_messages_only(client, auth_headers, db):
    rocket_doc(client, auth_headers)
    keep = new_conversation(client, auth_headers)
    drop = new_conversation(client, auth_headers)
    say(client, auth_headers, keep, ROCKET_Q)
    say(client, auth_headers, drop, ROCKET_Q)
    assert count(db, Message) == 4

    assert client.delete(f"/conversations/{drop}", headers=auth_headers).status_code == 204

    assert client.get(f"/conversations/{drop}", headers=auth_headers).status_code == 404
    assert count(db, Message) == 2
    assert len(client.get(f"/conversations/{keep}", headers=auth_headers).json()["messages"]) == 2


def test_deleting_the_user_removes_conversations_and_messages(client, auth_headers, db):
    rocket_doc(client, auth_headers)
    say(client, auth_headers, new_conversation(client, auth_headers), ROCKET_Q)
    assert count(db, Conversation) == 1 and count(db, Message) == 2

    client.delete("/users/me", headers=auth_headers)

    assert count(db, Conversation) == 0 and count(db, Message) == 0


# --- follow-up questions -----------------------------------------------------------------


def test_follow_up_is_rewritten_into_a_standalone_question(client, auth_headers, fake_llm):
    rocket_doc(client, auth_headers)
    cid = new_conversation(client, auth_headers)
    fake_llm.reply = "Rockets burn fuel [1]."
    say(client, auth_headers, cid, ROCKET_Q)
    assert len(fake_llm.calls) == 1  # first question: no history, so no rewrite step

    fake_llm.queue = [ROCKET_Q, "Because of the fuel [1]."]  # rewrite, then answer
    say(client, auth_headers, cid, "What about fuel?")

    assert len(fake_llm.calls) == 3
    rewrite, answer = fake_llm.calls[1], fake_llm.calls[2]
    assert "standalone" in rewrite[0]["content"]
    assert "Follow-up question: What about fuel?" in rewrite[1]["content"]
    assert ROCKET_Q in rewrite[1]["content"] and "Rockets burn fuel." in rewrite[1]["content"]  # history, citation stripped
    assert f"Question: {ROCKET_Q}" in answer[1]["content"]
    assert "What about fuel?" not in answer[1]["content"]


def test_history_sent_to_the_llm_is_limited(client, auth_headers, fake_llm, monkeypatch):
    monkeypatch.setattr(settings, "chat_history_messages", 2)
    rocket_doc(client, auth_headers)
    cid = new_conversation(client, auth_headers)
    for i in range(3):
        say(client, auth_headers, cid, f"{ROCKET_Q} number{i}")
    fake_llm.queue = [ROCKET_Q]
    say(client, auth_headers, cid, "And then?")
    rewrites = [c for c in fake_llm.calls if "standalone" in c[0]["content"]]
    rewrite_prompt = rewrites[-1][-1]["content"]  # the most recent rewrite step
    assert "number2" in rewrite_prompt and "number0" not in rewrite_prompt


def test_condense_falls_back_to_the_original_question():
    history = [Turn("user", "Q1"), Turn("assistant", "A1")]
    assert condense_question(FailingLLM(), history, "and then?") == "and then?"
    assert condense_question(FakeLLM("   "), history, "and then?") == "and then?"
    assert condense_question(FakeLLM("x" * 2000), history, "and then?") == "and then?"
    assert condense_question(FakeLLM('"Standalone?"\nExtra chatter'), history, "and then?") == "Standalone?"


# --- failure handling ----------------------------------------------------------------------


def test_failed_answer_stores_nothing_and_can_be_retried(client, auth_headers, db):
    rocket_doc(client, auth_headers)
    cid = new_conversation(client, auth_headers)
    app.dependency_overrides[get_llm_provider] = lambda: FailingLLM()

    res = say(client, auth_headers, cid, ROCKET_Q)

    assert res.status_code == 502
    assert count(db, Message) == 0
    assert client.get(f"/conversations/{cid}", headers=auth_headers).json()["title"] == "Ny samtale"


# --- access control --------------------------------------------------------------------------


def test_user_cannot_touch_another_users_conversation(client, auth_headers, db):
    rocket_doc(client, auth_headers)
    cid = new_conversation(client, auth_headers)
    say(client, auth_headers, cid, ROCKET_Q)
    bob = register_and_login(client, "bob@example.com")

    assert client.get(f"/conversations/{cid}", headers=bob).status_code == 404
    assert say(client, bob, cid, "hello").status_code == 404
    assert client.delete(f"/conversations/{cid}", headers=bob).status_code == 404
    assert client.get("/conversations", headers=bob).json() == []

    assert count(db, Message) == 2  # nothing was added or removed
    assert len(client.get(f"/conversations/{cid}", headers=auth_headers).json()["messages"]) == 2


def test_foreign_and_missing_conversations_look_identical(client, auth_headers):
    cid = new_conversation(client, auth_headers)
    bob = register_and_login(client, "bob@example.com")
    foreign = client.get(f"/conversations/{cid}", headers=bob)
    missing = client.get(f"/conversations/{uuid.uuid4()}", headers=bob)
    assert foreign.status_code == missing.status_code == 404
    assert foreign.json() == missing.json()


def test_a_conversation_only_searches_its_owners_documents(client, auth_headers, fake_llm):
    rocket_doc(client, auth_headers)  # Alice's
    bob = register_and_login(client, "bob@example.com")
    assistant = say(client, bob, new_conversation(client, bob), ROCKET_Q).json()["assistant_message"]
    assert assistant["content"] == NO_ANSWER
    assert fake_llm.calls == []


def test_endpoints_require_authentication(client):
    some_id = uuid.uuid4()
    assert client.post("/conversations").status_code == 401
    assert client.get("/conversations").status_code == 401
    assert client.get(f"/conversations/{some_id}").status_code == 401
    assert client.post(f"/conversations/{some_id}/messages", json={"content": "hi"}).status_code == 401
    assert client.delete(f"/conversations/{some_id}").status_code == 401


def test_message_validation(client, auth_headers):
    cid = new_conversation(client, auth_headers)
    assert say(client, auth_headers, cid, "").status_code == 422
    assert say(client, auth_headers, cid, "   ").status_code == 422
    assert say(client, auth_headers, cid, "x" * 1001).status_code == 422
    assert client.get("/conversations/not-a-uuid", headers=auth_headers).status_code == 422


# --- privacy: chat history must not outlive the documents it quotes ------------------------------


def test_deleting_a_document_removes_it_from_chat_sources_but_not_other_documents(client, auth_headers, db, fake_llm):
    doomed = rocket_doc(client, auth_headers, "doomed.pdf")
    rocket_doc(client, auth_headers, "kept.pdf")
    cid = new_conversation(client, auth_headers)
    fake_llm.reply = "Both documents agree [1][2]."
    assistant = say(client, auth_headers, cid, ROCKET_Q).json()["assistant_message"]
    assert {s["filename"] for s in assistant["sources"]} == {"doomed.pdf", "kept.pdf"}

    assert client.delete(f"/documents/{doomed}", headers=auth_headers).status_code == 204

    messages = client.get(f"/conversations/{cid}", headers=auth_headers).json()["messages"]
    assert [s["filename"] for s in messages[1]["sources"]] == ["kept.pdf"]
    db.expire_all()
    raw = db.scalars(select(Message.sources).where(Message.role == "assistant")).all()
    assert doomed not in str(raw)  # the id is gone from the database too, not just from the API


def test_deleting_the_only_source_document_leaves_an_empty_source_list(client, auth_headers):
    doc = rocket_doc(client, auth_headers)
    cid = new_conversation(client, auth_headers)
    say(client, auth_headers, cid, ROCKET_Q)
    client.delete(f"/documents/{doc}", headers=auth_headers)
    assistant = client.get(f"/conversations/{cid}", headers=auth_headers).json()["messages"][1]
    assert assistant["sources"] == []


def test_deleting_a_document_never_touches_another_users_chat(client, auth_headers):
    alice_doc = rocket_doc(client, auth_headers)
    bob = register_and_login(client, "bob@example.com")
    rocket_doc(client, bob)
    bobs_chat = new_conversation(client, bob)
    say(client, bob, bobs_chat, ROCKET_Q)

    client.delete(f"/documents/{alice_doc}", headers=auth_headers)

    sources = client.get(f"/conversations/{bobs_chat}", headers=bob).json()["messages"][1]["sources"]
    assert len(sources) == 1
