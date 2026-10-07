import uuid
from datetime import UTC, datetime, timedelta

import jwt

from app.config import settings
from app.security import (
    ALGORITHM,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_password_hash_roundtrip():
    h = hash_password("correct-horse-1")
    assert h != "correct-horse-1"
    assert verify_password("correct-horse-1", h)
    assert not verify_password("wrong-password", h)


def test_hashes_are_salted():
    assert hash_password("same-password") != hash_password("same-password")


def test_token_roundtrip():
    uid = uuid.uuid4()
    assert decode_access_token(create_access_token(uid)) == uid


def test_token_signed_with_other_secret_is_rejected():
    forged = jwt.encode(
        {"sub": str(uuid.uuid4()), "exp": datetime.now(UTC) + timedelta(hours=1)},
        "another-secret-that-is-long-enough-123",
        algorithm=ALGORITHM,
    )
    assert decode_access_token(forged) is None


def test_expired_token_is_rejected():
    expired = jwt.encode(
        {"sub": str(uuid.uuid4()), "exp": datetime.now(UTC) - timedelta(seconds=5)},
        settings.jwt_secret,
        algorithm=ALGORITHM,
    )
    assert decode_access_token(expired) is None


def test_unsigned_alg_none_token_is_rejected():
    token = jwt.encode({"sub": str(uuid.uuid4())}, key=None, algorithm="none")
    assert decode_access_token(token) is None
