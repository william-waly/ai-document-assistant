import uuid
from dataclasses import asdict
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import Conversation, Message, User
from app.rate_limit import limiter
from app.schemas import (
    ConversationCreate,
    ConversationDetail,
    ConversationOut,
    MessageExchange,
    MessageIn,
    MessageOut,
)
from app.services.embeddings import EmbeddingError, EmbeddingProvider, get_embedding_provider
from app.services.llm import LLMError, LLMProvider, get_llm_provider
from app.services.rag import Turn, answer_question

router = APIRouter(prefix="/conversations", tags=["conversations"])

DEFAULT_TITLE = "Ny samtale"
_TITLE_CHARS = 60

# One canonical order: oldest first, and within the same instant the user's
# message before the answer ('user' sorts after 'assistant', hence DESC).
_CHRONOLOGICAL = (Message.created_at.asc(), Message.role.desc())


def _get_owned_conversation(db: Session, user: User, conversation_id: uuid.UUID) -> Conversation:
    """Scoped by user_id: someone else's conversation looks exactly like a missing one."""
    conversation = db.scalar(
        select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user.id)
    )
    if conversation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return conversation


def _title_from(text: str) -> str:
    line = text.strip().splitlines()[0]
    return line if len(line) <= _TITLE_CHARS else line[: _TITLE_CHARS - 1].rstrip() + "…"


@router.post("", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
def create_conversation(
    body: ConversationCreate | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conversation = Conversation(user_id=user.id, title=(body.title if body else None) or DEFAULT_TITLE)
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return ConversationOut(id=conversation.id, title=conversation.title, created_at=conversation.created_at)


@router.get("", response_model=list[ConversationOut])
def list_conversations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Most recently active first."""
    last_message = func.max(Message.created_at)
    rows = db.execute(
        select(Conversation, func.count(Message.id), last_message)
        .outerjoin(Message, Message.conversation_id == Conversation.id)
        .where(Conversation.user_id == user.id)
        .group_by(Conversation.id)
        .order_by(func.coalesce(last_message, Conversation.created_at).desc())
    ).all()
    return [
        ConversationOut(
            id=c.id, title=c.title, created_at=c.created_at, message_count=count, last_message_at=last
        )
        for c, count, last in rows
    ]


@router.get("/{conversation_id}", response_model=ConversationDetail)
def get_conversation(
    conversation_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conversation = _get_owned_conversation(db, user, conversation_id)
    messages = db.scalars(
        select(Message).where(Message.conversation_id == conversation.id).order_by(*_CHRONOLOGICAL)
    ).all()
    return ConversationDetail(
        id=conversation.id,
        title=conversation.title,
        created_at=conversation.created_at,
        messages=[MessageOut.model_validate(m) for m in messages],
    )


@router.post(
    "/{conversation_id}/messages", response_model=MessageExchange, status_code=status.HTTP_201_CREATED
)
@limiter.limit(settings.llm_rate_limit)
def send_message(
    request: Request,
    conversation_id: uuid.UUID,
    body: MessageIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    embedder: EmbeddingProvider = Depends(get_embedding_provider),
    llm: LLMProvider = Depends(get_llm_provider),
):
    """Asks a question in this conversation and stores both the question and the answer."""
    conversation = _get_owned_conversation(db, user, conversation_id)
    received_at = datetime.now(UTC)

    recent = db.scalars(
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.created_at.desc(), Message.role.asc())
        .limit(settings.chat_history_messages)
    ).all()
    history = [Turn(m.role, m.content) for m in reversed(recent)]

    # Everything that can fail runs BEFORE anything is written, so a failed
    # request leaves the conversation exactly as it was and can simply be retried.
    try:
        result = answer_question(db, user.id, body.content, embedder, llm, body.document_id, history)
    except (EmbeddingError, LLMError) as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc

    answered_at = max(datetime.now(UTC), received_at + timedelta(microseconds=1))
    user_message = Message(
        conversation_id=conversation.id, role="user", content=body.content, created_at=received_at
    )
    assistant_message = Message(
        conversation_id=conversation.id,
        role="assistant",
        content=result.answer,
        sources=[{**asdict(s), "document_id": str(s.document_id)} for s in result.sources],
        created_at=answered_at,
    )
    db.add_all([user_message, assistant_message])
    if not history:
        conversation.title = _title_from(body.content)
    db.commit()
    return MessageExchange(
        user_message=MessageOut.model_validate(user_message),
        assistant_message=MessageOut.model_validate(assistant_message),
    )


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    conversation_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Messages are removed by ON DELETE CASCADE."""
    db.delete(_get_owned_conversation(db, user, conversation_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
