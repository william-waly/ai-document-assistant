import pytest

from app.services.chunking import chunk_pages
from app.services.pdf import PageText


def pages(*texts):
    return [PageText(i + 1, t) for i, t in enumerate(texts)]


def test_short_page_is_one_chunk():
    chunks = chunk_pages(pages("A short page."), max_chars=100, overlap=10)
    assert len(chunks) == 1
    assert chunks[0].text == "A short page."
    assert (chunks[0].page_number, chunks[0].chunk_index) == (1, 0)


def test_chunks_never_exceed_max_size():
    text = " ".join(f"Sentence number {i} is here." for i in range(200))
    chunks = chunk_pages(pages(text), max_chars=200, overlap=40)
    assert len(chunks) > 5
    assert all(len(c.text) <= 200 for c in chunks)


def test_chunks_never_cross_pages_and_keep_page_numbers():
    chunks = chunk_pages(pages("Alpha one. Alpha two.", "Beta one. Beta two."), max_chars=100, overlap=10)
    assert [c.page_number for c in chunks] == [1, 2]
    assert "Beta" not in chunks[0].text and "Alpha" not in chunks[1].text


def test_chunk_index_runs_across_the_whole_document():
    text = " ".join(f"Sentence {i} goes here." for i in range(50))
    chunks = chunk_pages(pages(text, text), max_chars=120, overlap=20)
    assert [c.chunk_index for c in chunks] == list(range(len(chunks)))


def test_consecutive_chunks_overlap():
    text = " ".join(f"Sentence number {i} is here." for i in range(40))
    chunks = chunk_pages(pages(text), max_chars=150, overlap=40)
    for prev, nxt in zip(chunks, chunks[1:], strict=False):  # pairs of neighbours
        last_words = prev.text.split()[-2:]
        assert " ".join(last_words) in nxt.text


def test_no_overlap_when_disabled():
    text = " ".join(f"Sentence number {i} is here." for i in range(40))
    chunks = chunk_pages(pages(text), max_chars=150, overlap=0)
    joined = " ".join(c.text for c in chunks)
    assert joined == " ".join(text.split())


def test_empty_pages_produce_no_chunks():
    chunks = chunk_pages(pages("", "   ", "Real text."), max_chars=100, overlap=10)
    assert [(c.page_number, c.text) for c in chunks] == [(3, "Real text.")]


def test_line_wraps_inside_a_paragraph_are_joined():
    chunks = chunk_pages(pages("This sentence was\nwrapped by the PDF\nlayout."), max_chars=200, overlap=0)
    assert chunks[0].text == "This sentence was wrapped by the PDF layout."


def test_text_without_spaces_is_hard_split():
    chunks = chunk_pages(pages("x" * 1000), max_chars=100, overlap=0)
    assert len(chunks) == 10
    assert all(len(c.text) == 100 for c in chunks)


def test_overlap_must_be_smaller_than_chunk_size():
    with pytest.raises(ValueError):
        chunk_pages(pages("text"), max_chars=100, overlap=100)
