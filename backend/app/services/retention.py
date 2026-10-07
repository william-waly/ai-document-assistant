"""Retention policy: personal data must not be kept forever "just in case".

Documents (with their chunks and embeddings) are deleted DOCUMENT_RETENTION_DAYS
after upload. Conversations are deleted CONVERSATION_RETENTION_DAYS after their
last activity. 0 disables a rule. Run it with the background sweep (started in
main.py) or by hand:  python -m app.services.retention
"""
import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models import Conversation, Document, Message
from app.services.documents import delete_document

logger = logging.getLogger("retention")

_BATCH = 100


@dataclass(frozen=True)
class PurgeResult:
    documents: int
    conversations: int


def purge_expired(db: Session, now: datetime | None = None) -> PurgeResult:
    """Deletes expired data for ALL users. `now` is injectable for tests."""
    now = now or datetime.now(timezone.utc)
    return PurgeResult(_purge_documents(db, now), _purge_conversations(db, now))


def _purge_documents(db: Session, now: datetime) -> int:
    days = settings.document_retention_days
    if days <= 0:
        return 0
    cutoff = now - timedelta(days=days)
    deleted = 0
    while True:
        batch = db.scalars(select(Document).where(Document.created_at < cutoff).limit(_BATCH)).all()
        if not batch:
            return deleted
        for document in batch:
            # Same function as a user-initiated delete: chunks, embeddings AND
            # the copies in chat sources go away together.
            delete_document(db, document)
            deleted += 1


def _purge_conversations(db: Session, now: datetime) -> int:
    days = settings.conversation_retention_days
    if days <= 0:
        return 0
    cutoff = now - timedelta(days=days)
    last_activity = func.coalesce(func.max(Message.created_at), Conversation.created_at)
    ids = db.scalars(
        select(Conversation.id)
        .outerjoin(Message, Message.conversation_id == Conversation.id)
        .group_by(Conversation.id)
        .having(last_activity < cutoff)
    ).all()
    for start in range(0, len(ids), 500):
        db.execute(delete(Conversation).where(Conversation.id.in_(ids[start : start + 500])))
    db.commit()
    return len(ids)


def run_sweep() -> None:
    """One sweep. Never raises: a failed sweep must not take the API down."""
    try:
        with SessionLocal() as db:
            result = purge_expired(db)
        if result.documents or result.conversations:
            # Counts only. Never log filenames, text or user data.
            logger.info(
                "Retention sweep removed %d documents and %d conversations",
                result.documents,
                result.conversations,
            )
    except Exception:
        logger.exception("Retention sweep failed")


async def retention_loop() -> None:
    while True:
        await asyncio.to_thread(run_sweep)
        await asyncio.sleep(settings.retention_sweep_minutes * 60)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_sweep()
