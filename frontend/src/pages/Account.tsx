import { useState } from "react";
import { useNavigate } from "react-router-dom";
import * as api from "../api";
import { useAuth } from "../auth";
import Alert from "../components/Alert";
import ConfirmDialog from "../components/ConfirmDialog";
import { formatDate } from "../format";

type Action = "erase" | "delete" | null;

export default function Account() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [action, setAction] = useState<Action>(null);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(includeText: boolean) {
    setExporting(true);
    setError(null);
    try {
      const blob = await api.exportMyData(includeText);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "mine-data.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(api.errorText(e));
    } finally {
      setExporting(false);
    }
  }

  async function erase(password: string) {
    const result = await api.deleteMyData(password);
    setAction(null);
    setMessage(`Slettet ${result.documents} dokument(er) og ${result.conversations} samtale(r).`);
  }

  async function deleteAccount(password: string) {
    await api.deleteAccount(password);
    setAction(null);
    logout("Kontoen din og alle dataene er slettet.");
    navigate("/login", { replace: true });
  }

  return (
    <>
      <h1>Konto og personvern</h1>

      <section className="card">
        <h2>Din konto</h2>
        <dl className="meta">
          <dt>E-post</dt>
          <dd>{user?.email}</dd>
          <dt>Opprettet</dt>
          <dd>{user ? formatDate(user.created_at) : ""}</dd>
        </dl>
      </section>

      {message && <Alert kind="success">{message}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      <section className="card">
        <h2>Last ned dataene mine</h2>
        <p className="muted">
          Få alt vi har lagret om deg som en JSON-fil: kontoen, dokumentene (metadata), samtalene og kildene.
        </p>
        <div className="row">
          <button type="button" className="btn" disabled={exporting} onClick={() => void download(false)}>
            Last ned
          </button>
          <button type="button" className="btn" disabled={exporting} onClick={() => void download(true)}>
            Last ned, med dokumenttekst
          </button>
        </div>
      </section>

      <section className="card card-danger">
        <h2>Slett dataene mine</h2>
        <p className="muted">
          Fjerner alle dokumenter, søkedata og samtaler. Kontoen din beholdes, så du kan begynne på nytt.
        </p>
        <button type="button" className="btn btn-danger" onClick={() => setAction("erase")}>
          Slett alle dataene mine
        </button>
      </section>

      <section className="card card-danger">
        <h2>Slett kontoen</h2>
        <p className="muted">Sletter kontoen og alt som hører til den. Dette kan ikke angres.</p>
        <button type="button" className="btn btn-danger" onClick={() => setAction("delete")}>
          Slett kontoen min
        </button>
      </section>

      <ConfirmDialog
        open={action === "erase"}
        title="Slette alle dataene dine?"
        confirmLabel="Slett alt"
        requirePassword
        onConfirm={erase}
        onCancel={() => setAction(null)}
      >
        <p>Alle dokumenter, embeddinger og samtaler slettes for godt. Kontoen din beholdes.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={action === "delete"}
        title="Slette kontoen?"
        confirmLabel="Slett kontoen"
        requirePassword
        onConfirm={deleteAccount}
        onCancel={() => setAction(null)}
      >
        <p>Kontoen og alle dataene dine slettes for godt. Dette kan ikke angres.</p>
      </ConfirmDialog>
    </>
  );
}
