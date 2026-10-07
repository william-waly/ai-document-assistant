import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as api from "../api";
import Alert from "../components/Alert";
import ConfirmDialog from "../components/ConfirmDialog";
import SearchBox from "../components/SearchBox";
import Spinner from "../components/Spinner";
import { formatBytes, formatDateTime } from "../format";
import { useLoad } from "../hooks";

export default function DocumentDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: doc, error, loading } = useLoad(() => api.getDocument(id), [id]);
  const [confirming, setConfirming] = useState(false);

  async function remove() {
    await api.deleteDocument(id);
    navigate("/documents", { replace: true });
  }

  return (
    <>
      <p>
        <Link to="/documents">← Alle dokumenter</Link>
      </p>

      {loading && <Spinner />}
      {error && <Alert kind="error">{error}</Alert>}

      {doc && (
        <>
          <div className="section-head">
            <h1 className="break">{doc.filename}</h1>
            <button type="button" className="btn btn-danger" onClick={() => setConfirming(true)}>
              Slett dokument
            </button>
          </div>

          <section className="card">
            <h2>Informasjon</h2>
            <dl className="meta">
              <dt>Status</dt>
              <dd>
                <span className={`badge ${doc.status === "ready" ? "badge-ok" : ""}`}>
                  {doc.status === "ready" ? "Klar" : doc.status}
                </span>
              </dd>
              <dt>Sider</dt>
              <dd>{doc.page_count ?? "–"}</dd>
              <dt>Størrelse</dt>
              <dd>{formatBytes(doc.size_bytes)}</dd>
              <dt>Lastet opp</dt>
              <dd>{formatDateTime(doc.created_at)}</dd>
              <dt>Slettes automatisk</dt>
              <dd>{doc.expires_at ? formatDateTime(doc.expires_at) : "aldri"}</dd>
            </dl>
            <p className="hint">
              Selve PDF-filen lagres ikke. Bare tekstutdrag og søkedata beholdes, til du sletter dokumentet eller
              fristen over utløper.
            </p>
          </section>

          <section className="card">
            <h2>Søk i dette dokumentet</h2>
            <SearchBox documentId={doc.id} placeholder="Hva leter du etter i dette dokumentet?" />
          </section>

          <ConfirmDialog
            open={confirming}
            title="Slette dokumentet?"
            confirmLabel="Slett"
            onConfirm={remove}
            onCancel={() => setConfirming(false)}
          >
            <p>
              «{doc.filename}» slettes for godt, sammen med teksten og embeddingene som er laget av det.
            </p>
          </ConfirmDialog>
        </>
      )}
    </>
  );
}
