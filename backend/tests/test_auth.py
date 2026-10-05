from sqlalchemy import select

from app.models import User
from app.rate_limit import limiter


def test_register_success(client):
    res = client.post(
        "/auth/register", json={"email": "Alice@Example.com", "password": "correct-horse-1"}
    )
    assert res.status_code == 201
    body = res.json()
    assert body["email"] == "alice@example.com"  # normalised
    assert "password" not in body and "password_hash" not in body


def test_password_is_stored_hashed(client, db):
    client.post("/auth/register", json={"email": "a@example.com", "password": "correct-horse-1"})
    user = db.scalar(select(User).where(User.email == "a@example.com"))
    assert user.password_hash != "correct-horse-1"
    assert user.password_hash.startswith("$2b$")


def test_register_duplicate_email_conflict(client):
    payload = {"email": "a@example.com", "password": "correct-horse-1"}
    assert client.post("/auth/register", json=payload).status_code == 201
    payload["email"] = "A@EXAMPLE.com"
    assert client.post("/auth/register", json=payload).status_code == 409


def test_register_validation(client):
    assert client.post("/auth/register", json={"email": "nope", "password": "correct-horse-1"}).status_code == 422
    assert client.post("/auth/register", json={"email": "a@example.com", "password": "short"}).status_code == 422
    assert client.post("/auth/register", json={"email": "a@example.com", "password": "x" * 73}).status_code == 422
    assert client.post("/auth/register", json={"email": "a@example.com"}).status_code == 422


def test_login_success(client):
    client.post("/auth/register", json={"email": "a@example.com", "password": "correct-horse-1"})
    res = client.post("/auth/login", json={"email": "a@example.com", "password": "correct-horse-1"})
    assert res.status_code == 200
    assert res.json()["token_type"] == "bearer"
    assert res.json()["access_token"]


def test_login_failures_are_indistinguishable(client):
    client.post("/auth/register", json={"email": "a@example.com", "password": "correct-horse-1"})
    wrong_pw = client.post("/auth/login", json={"email": "a@example.com", "password": "wrong-password"})
    no_user = client.post("/auth/login", json={"email": "ghost@example.com", "password": "wrong-password"})
    assert wrong_pw.status_code == no_user.status_code == 401
    assert wrong_pw.json() == no_user.json()


def test_me_requires_authentication(client):
    assert client.get("/users/me").status_code == 401
    assert client.get("/users/me", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_me_returns_current_user(client, auth_headers):
    res = client.get("/users/me", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["email"] == "alice@example.com"


def test_delete_me_removes_account_and_invalidates_token(client, auth_headers, db):
    assert client.delete("/users/me", headers=auth_headers).status_code == 204
    assert db.scalar(select(User).where(User.email == "alice@example.com")) is None
    assert client.get("/users/me", headers=auth_headers).status_code == 401
    res = client.post("/auth/login", json={"email": "alice@example.com", "password": "correct-horse-1"})
    assert res.status_code == 401


def test_login_is_rate_limited(client):
    limiter.enabled = True
    limiter.reset()
    try:
        codes = [
            client.post("/auth/login", json={"email": "a@example.com", "password": "x"}).status_code
            for _ in range(7)
        ]
    finally:
        limiter.enabled = False
        limiter.reset()
    assert codes[:5] == [401] * 5
    assert 429 in codes[5:]
