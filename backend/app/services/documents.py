from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import Document

# Removes this document from the "sources" of the owner's chat messages.
_PRUNE_SOURCES = text(
    """
    UPDATE messages
    SET sources = COALESCE(
        (SELECT jsonb_agg(s) FROM jsonb_array_elements(sources) AS s
         WHERE s->>'document_id' <> CAST(:doc AS text)),
        '[]'::jsonb)
    WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = :uid)
      AND sources @> jsonb_build_array(jsonb_build_object('document_id', CAST(:doc AS text)))
    """
)


def delete_document(db: Session, document: Document) -> None:
    """The ONE way documents are deleted (API and retention job).

    Chunks and embeddings go via ON DELETE CASCADE. Chat messages keep a copy of
    their sources (filename, page, text snippet), so those copies are removed
    too. Otherwise document text would outlive the document.
    """
    db.execute(_PRUNE_SOURCES, {"doc": str(document.id), "uid": document.user_id})
    db.delete(document)
    db.commit()
