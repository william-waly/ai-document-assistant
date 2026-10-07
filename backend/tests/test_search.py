import uuid

from sqlalchemy import text

from app.main import app
from app.models import EMBEDDING_DIM, Document, DocumentChunk, User
from app.services.embeddings import get_embedding_provider
from app.services.search import search_chunks
from tests.conftest import register_and_login
from tests.fakes import FailingEmbedder, FakeEmbedder
from tests.pdf_factory import make_pdf
from tests.test_documents import upload


def search(client, headers, query, **extra):
    return client.post("/search", headers=headers, json={"query": query, **extra})


def upload_topics(client, headers):
    upload(client, headers, filename="animals.pdf", content=make_pdf(["Cats purr and dogs bark loudly.", "Whales sing deep songs in the ocean."]))
    upload(client, headers, filename="space.pdf", content=make_pdf(["Rockets burn fuel to reach orbit around the planet."]))


def test_returns_most_relevant_chunk_first_with_source(client, auth_headers):
    upload_topics(client, auth_headers)
    res = search(client, auth_headers, "how do rockets reach orbit")
    assert res.status_code == 200
    hits = res.json()
    assert hits[0]["filename"] == "space.pdf"
    assert hits[0]["page_number"] == 1
    assert "Rockets" in hits[0]["content"]
    scores = [h["score"] for h in hits]
    assert scores == sorted(scores, reverse=True)


def test_result_points_to_the_right_page(client, auth_headers):
    upload_topics(client, auth_headers)
    hit = search(client, auth_headers, "whales sing songs ocean").json()[0]
    assert (hit["filename"], hit["page_number"]) == ("animals.pdf", 2)


def test_identical_text_scores_about_one(client, auth_headers):
    upload(client, auth_headers, content=make_pdf(["The exact sentence to find."]))
    hit = search(client, auth_headers, "The exact sentence to find.").json()[0]
    assert hit["score"] > 0.99


def test_limit_is_respected(client, auth_headers):
    upload_topics(client, auth_headers)
    assert len(search(client, auth_headers, "animals", limit=2).json()) == 2


def test_can_restrict_search_to_one_document(client, auth_headers):
    upload_topics(client, auth_headers)
    space_id = next(d["id"] for d in client.get("/documents", headers=auth_headers).json() if d["filename"] == "space.pdf")
    hits = search(client, auth_headers, "cats dogs whales", document_id=space_id).json()
    assert {h["filename"] for h in hits} == {"space.pdf"}


def test_input_validation(client, auth_headers):
    assert search(client, auth_headers, "").status_code == 422
    assert search(client, auth_headers, "   ").status_code == 422
    assert search(client, auth_headers, "x" * 1001).status_code == 422
    assert search(client, auth_headers, "ok", limit=0).status_code == 422
    assert search(client, auth_headers, "ok", limit=21).status_code == 422
    assert search(client, auth_headers, "ok", document_id="not-a-uuid").status_code == 422


def test_requires_authentication(client):
    assert client.post("/search", json={"query": "anything"}).status_code == 401


def test_no_documents_gives_empty_result(client, auth_headers):
    assert search(client, auth_headers, "anything").json() == []


def test_embedding_failure_returns_502(client, auth_headers):
    app.dependency_overrides[get_embedding_provider] = lambda: FailingEmbedder()
    assert search(client, auth_headers, "anything").status_code == 502


def test_deleted_document_is_no_longer_searchable(client, auth_headers):
    doc_id = upload(client, auth_headers, content=make_pdf(["Unique zebra stripes pattern."])).json()["id"]
    assert search(client, auth_headers, "zebra stripes").json() != []
    client.delete(f"/documents/{doc_id}", headers=auth_headers)
    assert search(client, auth_headers, "zebra stripes").json() == []


# --- access control ---------------------------------------------------------------


def test_user_never_sees_another_users_chunks(client, auth_headers):
    upload(client, auth_headers, filename="secret.pdf", content=make_pdf(["The secret recipe uses saffron."]))
    bob = register_and_login(client, "bob@example.com")

    assert search(client, bob, "secret recipe saffron").json() == []

    upload(client, bob, filename="bobs.pdf", content=make_pdf(["Bob likes secret recipe books."]))
    hits = search(client, bob, "secret recipe saffron").json()
    assert {h["filename"] for h in hits} == {"bobs.pdf"}


def test_document_id_filter_cannot_reach_another_users_document(client, auth_headers):
    alice_doc = upload(client, auth_headers, content=make_pdf(["Alice private notes."])).json()["id"]
    bob = register_and_login(client, "bob@example.com")
    assert search(client, bob, "Alice private notes", document_id=alice_doc).json() == []


# --- the search service itself ------------------------------------------------------


def _seed_two_users(db, many=100, few=5):
    """Alice has MANY chunks close to the query. Bob has FEW, all far away."""
    fake = FakeEmbedder()
    alice = User(email="a@example.com", password_hash="x")
    bob = User(email="b@example.com", password_hash="x")
    db.add_all([alice, bob])
    db.flush()
    docs = {}
    for user, name in ((alice, "alice.pdf"), (bob, "bob.pdf")):
        docs[user.id] = Document(user_id=user.id, filename=name, size_bytes=1, status="ready")
        db.add(docs[user.id])
    db.flush()
    chunks = []
    for i in range(many):
        text_ = f"apple banana cherry {i}"
        chunks.append(DocumentChunk(document_id=docs[alice.id].id, user_id=alice.id, page_number=1,
                                    chunk_index=i, content=text_, embedding=fake.embed_query(text_)))
    for i in range(few):
        text_ = f"zebra yak xylophone {i}"
        chunks.append(DocumentChunk(document_id=docs[bob.id].id, user_id=bob.id, page_number=1,
                                    chunk_index=i, content=text_, embedding=fake.embed_query(text_)))
    db.add_all(chunks)
    db.commit()
    return alice, bob, fake


def test_small_user_still_gets_full_results_when_other_users_dominate(db):
    alice, bob, fake = _seed_two_users(db)
    query = fake.embed_query("apple banana cherry")  # matches ALICE's data

    hits = search_chunks(db, bob.id, query, limit=5)

    assert len(hits) == 5
    assert all(h.filename == "bob.pdf" for h in hits)


def test_search_for_unknown_user_returns_nothing(db):
    _, _, fake = _seed_two_users(db, many=3, few=3)
    assert search_chunks(db, uuid.uuid4(), fake.embed_query("apple"), limit=5) == []


def test_hnsw_index_exists_with_cosine_ops(db):
    definition = db.scalar(
        text("SELECT indexdef FROM pg_indexes WHERE indexname = 'ix_document_chunks_embedding_hnsw'")
    )
    assert definition is not None
    assert "hnsw" in definition and "vector_cosine_ops" in definition
    assert EMBEDDING_DIM == 768
