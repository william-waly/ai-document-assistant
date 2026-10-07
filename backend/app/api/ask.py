from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.rate_limit import limiter
from app.schemas import AskRequest, AskResponse, SourceOut
from app.services.embeddings import EmbeddingError, EmbeddingProvider, get_embedding_provider
from app.services.llm import LLMError, LLMProvider, get_llm_provider
from app.services.rag import answer_question

router = APIRouter(prefix="/ask", tags=["ask"])


@router.post("", response_model=AskResponse)
@limiter.limit(settings.llm_rate_limit)
def ask(
    request: Request,
    body: AskRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    embedder: EmbeddingProvider = Depends(get_embedding_provider),
    llm: LLMProvider = Depends(get_llm_provider),
):
    """One-shot question over the caller's own documents. Phase 7 adds
    conversations on top of the same `answer_question` function."""
    try:
        result = answer_question(db, user.id, body.question, embedder, llm, body.document_id)
    except (EmbeddingError, LLMError) as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc))
    return AskResponse(
        answer=result.answer,
        answered=result.answered,
        sources=[SourceOut(**asdict(s)) for s in result.sources],
    )
