from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict:
    """Reports API status, DB connectivity and whether pgvector is installed."""
    db.execute(text("SELECT 1"))
    pgvector = db.execute(
        text("SELECT extversion FROM pg_extension WHERE extname = 'vector'")
    ).scalar()
    return {
        "status": "ok",
        "database": "ok",
        "pgvector": pgvector or "missing",
    }
