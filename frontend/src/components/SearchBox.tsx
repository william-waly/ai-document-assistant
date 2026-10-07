import { useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { Link } from "react-router-dom";
import * as api from "../api";
import { percent, truncate } from "../format";
import Notice from "./Notice";

interface SearchBoxProps {
  /** Limit the search to one document. */
  documentId?: string;
  placeholder?: string;
}

/** Semantic search: finds passages by meaning, not by exact words. */
export default function SearchBox({ documentId, placeholder = "Søk i dokumentene dine…" }: SearchBoxProps) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<api.SearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const text = query.trim();
    if (!text) return;
    setLoading(true);
    setError(null);
    try {
      setHits(await api.search(text, 5, documentId));
    } catch (e) {
      setHits(null);
      setError(api.errorText(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form className="search-form" onSubmit={onSubmit} role="search">
        <label className="search-field">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            aria-label="Søk"
            value={query}
            maxLength={1000}
            placeholder={placeholder}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button type="submit" className="button button--primary" disabled={loading || !query.trim()}>
          {loading ? "Søker…" : "Søk"}
        </button>
      </form>

      {error && (
        <div className="modal-field-gap">
          <Notice kind="error">{error}</Notice>
        </div>
      )}

      {hits && hits.length === 0 && <p className="search-empty">Ingen treff. Last opp et dokument først?</p>}
      {hits && hits.length > 0 && (
        <ol className="search-results" aria-label="Søkeresultater">
          {hits.map((hit) => (
            <li key={`${hit.document_id}-${hit.chunk_index}`} className="search-result">
              <div className="search-result-head">
                <Link to={`/documents/${hit.document_id}`}>{hit.filename}</Link>
                <span className="page-pill">side {hit.page_number}</span>
                <span className="muted">relevans {percent(hit.score)}</span>
              </div>
              <p>{truncate(hit.content, 320)}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
