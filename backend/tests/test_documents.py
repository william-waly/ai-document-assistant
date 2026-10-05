import uuid

from sqlalchemy import func, select

from app.config import settings
from app.models import Document
from tests.conftest import register_and_login
from tests.pdf_factory import make_pdf


def upload(client, headers, content=None, filename="notes.pdf", content_type="application/pdf"):
    content = make_pdf(["Hello world", "Page two"]) if content is None else content
    return client.post(
        "/documents", headers=headers, files={"file": (filename, content, content_type)}
    )


def test_upload_success(client, auth_headers):
    res = upload(client, auth_headers)
    assert res.status_code == 201
    body = res.json()
    assert body["filename"] == "notes.pdf"
    assert body["page_count"] == 2
    assert body["status"] == "ready"
    assert body["size_bytes"] > 0
    assert "user_id" not in body


def test_filename_is_sanitised(client, auth_headers):
    res = upload(client, auth_headers, filename="../../etc/passwd.pdf")
    assert res.status_code == 201
    assert res.json()["filename"] == "passwd.pdf"


def test_list_and_get_own_documents(client, auth_headers):
    doc_id = upload(client, auth_headers).json()["id"]
    listed = client.get("/documents", headers=auth_headers).json()
    assert [d["id"] for d in listed] == [doc_id]
    got = client.get(f"/documents/{doc_id}", headers=auth_headers)
    assert got.status_code == 200
    assert got.json()["id"] == doc_id


def test_delete_document(client, auth_headers, db):
    doc_id = upload(client, auth_headers).json()["id"]
    assert client.delete(f"/documents/{doc_id}", headers=auth_headers).status_code == 204
    assert client.get(f"/documents/{doc_id}", headers=auth_headers).status_code == 404
    assert db.scalar(select(func.count()).select_from(Document)) == 0


def test_endpoints_require_authentication(client):
    some_id = uuid.uuid4()
    assert client.get("/documents").status_code == 401
    assert client.get(f"/documents/{some_id}").status_code == 401
    assert client.delete(f"/documents/{some_id}").status_code == 401
    files = {"file": ("a.pdf", make_pdf(["x"]), "application/pdf")}
    assert client.post("/documents", files=files).status_code == 401


# --- access control: user A vs user B -------------------------------------------


def test_user_cannot_access_another_users_document(client, auth_headers):
    doc_id = upload(client, auth_headers).json()["id"]  # alice's
    bob = register_and_login(client, "bob@example.com")

    assert client.get(f"/documents/{doc_id}", headers=bob).status_code == 404
    assert client.delete(f"/documents/{doc_id}", headers=bob).status_code == 404
    assert client.get("/documents", headers=bob).json() == []

    # Bob's failed delete must not have removed Alice's document.
    assert client.get(f"/documents/{doc_id}", headers=auth_headers).status_code == 200


def test_not_found_looks_identical_for_foreign_and_missing_ids(client, auth_headers):
    doc_id = upload(client, auth_headers).json()["id"]
    bob = register_and_login(client, "bob@example.com")
    foreign = client.get(f"/documents/{doc_id}", headers=bob)
    missing = client.get(f"/documents/{uuid.uuid4()}", headers=bob)
    assert foreign.status_code == missing.status_code == 404
    assert foreign.json() == missing.json()


def test_invalid_document_id_is_422(client, auth_headers):
    assert client.get("/documents/not-a-uuid", headers=auth_headers).status_code == 422


# --- upload validation ----------------------------------------------------------


def test_rejects_wrong_extension(client, auth_headers):
    assert upload(client, auth_headers, filename="notes.txt").status_code == 415


def test_rejects_fake_pdf_by_content(client, auth_headers):
    res = upload(client, auth_headers, content=b"just plain text", filename="fake.pdf")
    assert res.status_code == 415


def test_rejects_too_large_file(client, auth_headers, monkeypatch):
    monkeypatch.setattr(settings, "max_upload_mb", 1)
    big = b"%PDF-" + b"0" * (1024 * 1024 + 1)
    assert upload(client, auth_headers, content=big).status_code == 413


def test_rejects_corrupt_pdf(client, auth_headers):
    res = upload(client, auth_headers, content=b"%PDF-1.4 corrupt")
    assert res.status_code == 422


def test_rejects_pdf_without_text(client, auth_headers):
    res = upload(client, auth_headers, content=make_pdf([""]))
    assert res.status_code == 422
    assert "No extractable text" in res.json()["detail"]


def test_failed_upload_stores_nothing(client, auth_headers, db):
    upload(client, auth_headers, content=b"%PDF-1.4 corrupt")
    assert db.scalar(select(func.count()).select_from(Document)) == 0
