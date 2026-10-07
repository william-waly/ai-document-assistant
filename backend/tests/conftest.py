"""Test setup. Integration tests run against a REAL PostgreSQL + pgvector.

Point TEST_DATABASE_URL at a Postgres server; the database is created if
missing and rebuilt with the Alembic migrations (so migrations are tested too).
"""
import os
from pathlib import Path

# Must be set BEFORE the app is imported, since settings load at import time.
def _default_test_db_url() -> str:
    """Same credentials as the dev database (read from the root .env), but a
    separate database, so tests never touch your real data."""
    from dotenv import dotenv_values
    from sqlalchemy.engine import URL

    env = dotenv_values(Path(__file__).parents[2] / ".env")
    return URL.create(
        "postgresql+psycopg",
        username=env.get("POSTGRES_USER") or "docai",
        password=env.get("POSTGRES_PASSWORD") or "change-me",
        host="127.0.0.1",  # not "localhost": avoids a slow IPv6 attempt on Windows
        port=5432,
        database="docai_test",
    ).render_as_string(hide_password=False)


TEST_DB_URL = os.environ.get("TEST_DATABASE_URL") or _default_test_db_url()
os.environ["DATABASE_URL"] = TEST_DB_URL
os.environ["JWT_SECRET"] = "test-secret-not-for-production-0123456789"
os.environ["RATE_LIMIT_ENABLED"] = "false"

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

from app.database import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402


def _ensure_database_exists() -> None:
    url = make_url(TEST_DB_URL)
    admin = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        exists = conn.scalar(
            text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": url.database}
        )
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{url.database}"'))
    admin.dispose()


@pytest.fixture(scope="session", autouse=True)
def _migrated_database():
    _ensure_database_exists()
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    cfg = Config(str(Path(__file__).parent.parent / "alembic.ini"))
    command.upgrade(cfg, "head")
    yield


@pytest.fixture(autouse=True)
def _clean_tables(_migrated_database):
    yield
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE users CASCADE"))


@pytest.fixture(autouse=True)
def fake_embedder():
    """Every test gets a fake embedder, so no test ever needs Ollama."""
    from app.services.embeddings import get_embedding_provider
    from tests.fakes import FakeEmbedder

    fake = FakeEmbedder()
    app.dependency_overrides[get_embedding_provider] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_embedding_provider, None)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def register_and_login(client: TestClient, email: str, password: str = "correct-horse-1") -> dict:
    """Helper: creates a user and returns Authorization headers."""
    assert client.post("/auth/register", json={"email": email, "password": password}).status_code == 201
    token = client.post("/auth/login", json={"email": email, "password": password}).json()[
        "access_token"
    ]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_headers(client):
    return register_and_login(client, "alice@example.com")
