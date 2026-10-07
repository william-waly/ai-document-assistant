import uuid
from dataclasses import dataclass

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models import Document, DocumentChunk


@dataclass(frozen=True)
class SearchHit:
    document_id: uuid.UUID
    filename: str
    page_number: int
    chunk_index: int
    content: str
    score: float


def search_chunks(
    db: Session,
    user_id: uuid.UUID,
    query_embedding: list[float],
    limit: int = 5,
    document_id: uuid.UUID | None = None,
) -> list[SearchHit]:
    """Top-`limit` chunks by cosine similarity, restricted to ONE user.

    `user_id` is a required argument and is always part of the WHERE clause.
    There is no way to call this function without naming whose data to search.
    """
    # HNSW normally returns ~40 nearest chunks from ALL users and only then
    # applies the user filter, which can leave a small user with too few (or
    # zero) results. Iterative scan (pgvector >= 0.8) keeps scanning until
    # enough rows pass the filter. SET LOCAL only lasts for this transaction.
    db.execute(text("SET LOCAL hnsw.iterative_scan = strict_order"))

    distance = DocumentChunk.embedding.cosine_distance(query_embedding).label("distance")
    stmt = select(
        DocumentChunk.document_id,
        DocumentChunk.page_number,
        DocumentChunk.chunk_index,
        DocumentChunk.content,
        distance,
    ).where(DocumentChunk.user_id == user_id)
    if document_id is not None:
        stmt = stmt.where(DocumentChunk.document_id == document_id)
    rows = db.execute(stmt.order_by(distance).limit(limit)).all()
    if not rows:
        return []

    # Filenames in a second query keeps the vector query a plain index scan.
    names = dict(
        db.execute(
            select(Document.id, Document.filename).where(
                Document.user_id == user_id,
                Document.id.in_({row.document_id for row in rows}),
            )
        ).all()
    )
    return [
        SearchHit(
            document_id=row.document_id,
            filename=names[row.document_id],
            page_number=row.page_number,
            chunk_index=row.chunk_index,
            content=row.content,
            score=1.0 - row.distance,
        )
        for row in rows
    ]
