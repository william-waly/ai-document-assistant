from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.rate_limit import limiter
from app.schemas import SearchRequest, SearchResult
from app.services.embeddings import EmbeddingError, EmbeddingProvider, get_embedding_provider
from app.services.search import search_chunks

router = APIRouter(prefix="/search", tags=["search"])


@router.post("", response_model=list[SearchResult])
@limiter.limit(settings.search_rate_limit)
def search(
    request: Request,
    body: SearchRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    embedder: EmbeddingProvider = Depends(get_embedding_provider),
):
    """Semantic search in the caller's own documents, most relevant first."""
    try:
        query_embedding = embedder.embed_query(body.query)
    except EmbeddingError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc))

    # The user id comes from the verified token, never from the request body.
    hits = search_chunks(db, user.id, query_embedding, body.limit, body.document_id)
    return [SearchResult(**asdict(hit)) for hit in hits]
