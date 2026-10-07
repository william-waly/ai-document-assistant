import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


def _normalise_email(v: str) -> str:
    return v.strip().lower()


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)

    _lower_email = field_validator("email")(_normalise_email)

    @field_validator("password")
    @classmethod
    def password_fits_bcrypt(cls, v: str) -> str:
        # bcrypt only uses the first 72 BYTES; reject instead of silently truncating.
        if len(v.encode()) > 72:
            raise ValueError("Password must be at most 72 bytes")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)

    _lower_email = field_validator("email")(_normalise_email)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    filename: str
    size_bytes: int
    page_count: int | None
    status: str
    created_at: datetime


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=1000)
    limit: int = Field(default=5, ge=1, le=20)
    document_id: uuid.UUID | None = None  # optional: search inside one document

    @field_validator("query")
    @classmethod
    def query_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Query must not be blank")
        return v


class SearchResult(BaseModel):
    document_id: uuid.UUID
    filename: str
    page_number: int
    chunk_index: int
    content: str
    score: float  # cosine similarity: 1.0 = identical meaning, ~0 = unrelated


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    document_id: uuid.UUID | None = None

    @field_validator("question")
    @classmethod
    def question_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Question must not be blank")
        return v


class SourceOut(BaseModel):
    ref: int
    document_id: uuid.UUID
    filename: str
    page_number: int
    snippet: str
    score: float


class AskResponse(BaseModel):
    answer: str
    answered: bool
    sources: list[SourceOut]


class ConversationCreate(BaseModel):
    title: str | None = Field(default=None, max_length=200)

    @field_validator("title")
    @classmethod
    def blank_title_is_none(cls, v: str | None) -> str | None:
        return (v or "").strip() or None


class ConversationOut(BaseModel):
    id: uuid.UUID
    title: str
    created_at: datetime
    message_count: int = 0
    last_message_at: datetime | None = None


class MessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=1000)
    document_id: uuid.UUID | None = None  # optional: limit this question to one document

    @field_validator("content")
    @classmethod
    def content_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Message must not be blank")
        return v


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role: str
    content: str
    sources: list[SourceOut] = []
    created_at: datetime

    @field_validator("sources", mode="before")
    @classmethod
    def no_sources_is_empty_list(cls, v):
        return v or []


class ConversationDetail(BaseModel):
    id: uuid.UUID
    title: str
    created_at: datetime
    messages: list[MessageOut]


class MessageExchange(BaseModel):
    user_message: MessageOut
    assistant_message: MessageOut


class UserOut(BaseModel):
    """Public view of a user. Never includes password_hash."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    created_at: datetime
