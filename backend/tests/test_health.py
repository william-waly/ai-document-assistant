import os

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://x:x@localhost/x")

from fastapi.testclient import TestClient  # noqa: E402

from app.database import get_db  # noqa: E402
from app.main import app  # noqa: E402


class FakeDB:
    def execute(self, stmt):
        class Result:
            def scalar(self):
                return "0.8.0"

        return Result()


def test_health_ok():
    app.dependency_overrides[get_db] = lambda: FakeDB()
    res = TestClient(app).get("/health")
    app.dependency_overrides.clear()
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
