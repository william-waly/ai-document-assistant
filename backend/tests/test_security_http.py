"""HTTP-level security: headers, CORS, body limits, injection, access control."""
import re
import uuid

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.config import settings
from app.database import get_db
from app.main import app
from app.rate_limit import limiter
from tests.conftest import register_and_login
from tests.pdf_factory import make_pdf
from tests.test_conversations import ROCKET_Q, new_conversation, rocket_doc, say
from tests.test_documents import upload

TABLES = ["users", "documents", "document_chunks", "conversations", "messages"]


@pytest.fixture(autouse=True)
def _fake_embedding_scores(monkeypatch):
    monkeypatch.setattr(settings, "rag_min_score", 0.3)


# --- security headers ---------------------------------------------------------------------


def test_security_headers_on_normal_and_error_responses(client):
    for res in (client.get("/health"), client.get("/users/me"), client.get("/no-such-route")):
        assert res.headers["x-content-type-options"] == "nosniff"
        assert res.headers["x-frame-options"] == "DENY"
        assert res.headers["referrer-policy"] == "no-referrer"
        assert res.headers["cache-control"] == "no-store"
        assert "default-src 'none'" in res.headers["content-security-policy"]


def test_api_docs_keep_working_without_the_strict_csp(client):
    res = client.get("/docs")
    assert res.status_code == 200
    assert res.headers["x-content-type-options"] == "nosniff"
    assert "content-security-policy" not in res.headers


def test_hsts_is_opt_in(client, monkeypatch):
    assert "strict-transport-security" not in client.get("/health").headers
    monkeypatch.setattr(settings, "hsts_enabled", True)
    assert "max-age" in client.get("/health").headers["strict-transport-security"]


# --- CORS ---------------------------------------------------------------------------------


def _preflight(client, origin, method="POST"):
    return client.options(
        "/documents",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": method,
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )


def test_cors_allows_the_configured_frontend(client):
    origin = settings.cors_origin_list[0]
    res = _preflight(client, origin)
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == origin
    assert "access-control-allow-credentials" not in res.headers  # Bearer header, not cookies
    assert res.headers["x-content-type-options"] == "nosniff"  # headers also on preflights


def test_cors_rejects_other_origins(client):
    res = _preflight(client, "https://evil.example")
    assert "access-control-allow-origin" not in res.headers
    assert res.status_code == 400


def test_cors_is_never_a_wildcard():
    assert "*" not in settings.cors_origin_list


def test_cors_does_not_allow_unneeded_methods(client):
    res = _preflight(client, settings.cors_origin_list[0], method="PUT")
    assert res.status_code == 400


# --- request size limits ----------------------------------------------------------------------


def test_oversized_json_body_is_rejected_by_content_length(client):
    body = {"email": "a@example.com", "password": "x" * (settings.max_json_body_bytes + 10)}
    assert client.post("/auth/login", json=body).status_code == 413


def test_oversized_body_is_rejected_even_when_streamed_without_content_length(client):
    def chunks():
        for _ in range(20):
            yield b"x" * 8192  # 160 KB > 64 KB, sent chunked (no Content-Length header)

    res = client.post("/auth/login", content=chunks(), headers={"Content-Type": "application/json"})
    assert res.status_code == 413
    assert res.json() == {"detail": "Request body too large"}


def test_oversized_upload_is_rejected_while_streaming(client, auth_headers, monkeypatch):
    monkeypatch.setattr(settings, "max_upload_mb", 1)

    def chunks():
        yield b"--b\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.pdf\"\r\n\r\n%PDF-"
        for _ in range(40):
            yield b"0" * 65536  # 2.5 MB, chunked

    headers = {**auth_headers, "Content-Type": "multipart/form-data; boundary=b"}
    assert client.post("/documents", content=chunks(), headers=headers).status_code == 413


def test_normal_requests_are_unaffected_by_the_limits(client, auth_headers):
    assert upload(client, auth_headers, content=make_pdf(["Small but valid."])).status_code == 201


# --- injection ----------------------------------------------------------------------------------

SQLI = [
    "'; DROP TABLE users; --",
    "' OR '1'='1",
    '" OR 1=1 --',
    "Robert'); DROP TABLE messages;--",
    "\\'; TRUNCATE document_chunks; --",
]


def _all_tables_exist(db):
    db.expire_all()
    return all(db.scalar(text("SELECT to_regclass(:t)"), {"t": f"public.{t}"}) for t in TABLES)


@pytest.mark.parametrize("payload", SQLI)
def test_sql_injection_payloads_are_treated_as_plain_text(client, auth_headers, db, payload):
    rocket_doc(client, auth_headers)
    cid = new_conversation(client, auth_headers, title=payload)
    assert client.get(f"/conversations/{cid}", headers=auth_headers).json()["title"] == payload

    assert client.post("/search", headers=auth_headers, json={"query": payload}).status_code == 200
    assert say(client, auth_headers, cid, payload).status_code == 201
    assert upload(client, auth_headers, filename=f"{payload}.pdf").status_code == 201

    assert _all_tables_exist(db)
    assert len(client.get("/documents", headers=auth_headers).json()) == 2  # data intact


@pytest.mark.parametrize("payload", SQLI)
def test_sql_injection_cannot_bypass_login(client, payload):
    client.post("/auth/register", json={"email": "a@example.com", "password": "correct-horse-1"})
    assert client.post("/auth/login", json={"email": "a@example.com", "password": payload}).status_code == 401
    assert client.post("/auth/login", json={"email": payload, "password": "x"}).status_code == 422


def test_html_in_user_content_is_returned_as_inert_json(client, auth_headers):
    xss = "<script>alert('xss')</script><img src=x onerror=alert(1)>"
    cid = new_conversation(client, auth_headers, title=xss)
    rocket_doc(client, auth_headers)

    res = client.get(f"/conversations/{cid}", headers=auth_headers)

    assert res.headers["content-type"].startswith("application/json")  # never text/html
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.json()["title"] == xss  # stored verbatim; React escapes it on output


# --- errors must not leak internals ---------------------------------------------------------------


def test_unexpected_errors_return_a_generic_500():
    def broken_db():
        raise RuntimeError("secret-internal-detail postgresql://user:pw@host/db")

    app.dependency_overrides[get_db] = broken_db
    try:
        res = TestClient(app, raise_server_exceptions=False).get("/health")
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert res.status_code == 500
    assert res.json() == {"detail": "Internal server error"}
    assert "secret-internal-detail" not in res.text and "Traceback" not in res.text
    assert res.headers["x-content-type-options"] == "nosniff"


# --- authentication: every endpoint, automatically ----------------------------------------------------

PUBLIC = {("GET", "/health"), ("POST", "/auth/register"), ("POST", "/auth/login")}
ROUTES = sorted(
    (method, route.path)
    for route in app.routes
    if isinstance(route, APIRoute)
    for method in route.methods
)


def test_the_route_list_is_not_empty():
    assert len(ROUTES) >= 18
    assert PUBLIC <= set(ROUTES)


@pytest.mark.parametrize("method,path", [r for r in ROUTES if r not in PUBLIC])
def test_every_non_public_endpoint_requires_authentication(client, method, path):
    """Add an endpoint and forget auth, and this test fails."""
    concrete = re.sub(r"\{[^}]+\}", str(uuid.uuid4()), path)
    res = client.request(method, concrete, json={})
    assert res.status_code == 401, f"{method} {path} answered {res.status_code} without a token"
    assert res.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize(
    "header",
    ["Basic YWxpY2U6cGFzc3dvcmQ=", "Bearer", "Bearer not.a.jwt", "Token abc", ""],
)
def test_malformed_authorization_headers_are_rejected(client, header):
    assert client.get("/users/me", headers={"Authorization": header}).status_code == 401


def test_token_in_the_query_string_is_not_accepted(client, auth_headers):
    token = auth_headers["Authorization"].split()[1]
    assert client.get(f"/users/me?access_token={token}&token={token}").status_code == 401


# --- authorisation: user B against user A's data ---------------------------------------------------------


def test_user_b_cannot_reach_any_of_user_as_resources(client, auth_headers):
    doc_id = rocket_doc(client, auth_headers)
    cid = new_conversation(client, auth_headers)
    say(client, auth_headers, cid, ROCKET_Q)
    bob = register_and_login(client, "bob@example.com")

    attempts = [
        ("GET", f"/documents/{doc_id}", None),
        ("DELETE", f"/documents/{doc_id}", None),
        ("GET", f"/conversations/{cid}", None),
        ("POST", f"/conversations/{cid}/messages", {"content": "hello"}),
        ("DELETE", f"/conversations/{cid}", None),
        ("POST", "/search", {"query": ROCKET_Q, "document_id": doc_id}),
        ("POST", "/ask", {"question": ROCKET_Q, "document_id": doc_id}),
    ]
    for method, path, body in attempts:
        res = client.request(method, path, headers=bob, json=body)
        assert res.status_code in (404, 200), (method, path, res.status_code)
        if path in ("/search", "/ask"):
            payload = res.json()
            assert payload == [] or payload["answered"] is False, "leaked data via " + path
        else:
            assert res.status_code == 404, (method, path)

    # Alice's data is untouched after all of that.
    assert client.get(f"/documents/{doc_id}", headers=auth_headers).status_code == 200
    assert len(client.get(f"/conversations/{cid}", headers=auth_headers).json()["messages"]) == 2


def test_client_supplied_owner_fields_are_ignored(client, auth_headers):
    bob = register_and_login(client, "bob@example.com")
    bob_id = client.get("/users/me", headers=bob).json()["id"]
    forced_id = str(uuid.uuid4())

    res = client.post(
        "/conversations",
        headers=auth_headers,
        json={"title": "mine", "user_id": bob_id, "id": forced_id},
    )

    assert res.status_code == 201 and res.json()["id"] != forced_id
    assert client.get("/conversations", headers=bob).json() == []
    assert [c["title"] for c in client.get("/conversations", headers=auth_headers).json()] == ["mine"]


def test_registration_ignores_privilege_fields(client):
    res = client.post(
        "/auth/register",
        json={"email": "a@example.com", "password": "correct-horse-1", "is_admin": True, "id": str(uuid.uuid4())},
    )
    assert res.status_code == 201
    assert "is_admin" not in res.json()


# --- rate limiting on the expensive endpoints ----------------------------------------------------------------


@pytest.mark.parametrize(
    "method,path,body,limit",
    [("GET", "/users/me/export", None, 5), ("POST", "/search", {"query": "anything"}, 30)],
)
def test_expensive_endpoints_are_rate_limited(client, auth_headers, method, path, body, limit):
    limiter.enabled = True
    limiter.reset()
    try:
        codes = [client.request(method, path, headers=auth_headers, json=body).status_code for _ in range(limit + 2)]
    finally:
        limiter.enabled = False
        limiter.reset()
    assert codes[:limit] == [200] * limit
    assert codes[limit:] == [429, 429]
