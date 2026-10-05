import io
import re
from dataclasses import dataclass
from pathlib import PurePosixPath

from pypdf import PdfReader

from app.config import settings

PDF_MAGIC = b"%PDF-"
_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")


class PdfProcessingError(Exception):
    """The PDF is unusable. The message is safe to show to the user."""


@dataclass(frozen=True)
class PageText:
    page_number: int  # 1-based, so it can be shown directly as a citation
    text: str


def sanitize_filename(raw: str | None) -> str:
    """The name is only ever stored as a label, never used as a file path.

    Still stripped of directories and control characters, so it can't smuggle
    "../" or newlines into the database, logs or the UI.
    """
    name = PurePosixPath((raw or "").replace("\\", "/")).name
    name = _CONTROL_CHARS.sub("", name).strip()
    if not name or name in {".", ".."}:
        return "document.pdf"
    return name[:255]


def _clean(text: str) -> str:
    # PostgreSQL TEXT cannot contain NUL bytes, and PDFs sometimes produce them.
    text = text.replace("\x00", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_pages(data: bytes) -> list[PageText]:
    """Extracts text per page. Raises PdfProcessingError for unusable files."""
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise PdfProcessingError("Encrypted PDFs are not supported")
        page_total = len(reader.pages)
        if page_total == 0:
            raise PdfProcessingError("The PDF has no pages")
        if page_total > settings.max_pdf_pages:
            raise PdfProcessingError(
                f"The PDF has too many pages (max {settings.max_pdf_pages})"
            )
        pages = [
            PageText(page_number=i + 1, text=_clean(page.extract_text() or ""))
            for i, page in enumerate(reader.pages)
        ]
    except PdfProcessingError:
        raise
    except Exception as exc:  # pypdf raises many different error types on bad input
        raise PdfProcessingError("Could not read the PDF file") from exc

    if not any(p.text for p in pages):
        raise PdfProcessingError(
            "No extractable text found (scanned PDF? OCR is not supported)"
        )
    return pages
