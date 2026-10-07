import { useState } from "react";
import { ArrowLeft, FileText, MessageSquareText, ShieldCheck, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as api from "../api";
import ConfirmDialog from "../components/ConfirmDialog";
import Notice from "../components/Notice";
import SearchBox from "../components/SearchBox";
import Spinner from "../components/Spinner";
import StatusBadge from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { formatBytes, formatDate, formatDateTime } from "../format";
import { useLoad } from "../hooks";
import { useWorkspace } from "../workspace";

export default function DocumentDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const showToast = useToast();
  const { reload } = useWorkspace();
  const { data: doc, error, loading } = useLoad(() => api.getDocument(id), [id]);
  const [confirming, setConfirming] = useState(false);

  async function remove() {
    await api.deleteDocument(id);
    showToast("Dokumentet er slettet.");
    reload();
    navigate("/documents", { replace: true });
  }

  return (
    <div className="page-stack">
      <Link className="back-link" to="/documents">
        <ArrowLeft size={15} aria-hidden="true" /> Alle dokumenter
      </Link>

      {loading && <Spinner />}
      {error && (
        <Notice kind="error">
          {error} <Link to="/documents">Tilbake til dokumentene</Link>
        </Notice>
      )}

      {doc && (
        <>
          <div className="page-heading page-heading--split document-detail-heading">
            <div className="detail-title-group">
              <span className="file-icon file-icon--large">
                <FileText size={21} />
              </span>
              <div>
                <p className="eyebrow">DOKUMENTINFORMASJON</p>
                <h1>{doc.filename}</h1>
                <p className="page-subtitle">Lastet opp {formatDate(doc.created_at)}</p>
              </div>
            </div>
            <div className="detail-actions">
              <Link to={`/chat?doc=${doc.id}`} className="button button--primary">
                <MessageSquareText size={15} aria-hidden="true" /> Start samtale
              </Link>
              <button
                type="button"
                className="icon-button danger-icon"
                aria-label="Slett dokumentet"
                onClick={() => setConfirming(true)}
              >
                <Trash2 size={17} />
              </button>
            </div>
          </div>

          <div className="document-detail-grid">
            <section className="panel search-panel">
              <div className="section-heading">
                <div>
                  <h2>Søk i dette dokumentet</h2>
                  <p>Finn passasjer etter betydning. Treffene viser side og utdrag.</p>
                </div>
                <span className="page-pill">{doc.page_count ?? "–"} sider</span>
              </div>
              <SearchBox documentId={doc.id} placeholder="Hva leter du etter i dette dokumentet?" />
            </section>

            <aside className="panel detail-info-panel">
              <div className="section-heading">
                <div>
                  <h2>Filinformasjon</h2>
                  <p>Detaljer om dokumentet.</p>
                </div>
              </div>
              <dl className="metadata-list">
                <div>
                  <dt>Filnavn</dt>
                  <dd>{doc.filename}</dd>
                </div>
                <div>
                  <dt>Størrelse</dt>
                  <dd>{formatBytes(doc.size_bytes)}</dd>
                </div>
                <div>
                  <dt>Sider</dt>
                  <dd>{doc.page_count ?? "Ikke tilgjengelig"}</dd>
                </div>
                <div>
                  <dt>Lastet opp</dt>
                  <dd>{formatDateTime(doc.created_at)}</dd>
                </div>
                <div>
                  <dt>Slettes automatisk</dt>
                  <dd>{doc.expires_at ? formatDateTime(doc.expires_at) : "aldri"}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <StatusBadge status={doc.status} />
                  </dd>
                </div>
              </dl>
              <div className="processing-note">
                <span className="processing-note-dot" />
                <div>
                  <strong>Tekst og søkedata lagret</strong>
                  <p>
                    Selve PDF-filen lagres ikke, så den kan ikke lastes ned eller forhåndsvises. Bare tekstutdrag og
                    søkedata beholdes, til du sletter dokumentet eller fristen over utløper.
                  </p>
                </div>
              </div>
              <div className="privacy-card">
                <ShieldCheck size={16} aria-hidden="true" />
                <div>
                  <strong>Personvern som standard</strong>
                  <p>Teksten behandles av en lokal AI-modell og sendes ikke til eksterne tjenester.</p>
                </div>
              </div>
            </aside>
          </div>

          <ConfirmDialog
            open={confirming}
            title="Slette dokumentet?"
            description="Dette kan ikke angres."
            confirmLabel="Slett dokumentet"
            onConfirm={remove}
            onCancel={() => setConfirming(false)}
          >
            <p>
              <strong>{doc.filename}</strong> slettes for godt, sammen med teksten og søkedataene som er laget av det.
            </p>
          </ConfirmDialog>
        </>
      )}
    </div>
  );
}
