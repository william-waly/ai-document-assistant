import { useMemo, useRef, useState } from "react";
import { ArrowDownWideNarrow, ArrowUpRight, CloudUpload, FileCheck2, FileText, LockKeyhole, Search, SlidersHorizontal, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import * as api from "../api";
import ConfirmDialog from "../components/ConfirmDialog";
import DocumentRow from "../components/DocumentRow";
import EmptyState from "../components/EmptyState";
import Notice from "../components/Notice";
import Spinner from "../components/Spinner";
import { useToast } from "../components/Toast";
import { formatBytes, retentionDays } from "../format";
import { useWorkspace } from "../workspace";

const MAX_MB = 20; // the backend enforces the real limit; this just saves a round trip

type Sort = "recent" | "name" | "large";

export default function Documents() {
  const { documents, loading, error, reload } = useWorkspace();
  const showToast = useToast();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [uploading, setUploading] = useState<string | null>(null); // file being processed
  const [problems, setProblems] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [toDelete, setToDelete] = useState<api.DocumentInfo | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = documents.filter((d) => d.filename.toLowerCase().includes(needle));
    return [...matches].sort((a, b) =>
      sort === "name"
        ? a.filename.localeCompare(b.filename, "nb")
        : sort === "large"
          ? b.size_bytes - a.size_bytes
          : new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [documents, query, sort]);

  const days = documents.length ? retentionDays(documents[0].created_at, documents[0].expires_at) : null;

  async function handleFiles(files: FileList | File[]) {
    const queue = Array.from(files);
    if (!queue.length) return;
    setProblems([]);
    const added: string[] = [];
    for (const file of queue) {
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
        added.push(file.name);
      } catch (e) {
        setProblems((p) => [...p, `«${file.name}»: ${api.errorText(e)}`]);
      }
    }
    setUploading(null);
    if (added.length) showToast(`Lastet opp: ${added.join(", ")}`);
    reload();
  }

  async function confirmDelete() {
    if (!toDelete) return;
    await api.deleteDocument(toDelete.id);
    showToast(`«${toDelete.filename}» er slettet.`);
    setToDelete(null);
    reload();
  }

  const busy = uploading !== null;

  return (
    <div className="page-stack">
      <div className="page-heading page-heading--split">
        <div>
          <p className="eyebrow">KUNNSKAPSBASEN DIN</p>
          <h1>Dokumenter</h1>
          <p className="page-subtitle">Hold referansefilene dine ryddige og klare til å utforske.</p>
        </div>
        <Link to="/chat" className="button button--primary">
          <span>Ny samtale</span>
          <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </div>

      <div
        className={`upload-zone${dragging ? " upload-zone--dragging" : ""}${busy ? " upload-zone--busy" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!busy) void handleFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={input}
          id="file-input"
          className="visually-hidden"
          type="file"
          accept="application/pdf,.pdf"
          multiple
          disabled={busy}
          aria-label="Velg PDF-filer"
          onChange={(e) => {
            if (e.target.files?.length) void handleFiles(e.target.files);
            e.target.value = ""; // allow choosing the same file again
          }}
        />
        <span className="upload-symbol">{busy ? <FileCheck2 size={22} /> : <CloudUpload size={23} />}</span>
        <div className="upload-copy">
          <h3>{busy ? `Behandler «${uploading}»…` : "Slipp PDF-en din her eller velg fil"}</h3>
          <p>
            {busy
              ? "Teksten leses og analyseres. Det kan ta litt tid."
              : `Bare PDF-filer. Maks ${MAX_MB} MB. Teksten må kunne markeres (skannede PDF-er støttes ikke).`}
          </p>
        </div>
        <button type="button" className="button button--secondary upload-browse" disabled={busy} onClick={() => input.current?.click()}>
          <FileText size={15} aria-hidden="true" /> Velg fil
        </button>
        <div className="upload-privacy">
          <LockKeyhole size={13} aria-hidden="true" />
          <span>Originalfilen lagres ikke. Bare tekst og søkedata beholdes.</span>
        </div>
      </div>

      {problems.length > 0 && (
        <div className="notice-stack">
          {problems.map((problem) => (
            <Notice key={problem} kind="error">
              {problem}
            </Notice>
          ))}
        </div>
      )}

      <section className="panel document-library">
        <div className="section-heading section-heading--with-controls">
          <div>
            <h2>
              Alle dokumenter <span className="heading-count">{documents.length}</span>
            </h2>
            <p>Søk i og administrer filene dine.</p>
          </div>
          <div className="document-controls">
            <label className="search-field">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                placeholder="Søk i dokumenter"
                aria-label="Søk i dokumenter"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <label className="sort-field">
              <SlidersHorizontal size={15} aria-hidden="true" />
              <span className="visually-hidden">Sorter dokumenter</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="recent">Nyeste</option>
                <option value="name">Navn A–Å</option>
                <option value="large">Største fil</option>
              </select>
              <ArrowDownWideNarrow size={14} className="sort-chevron" aria-hidden="true" />
            </label>
          </div>
        </div>

        {loading && <Spinner />}
        {error && (
          <div className="notice-stack">
            <Notice kind="error">{error}</Notice>
          </div>
        )}

        {!loading && !error && visible.length > 0 && (
          <>
            <div className="document-table-head" aria-hidden="true">
              <span>DOKUMENT</span>
              <span>STØRRELSE</span>
              <span>STATUS</span>
              <span />
            </div>
            <div className="document-list">
              {visible.map((document, index) => (
                <DocumentRow key={document.id} document={document} onDelete={setToDelete} index={index} />
              ))}
            </div>
          </>
        )}

        {!loading && !error && visible.length === 0 && (
          <EmptyState
            title={documents.length ? "Ingen dokumenter passer til søket." : "Ingen dokumenter ennå."}
            description={
              documents.length ? "Prøv et annet filnavn, eller tøm søket." : "Last opp en PDF for å ha den i ditt private arbeidsområde."
            }
            action={
              !documents.length ? (
                <button type="button" className="button button--primary" onClick={() => input.current?.click()}>
                  <Upload size={15} aria-hidden="true" /> Last opp ditt første dokument
                </button>
              ) : undefined
            }
          />
        )}

        <div className="library-footer">
          <span>{days ? `Dokumenter slettes automatisk ${days} dager etter opplasting.` : "Dokumenter beholdes til du sletter dem."}</span>
          <span>{formatBytes(documents.reduce((sum, d) => sum + d.size_bytes, 0))} totalt</span>
        </div>
      </section>

      <ConfirmDialog
        open={toDelete !== null}
        title="Slette dokumentet?"
        description="Dette kan ikke angres."
        confirmLabel="Slett"
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      >
        <p>
          <strong>{toDelete?.filename}</strong> slettes for godt, sammen med teksten og søkedataene som er laget av det.
          Kilder i samtaler som viser til dokumentet fjernes også.
        </p>
      </ConfirmDialog>
    </div>
  );
}
