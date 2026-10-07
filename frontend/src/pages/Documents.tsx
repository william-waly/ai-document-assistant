import { useRef, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import * as api from "../api";
import Alert from "../components/Alert";
import ConfirmDialog from "../components/ConfirmDialog";
import Spinner from "../components/Spinner";
import { formatBytes, formatDate } from "../format";
import { useLoad } from "../hooks";

const MAX_MB = 20; // the backend enforces the real limit; this just saves a round trip

export default function Documents() {
  const { data, error, loading, reload } = useLoad(api.listDocuments);
  const [uploading, setUploading] = useState<string | null>(null); // filename being processed
  const [problems, setProblems] = useState<string[]>([]);
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [toDelete, setToDelete] = useState<api.DocumentInfo | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | File[]) {
    setProblems([]);
    setUploaded([]);
    for (const file of Array.from(files)) {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        setProblems((p) => [...p, `«${file.name}» er ikke en PDF-fil.`]);
        continue;
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        setProblems((p) => [...p, `«${file.name}» er større enn ${MAX_MB} MB.`]);
        continue;
      }
      setUploading(file.name);
      try {
        await api.uploadDocument(file);
        setUploaded((u) => [...u, file.name]);
      } catch (e) {
        setProblems((p) => [...p, `«${file.name}»: ${api.errorText(e)}`]);
      }
    }
    setUploading(null);
    reload();
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (!uploading && event.dataTransfer.files.length) void handleFiles(event.dataTransfer.files);
  }

  async function confirmDelete() {
    if (!toDelete) return;
    await api.deleteDocument(toDelete.id);
    setToDelete(null);
    reload();
  }

  return (
    <>
      <h1>Dokumenter</h1>

      <section
        className={`dropzone${dragging ? " dropzone-active" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {uploading ? (
          <Spinner label={`Behandler «${uploading}»… Teksten leses og analyseres, det kan ta litt tid.`} />
        ) : (
          <>
            <p>
              <strong>Dra en PDF hit</strong> eller velg fil
            </p>
            <input
              ref={input}
              id="file-input"
              className="sr-only"
              type="file"
              accept="application/pdf,.pdf"
              multiple
              onChange={(e) => {
                if (e.target.files?.length) void handleFiles(e.target.files);
                e.target.value = ""; // allow choosing the same file again
              }}
            />
            <button type="button" className="btn btn-primary" onClick={() => input.current?.click()}>
              Velg PDF
            </button>
            <p className="hint">Maks {MAX_MB} MB. Teksten må kunne markeres (skannede PDF-er støttes ikke).</p>
          </>
        )}
      </section>

      {uploaded.length > 0 && <Alert kind="success">Lastet opp: {uploaded.join(", ")}</Alert>}
      {problems.map((problem) => (
        <Alert key={problem} kind="error">
          {problem}
        </Alert>
      ))}

      <section className="card">
        <h2>Mine dokumenter</h2>
        {loading && !data && <Spinner />}
        {error && <Alert kind="error">{error}</Alert>}
        {data && data.length === 0 && <p className="muted">Ingen dokumenter ennå.</p>}
        {data && data.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Filnavn</th>
                  <th className="num">Sider</th>
                  <th className="num">Størrelse</th>
                  <th>Lastet opp</th>
                  <th className="hide-small">Slettes automatisk</th>
                  <th>
                    <span className="sr-only">Handlinger</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <Link to={`/documents/${doc.id}`}>{doc.filename}</Link>
                    </td>
                    <td className="num">{doc.page_count ?? "–"}</td>
                    <td className="num">{formatBytes(doc.size_bytes)}</td>
                    <td>{formatDate(doc.created_at)}</td>
                    <td className="hide-small">{doc.expires_at ? formatDate(doc.expires_at) : "aldri"}</td>
                    <td className="actions">
                      <button type="button" className="btn btn-danger-ghost" onClick={() => setToDelete(doc)}>
                        Slett
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={toDelete !== null}
        title="Slette dokumentet?"
        confirmLabel="Slett"
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      >
        <p>
          «{toDelete?.filename}» slettes for godt, sammen med teksten og embeddingene som er laget av det. Kilder i
          samtaler som viser til dokumentet fjernes også.
        </p>
      </ConfirmDialog>
    </>
  );
}
