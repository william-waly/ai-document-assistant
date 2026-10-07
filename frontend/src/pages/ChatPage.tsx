import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import * as api from "../api";
import Alert from "../components/Alert";
import Composer from "../components/Composer";
import ConfirmDialog from "../components/ConfirmDialog";
import MessageBubble from "../components/MessageBubble";
import Spinner from "../components/Spinner";
import { formatDate } from "../format";
import { useLoad } from "../hooks";

interface ThreadProps {
  conversationId?: string;
  hasDocuments: boolean;
  onChanged: () => void;
  onDeleted: () => void;
}

/** One conversation. Rendered with key={id}, so switching conversations resets all state. */
function Thread({ conversationId, hasDocuments, onChanged, onDeleted }: ThreadProps) {
  const navigate = useNavigate();
  const detail = useLoad(
    () => (conversationId ? api.getConversation(conversationId) : Promise.resolve(null)),
    [conversationId],
  );
  const [added, setAdded] = useState<api.ChatMessage[]>([]); // answers received in this session
  const [pending, setPending] = useState<string | null>(null); // the question being answered
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // A new chat is created on the first question. If that question then fails,
  // a retry must reuse the conversation instead of creating a second one.
  const createdId = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const messages = [...(detail.data?.messages ?? []), ...added];

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length, pending]);

  async function send(text: string) {
    setError(null);
    setPending(text);
    setDraft("");
    try {
      let id = conversationId ?? createdId.current;
      if (!id) {
        id = (await api.createConversation()).id;
        createdId.current = id;
      }
      const exchange = await api.sendMessage(id, text);
      setAdded((current) => [...current, exchange.user_message, exchange.assistant_message]);
      onChanged(); // the sidebar shows a new title and message count
      if (!conversationId) navigate(`/chat/${id}`, { replace: true });
    } catch (e) {
      setError(api.errorText(e));
      setDraft(text); // nothing was saved on the server: let the user retry with one click
    } finally {
      setPending(null);
    }
  }

  async function remove() {
    if (!conversationId) return;
    await api.deleteConversation(conversationId);
    onDeleted();
  }

  const title = detail.data?.title ?? "Ny samtale";

  return (
    <section className="thread card" aria-label="Samtale">
      <div className="section-head">
        <h1 className="thread-title break">{title}</h1>
        {conversationId && !detail.error && (
          <button type="button" className="btn btn-danger-ghost" onClick={() => setConfirmingDelete(true)}>
            Slett samtale
          </button>
        )}
      </div>

      {!hasDocuments && (
        <Alert kind="info">
          Du har ingen dokumenter ennå, så det er ingenting å svare ut fra. <Link to="/documents">Last opp en PDF</Link>{" "}
          først.
        </Alert>
      )}
      {detail.error && (
        <Alert kind="error">
          {detail.error} <Link to="/chat">Start en ny samtale</Link>
        </Alert>
      )}

      <div className="messages" role="log" aria-live="polite" aria-label="Meldinger">
        {detail.loading && <Spinner />}
        {!detail.loading && !detail.error && messages.length === 0 && !pending && (
          <p className="muted empty-chat">
            Still et spørsmål om dokumentene dine. Svaret bygger bare på det som står i dem, og du ser hvilken side
            det kommer fra.
          </p>
        )}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {pending && (
          <>
            <div className="msg msg-user">
              <p>{pending}</p>
            </div>
            <Spinner label="Søker i dokumentene og skriver svar… Det kan ta opptil et halvt minutt." />
          </>
        )}
        {error && <Alert kind="error">{error}</Alert>}
        <div ref={endRef} />
      </div>

      <Composer value={draft} onChange={setDraft} onSend={(text) => void send(text)} disabled={pending !== null} />

      <ConfirmDialog
        open={confirmingDelete}
        title="Slette samtalen?"
        confirmLabel="Slett"
        onConfirm={remove}
        onCancel={() => setConfirmingDelete(false)}
      >
        <p>Samtalen og alle meldingene i den slettes for godt.</p>
      </ConfirmDialog>
    </section>
  );
}

export default function ChatPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const conversations = useLoad(api.listConversations);
  const documents = useLoad(api.listDocuments);

  return (
    <div className="chat-layout">
      <aside className="chat-sidebar card" aria-label="Samtaler">
        <Link to="/chat" className="btn btn-primary btn-block">
          Ny samtale
        </Link>

        {conversations.loading && !conversations.data && <Spinner />}
        {conversations.error && <Alert kind="error">{conversations.error}</Alert>}
        {conversations.data?.length === 0 && <p className="muted small">Ingen samtaler ennå.</p>}

        <ul className="conv-list">
          {conversations.data?.map((conversation) => (
            <li key={conversation.id}>
              <NavLink to={`/chat/${conversation.id}`} className="conv-item">
                <span className="conv-title">{conversation.title}</span>
                <span className="muted small">
                  {formatDate(conversation.last_message_at ?? conversation.created_at)} · {conversation.message_count}{" "}
                  meldinger
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
      </aside>

      <Thread
        key={id ?? "new"}
        conversationId={id}
        hasDocuments={documents.data ? documents.data.length > 0 : true}
        onChanged={conversations.reload}
        onDeleted={() => {
          conversations.reload();
          navigate("/chat");
        }}
      />
    </div>
  );
}
