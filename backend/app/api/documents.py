import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import Document, DocumentChunk, User
from app.rate_limit import limiter
from app.schemas import DocumentOut
from app.services.chunking import chunk_pages
from app.services.embeddings import EmbeddingError, EmbeddingProvider, get_embedding_provider
from app.services.pdf import PDF_MAGIC, PdfProcessingError, extract_pages, sanitize_filename

router = APIRouter(prefix="/documents", tags=["documents"])

# Multipart framing adds some bytes on top of the file itself.
_MULTIPART_OVERHEAD = 64 * 1024


def _get_owned_document(db: Session, user: User, document_id: uuid.UUID) -> Document:
    """Every lookup is scoped by user_id. Someone else's document looks exactly
    like a missing one (404, not 403), so ids can't be probed."""
    doc = db.scalar(
        select(Document).where(Document.id == document_id, Document.user_id == user.id)
    )
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    return doc


@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.upload_rate_limit)
def upload_document(
    request: Request,
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    embedder: EmbeddingProvider = Depends(get_embedding_provider),
):
    filename = sanitize_filename(file.filename)
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Only PDF files are allowed")

    # Cheap early rejection. The header can lie, so the real check is below.
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > settings.max_upload_bytes + _MULTIPART_OVERHEAD:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File too large")

    data = file.file.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"File too large (max {settings.max_upload_mb} MB)",
        )

    # Trust the content, not the extension or the client's Content-Type.
    if not data.startswith(PDF_MAGIC):
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "File is not a valid PDF")

    try:
        pages = extract_pages(data)
    except PdfProcessingError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))

    chunks = chunk_pages(pages)
    # Embed BEFORE touching the database: if the embedding service fails, nothing
    # has been written and there is nothing to clean up.
    try:
        vectors = embedder.embed_documents([c.text for c in chunks])
    except EmbeddingError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc))

    # Data minimisation: the original file is never written to disk. We keep
    # metadata + chunks + embeddings, all in ONE transaction (all or nothing).
    document = Document(
        user_id=user.id,
        filename=filename,
        size_bytes=len(data),
        page_count=len(pages),
        status="ready",
    )
    db.add(document)
    db.flush()  # assigns document.id
    db.add_all(
        DocumentChunk(
            document_id=document.id,
            user_id=user.id,
            page_number=chunk.page_number,
            chunk_index=chunk.chunk_index,
            content=chunk.text,
            embedding=vector,
        )
        for chunk, vector in zip(chunks, vectors)
    )
    db.commit()
    return document


@router.get("", response_model=list[DocumentOut])
def list_documents(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(
        select(Document).where(Document.user_id == user.id).order_by(Document.created_at.desc())
    ).all()


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(
    document_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _get_owned_document(db, user, document_id)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Chunks and embeddings are removed by ON DELETE CASCADE."""
    db.delete(_get_owned_document(db, user, document_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
