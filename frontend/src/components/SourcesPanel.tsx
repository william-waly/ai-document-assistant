import { FileText, PanelRightClose, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import type { SourceInfo } from "../api";

interface SourcesPanelProps {
  source: SourceInfo | null;
  onClose?: () => void;
  /** Rendered as a slide-in drawer on small screens. */
  mobile?: boolean;
}

export default function SourcesPanel({ source, onClose, mobile = false }: SourcesPanelProps) {
  return (
    <aside className={`sources-panel${mobile ? " sources-panel--drawer" : ""}`} aria-label="Kilder">
      <div className="sources-head">
        <div>
          <p className="eyebrow">DOKUMENTGRUNNLAG</p>
          <h2>Kilder</h2>
        </div>
        {onClose && (
          <button type="button" className="icon-button" aria-label="Lukk kilder" onClick={onClose}>
            <PanelRightClose size={18} />
          </button>
        )}
      </div>

      {source ? (
        <div className="source-detail-card">
          <div className="source-detail-title">
            <span className="file-icon file-icon--small">
              <FileText size={16} />
            </span>
            <strong>{source.filename}</strong>
          </div>
          <span className="page-pill">Side {source.page_number}</span>
          <p className="source-excerpt">«{source.snippet}»</p>
          <Link to={`/documents/${source.document_id}`} className="text-link">
            Åpne dokumentet <span aria-hidden="true">↗</span>
          </Link>
        </div>
      ) : (
        <div className="source-empty">
          <span className="source-empty-icon">
            <FileText size={19} />
          </span>
          <strong>Kildene vises her</strong>
          <p>Velg en kilde under et svar for å se nøyaktig side og utdrag.</p>
        </div>
      )}

      <div className="source-trust-note">
        <ShieldCheck size={15} aria-hidden="true" />
        <span>Kildene kommer fra søket i dokumentene dine, ikke fra det språkmodellen påstår.</span>
      </div>
    </aside>
  );
}
