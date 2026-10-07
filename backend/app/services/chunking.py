"""Splits page text into overlapping chunks, never crossing a page boundary.

Keeping chunks inside one page is what makes the citation exact: every chunk
has ONE page number, so "file.pdf - page 12" is always correct.

Strategy (simple on purpose): split into sentences, then pack sentences into
chunks of at most `max_chars`. Each new chunk starts with the tail of the
previous one (overlap) so an idea cut at a boundary is still found by search.
"""
import re
from dataclasses import dataclass

from app.config import settings
from app.services.pdf import PageText

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")
_PARAGRAPH_SPLIT = re.compile(r"\n\s*\n")


@dataclass(frozen=True)
class Chunk:
    page_number: int
    chunk_index: int  # position within the whole document, starts at 0
    text: str


def _units(page_text: str, max_chars: int) -> list[str]:
    """Sentences, with anything longer than max_chars cut at word boundaries."""
    units: list[str] = []
    for paragraph in _PARAGRAPH_SPLIT.split(page_text):
        paragraph = " ".join(paragraph.split())  # joins hard line-wraps from the PDF
        for sentence in _SENTENCE_SPLIT.split(paragraph):
            while len(sentence) > max_chars:
                cut = sentence.rfind(" ", 0, max_chars)
                if cut <= 0:  # one giant "word": cut it hard
                    cut = max_chars
                units.append(sentence[:cut])
                sentence = sentence[cut:].lstrip()
            if sentence:
                units.append(sentence)
    return units


def _tail(text: str, overlap: int) -> str:
    """Last `overlap` characters, trimmed so it doesn't start mid-word."""
    if overlap <= 0:
        return ""
    if len(text) <= overlap:
        return text
    tail = text[-overlap:]
    space = tail.find(" ")
    return tail[space + 1 :] if space != -1 else tail


def _pack(units: list[str], max_chars: int, overlap: int) -> list[str]:
    chunks: list[str] = []
    current = ""
    for unit in units:
        candidate = f"{current} {unit}" if current else unit
        if len(candidate) <= max_chars:
            current = candidate
            continue
        chunks.append(current)
        prefix = _tail(current, overlap)
        current = f"{prefix} {unit}" if prefix else unit
        if len(current) > max_chars:  # overlap + unit doesn't fit: skip the overlap
            current = unit
    if current:
        chunks.append(current)
    return chunks


def chunk_pages(
    pages: list[PageText],
    max_chars: int | None = None,
    overlap: int | None = None,
) -> list[Chunk]:
    max_chars = max_chars or settings.chunk_size
    overlap = settings.chunk_overlap if overlap is None else overlap
    if overlap >= max_chars:
        raise ValueError("chunk overlap must be smaller than chunk size")

    chunks: list[Chunk] = []
    for page in pages:
        for text in _pack(_units(page.text, max_chars), max_chars, overlap):
            chunks.append(Chunk(page.page_number, len(chunks), text))
    return chunks
