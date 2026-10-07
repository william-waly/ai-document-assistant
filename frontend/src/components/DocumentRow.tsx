import { FileText, MoreHorizontal, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { DocumentInfo } from "../api";
import { formatBytes, formatDate } from "../format";
import StatusBadge from "./StatusBadge";

interface DocumentRowProps {
  document: DocumentInfo;
  onDelete?: (document: DocumentInfo) => void;
  compact?: boolean;
  /** Zero-based position, shown as "01", "02" ... in the editorial list style. */
  index?: number;
}

export default function DocumentRow({ document, onDelete, compact = false, index }: DocumentRowProps) {
  return (
    <div className={`document-row${compact ? " document-row--compact" : ""}`}>
      <Link className="document-main" to={`/documents/${document.id}`}>
        {index !== undefined && (
          <span className="row-index" aria-hidden="true">
            {String(index + 1).padStart(2, "0")}
          </span>
        )}
        <span className="file-icon">
          <FileText size={19} />
        </span>
        <span className="document-name-group">
          <span className="document-name">{document.filename}</span>
          <span className="document-subtitle">
            {formatDate(document.created_at)} <span>·</span> {document.page_count ?? "–"} sider
          </span>
        </span>
      </Link>
      {!compact && <span className="document-file-size">{formatBytes(document.size_bytes)}</span>}
      <span className="document-status">
        <StatusBadge status={document.status} />
      </span>
      {onDelete ? (
        <button
          type="button"
          className="icon-button row-action"
          title={`Slett ${document.filename}`}
          aria-label={`Slett ${document.filename}`}
          onClick={() => onDelete(document)}
        >
          <Trash2 size={16} />
        </button>
      ) : (
        <Link className="icon-button row-action" to={`/documents/${document.id}`} aria-label={`Åpne ${document.filename}`}>
          <MoreHorizontal size={18} />
        </Link>
      )}
    </div>
  );
}
