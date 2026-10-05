from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)

_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """The ONLY way endpoints learn who the caller is: from a verified token."""
    if creds is None:
        raise _UNAUTHORIZED
    user_id = decode_access_token(creds.credentials)
    if user_id is None:
        raise _UNAUTHORIZED
    user = db.get(User, user_id)
    if user is None:  # e.g. account deleted after the token was issued
        raise _UNAUTHORIZED
    return user
