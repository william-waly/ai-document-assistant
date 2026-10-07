import { useMemo, useState } from "react";
import { MessageSquarePlus, Search } from "lucide-react";
import { Link } from "react-router-dom";
import * as api from "../api";
import ConfirmDialog from "../components/ConfirmDialog";
import ConversationRow from "../components/ConversationRow";
import EmptyState from "../components/EmptyState";
import Notice from "../components/Notice";
import Spinner from "../components/Spinner";
import { useToast } from "../components/Toast";
import { useWorkspace } from "../workspace";

export default function Conversations() {
  const { conversations, loading, error, reload } = useWorkspace();
  const showToast = useToast();
  const [query, setQuery] = useState("");
  const [toDelete, setToDelete] = useState<api.ConversationSummary | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return conversations.filter((c) => c.title.toLowerCase().includes(needle));
  }, [conversations, query]);

  async function confirmDelete() {
    if (!toDelete) return;
    await api.deleteConversation(toDelete.id);
    showToast("Samtalen er slettet.");
    setToDelete(null);
    reload();
  }

  return (
    <div className="page-stack">
      <div className="page-heading page-heading--split">
        <div>
          <p className="eyebrow">SAMTALEHISTORIKKEN DIN</p>
          <h1>Samtaler</h1>
          <p className="page-subtitle">Fortsett en samtale eller start på nytt med dokumentene dine.</p>
        </div>
        <Link to="/chat" className="button button--primary">
          <MessageSquarePlus size={16} aria-hidden="true" /> Ny samtale
        </Link>
      </div>

      <section className="panel conversations-panel">
        <div className="section-heading section-heading--with-controls">
          <div>
            <h2>
              Alle samtaler <span className="heading-count">{conversations.length}</span>
            </h2>
            <p>Sist brukte øverst.</p>
          </div>
          <label className="search-field">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              placeholder="Søk i samtaler"
              aria-label="Søk i samtaler"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>

        {loading && <Spinner />}
        {error && (
          <div className="notice-stack">
            <Notice kind="error">{error}</Notice>
          </div>
        )}

        {!loading && !error && visible.length > 0 && (
          <div className="conversation-list">
            {visible.map((conversation, index) => (
              <ConversationRow key={conversation.id} conversation={conversation} onDelete={setToDelete} index={index} />
            ))}
          </div>
        )}

        {!loading && !error && visible.length === 0 && (
          <EmptyState
            title={conversations.length ? "Ingen samtaler passer til søket." : "Du har ikke startet noen samtale ennå."}
            description={conversations.length ? "Prøv å søke etter et annet emne." : "Velg et dokument og still ditt første spørsmål."}
            action={
              !conversations.length ? (
                <Link className="button button--primary" to="/chat">
                  Start en samtale
                </Link>
              ) : undefined
            }
          />
        )}
      </section>

      <ConfirmDialog
        open={toDelete !== null}
        title="Slette samtalen?"
        description="Dette kan ikke angres."
        confirmLabel="Slett"
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      >
        <p>
          <strong>{toDelete?.title}</strong> og alle meldingene i den slettes for godt.
        </p>
      </ConfirmDialog>
    </div>
  );
}
