"""HNSW index for cosine similarity search on chunk embeddings

Revision ID: 0002
Revises: 0001

Without an index, every search compares the query with EVERY chunk (exact but
O(n)). HNSW is an approximate graph index: much faster at scale, tiny recall loss.
Defaults m=16, ef_construction=64 are fine for this size.
"""
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX ix_document_chunks_embedding_hnsw "
        "ON document_chunks USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX ix_document_chunks_embedding_hnsw")
