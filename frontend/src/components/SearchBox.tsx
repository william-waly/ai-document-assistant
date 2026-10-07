import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import * as api from "../api";
import { percent, truncate } from "../format";
import Alert from "./Alert";

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
        <label htmlFor="search-input" className="sr-only">
          Søk
        </label>
        <input
          id="search-input"
          type="search"
          value={query}
          maxLength={1000}
          placeholder={placeholder}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={loading || !query.trim()}>
          {loading ? "Søker…" : "Søk"}
        </button>
      </form>

      {error && <Alert kind="error">{error}</Alert>}

      {hits && hits.length === 0 && <p className="muted">Ingen treff. Last opp et dokument først?</p>}
      {hits && hits.length > 0 && (
        <ol className="results" aria-label="Søkeresultater">
          {hits.map((hit) => (
            <li key={`${hit.document_id}-${hit.chunk_index}`} className="result">
              <div className="result-head">
                <Link to={`/documents/${hit.document_id}`}>{hit.filename}</Link>
                <span className="badge">side {hit.page_number}</span>
                <span className="muted small">relevans {percent(hit.score)}</span>
              </div>
              <p className="snippet">{truncate(hit.content, 320)}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
