"""User-facing GDPR operations: erase my data, export my data."""
from datetime import UTC, datetime, timedelta

from fastapi.encoders import jsonable_encoder
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Conversation, Document, DocumentChunk, Message, User


def delete_user_data(db: Session, user: User) -> dict[str, int]:
    """Erases everything the user has uploaded or written, but keeps the account.

    Rows are removed in bulk; ON DELETE CASCADE takes chunks, embeddings and
    messages with them.
    """
    conversations = db.execute(delete(Conversation).where(Conversation.user_id == user.id)).rowcount
    documents = db.execute(delete(Document).where(Document.user_id == user.id)).rowcount
    db.commit()
    return {"documents": documents, "conversations": conversations}


def build_export(db: Session, user: User, include_document_text: bool = False) -> dict:
    """Everything stored about the user, as plain JSON (right of access / portability).

    Embeddings and the password hash are left out: they are internal and not
    readable data. Original PDFs are not stored, so they cannot be exported.
    """
    documents = db.scalars(
        select(Document).where(Document.user_id == user.id).order_by(Document.created_at)
    ).all()

    chunks_by_document: dict = {}
    if include_document_text:
        rows = db.execute(
            select(
                DocumentChunk.document_id,
                DocumentChunk.page_number,
                DocumentChunk.chunk_index,
                DocumentChunk.content,
            )
            .where(DocumentChunk.user_id == user.id)
            .order_by(DocumentChunk.document_id, DocumentChunk.chunk_index)
        ).all()
        for row in rows:
            chunks_by_document.setdefault(row.document_id, []).append(
                {"page_number": row.page_number, "chunk_index": row.chunk_index, "text": row.content}
            )

    exported_documents = []
    for d in documents:
        item = {
            "id": d.id,
            "filename": d.filename,
            "size_bytes": d.size_bytes,
            "page_count": d.page_count,
            "status": d.status,
            "uploaded_at": d.created_at,
            "deleted_automatically_at": (
                d.created_at + timedelta(days=settings.document_retention_days)
                if settings.document_retention_days > 0
                else None
            ),
        }
        if include_document_text:
            item["chunks"] = chunks_by_document.get(d.id, [])
        exported_documents.append(item)

    conversations = db.scalars(
        select(Conversation).where(Conversation.user_id == user.id).order_by(Conversation.created_at)
    ).all()
    messages_by_conversation: dict = {}
    message_rows = db.scalars(
        select(Message)
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(Conversation.user_id == user.id)
        .order_by(Message.created_at, Message.role.desc())
    ).all()
    for m in message_rows:
        messages_by_conversation.setdefault(m.conversation_id, []).append(
            {"role": m.role, "content": m.content, "sources": m.sources or [], "created_at": m.created_at}
        )

    data = {
        "exported_at": datetime.now(UTC),
        "note": (
            "Original PDF files are not stored. Document text is only included "
            "with include_document_text=true (chunks overlap slightly). Embeddings "
            "and the password hash are internal and omitted."
        ),
        "account": {"id": user.id, "email": user.email, "created_at": user.created_at},
        "documents": exported_documents,
        "conversations": [
            {
                "id": c.id,
                "title": c.title,
                "created_at": c.created_at,
                "messages": messages_by_conversation.get(c.id, []),
            }
            for c in conversations
        ],
    }
    return jsonable_encoder(data)
