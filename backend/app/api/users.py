from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.rate_limit import limiter
from app.schemas import DataDeletionResult, PasswordConfirm, UserOut
from app.security import verify_password
from app.services.privacy import build_export, delete_user_data

router = APIRouter(prefix="/users", tags=["users"])


def _confirm_password(user: User, body: PasswordConfirm) -> None:
    """Destructive actions need the password again, so a stolen or left-open
    session token alone can't wipe an account. 403, not 401, so a typo doesn't
    look like an expired session."""
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Incorrect password")


@router.get("/me", response_model=UserOut)
def read_me(user: User = Depends(get_current_user)):
    return user


@router.get("/me/export")
@limiter.limit(settings.export_rate_limit)
def export_my_data(
    request: Request,
    include_document_text: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download everything stored about you as JSON (GDPR: access and portability)."""
    return JSONResponse(
        build_export(db, user, include_document_text),
        headers={"Content-Disposition": 'attachment; filename="my-data-export.json"'},
    )


@router.delete("/me/data", response_model=DataDeletionResult)
@limiter.limit(settings.auth_rate_limit)
def delete_my_data(
    request: Request,
    body: PasswordConfirm,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Erases all your documents, embeddings and conversations. The account stays."""
    _confirm_password(user, body)
    return delete_user_data(db, user)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(settings.auth_rate_limit)
def delete_me(
    request: Request,
    body: PasswordConfirm,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Deletes the account. ON DELETE CASCADE removes everything the user owns."""
    _confirm_password(user, body)
    db.delete(user)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
