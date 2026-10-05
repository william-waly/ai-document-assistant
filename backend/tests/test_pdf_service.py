import pytest

from app.config import settings
from app.services.pdf import PdfProcessingError, extract_pages, sanitize_filename
from tests.pdf_factory import make_pdf


def test_extracts_text_per_page_with_page_numbers():
    pages = extract_pages(make_pdf(["First page text", "Second page text"]))
    assert [p.page_number for p in pages] == [1, 2]
    assert "First page text" in pages[0].text
    assert "Second page text" in pages[1].text


def test_pdf_without_text_is_rejected():
    with pytest.raises(PdfProcessingError, match="No extractable text"):
        extract_pages(make_pdf([""]))


def test_garbage_is_rejected():
    with pytest.raises(PdfProcessingError):
        extract_pages(b"%PDF-1.4 this is not really a pdf")


def test_too_many_pages_is_rejected(monkeypatch):
    monkeypatch.setattr(settings, "max_pdf_pages", 2)
    with pytest.raises(PdfProcessingError, match="too many pages"):
        extract_pages(make_pdf(["a", "b", "c"]))


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("report.pdf", "report.pdf"),
        ("../../etc/passwd.pdf", "passwd.pdf"),
        ("C:\\Users\\bob\\notes.pdf", "notes.pdf"),
        ("evil\nname\x00.pdf", "evilname.pdf"),
        ("..", "document.pdf"),
        ("", "document.pdf"),
        (None, "document.pdf"),
    ],
)
def test_sanitize_filename(raw, expected):
    assert sanitize_filename(raw) == expected


def test_sanitize_filename_limits_length():
    assert len(sanitize_filename("a" * 1000 + ".pdf")) == 255
