import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, BookOpen, ChevronDown, FileText, MessageSquarePlus, PanelRight, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import * as api from "../api";
import { useAuth } from "../auth";
import ConfirmDialog from "../components/ConfirmDialog";
import MessageContent from "../components/MessageContent";
import SourcesPanel from "../components/SourcesPanel";
import { useToast } from "../components/Toast";
import { timeAgo } from "../format";
import { useLoad } from "../hooks";
import { useWorkspace } from "../workspace";

const PROMPTS = [
  "Oppsummer dette dokumentet",
  "Hva er hovedbegrepene?",
  "Forklar dette enklere",
  "Hva er de viktigste punktene?",
  "Lag en quiz basert på dokumentet",
];
const MAX_LENGTH = 1000; // same limit as the backend

function ChatWorkspace({ conversationId }: { conversationId?: string }) {
  const navigate = useNavigate();
  const showToast = useToast();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { documents, conversations, reload } = useWorkspace();
  const detail = useLoad(
    () => (conversationId ? api.getConversation(conversationId) : Promise.resolve(null)),
    [conversationId],
  );

  const [added, setAdded] = useState<api.ChatMessage[]>([]); // answers received in this session
  const [pending, setPending] = useState<string | null>(null); // the question being answered
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [scope, setScope] = useState<string | null>(searchParams.get("doc")); // null = all documents
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<api.SourceInfo | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // A new chat is created on the first question. If that question then fails,
  // a retry must reuse the conversation instead of creating a second one.
  const createdId = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const messages = [...(detail.data?.messages ?? []), ...added];
  const scopeDoc = documents.find((d) => d.id === scope) ?? null;
  const noDocuments = documents.length === 0;
  const title = conversationId ? (detail.data?.title ?? "Samtale") : "Ny samtale";
  const initial = (user?.email ?? "?").charAt(0).toUpperCase();

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length, pending]);

  // Opening an old conversation: show the sources of the latest answer straight away.
  useEffect(() => {
    if (!detail.data) return;
    const latest = [...detail.data.messages].reverse().find((m) => m.role === "assistant" && m.sources.length > 0);
    if (latest) setSelected((current) => current ?? latest.sources[0]);
  }, [detail.data]);

  function selectSource(source: api.SourceInfo) {
    setSelected(source);
    // On narrow screens the panel is a drawer.
    if (window.matchMedia?.("(max-width: 1240px)").matches) setDrawerOpen(true);
  }

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
      const exchange = await api.sendMessage(id, text, scopeDoc?.id);
      setAdded((current) => [...current, exchange.user_message, exchange.assistant_message]);
      setSelected(exchange.assistant_message.sources[0] ?? null);
      reload(); // the sidebar shows the new title and message count
      if (!conversationId) navigate(`/chat/${id}${scopeDoc ? `?doc=${scopeDoc.id}` : ""}`, { replace: true });
    } catch (e) {
      setError(api.errorText(e));
      setDraft(text); // nothing was saved on the server: the user can retry with one click
    } finally {
      setPending(null);
    }
  }

  function onSubmit(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (text && pending === null && !noDocuments) void send(text);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter makes a new line (IME composition is left alone).
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onSubmit();
    }
  }

  async function remove() {
    if (!conversationId) return;
    await api.deleteConversation(conversationId);
    showToast("Samtalen er slettet.");
    reload();
    navigate("/chat", { replace: true });
  }

  const showIntro = !detail.loading && !detail.error && messages.length === 0 && pending === null;

  return (
    <div className="chat-workspace">
      <aside className="chat-history-rail" aria-label="Samtaler">
        <div className="chat-history-heading">
          <span>SAMTALER</span>
          <Link to="/chat" className="icon-button" aria-label="Start ny samtale">
            <Plus size={17} />
          </Link>
        </div>
        <div className="chat-history-list">
          {conversations.slice(0, 12).map((item) => (
            <Link
              key={item.id}
              to={`/chat/${item.id}`}
              className={`history-item${item.id === conversationId ? " history-item--active" : ""}`}
            >
              <span className="history-item-icon">
                <BookOpen size={15} aria-hidden="true" />
              </span>
              <span className="history-item-copy">
                <strong>{item.title}</strong>
                <small>{timeAgo(item.last_message_at ?? item.created_at)}</small>
              </span>
            </Link>
          ))}
          {conversations.length === 0 && <p className="history-empty">Samtalene dine vises her.</p>}
        </div>
        <Link to="/conversations" className="history-view-all">
          Se alle samtaler <ChevronDown size={14} aria-hidden="true" />
        </Link>
        <div className="history-privacy">
          <ShieldCheck size={15} aria-hidden="true" />
          <span>Svar lages av en lokal språkmodell.</span>
        </div>
      </aside>

      <section className="chat-main-panel" aria-label="Samtale">
        <header className="chat-panel-header">
          <div className="chat-heading-copy">
            <p className="eyebrow">DOKUMENTASSISTENT</p>
            <h1>{title}</h1>
          </div>
          <div className="chat-header-tools">
            <div className="selected-documents-control">
              <button
                type="button"
                className="selected-documents-button"
                onClick={() => setPickerOpen((open) => !open)}
                aria-expanded={pickerOpen}
              >
                <span className="selected-documents-icon">
                  <FileText size={15} aria-hidden="true" />
                </span>
                <span>{scopeDoc ? scopeDoc.filename : `Alle dokumenter (${documents.length})`}</span>
                <ChevronDown size={14} aria-hidden="true" />
              </button>
              {pickerOpen && (
                <div className="document-picker" role="group" aria-label="Dokumenter som brukes i svaret">
                  <div className="picker-heading">
                    <strong>Bruk dokumenter</strong>
                    <button type="button" className="icon-button" onClick={() => setPickerOpen(false)} aria-label="Lukk valget">
                      <X size={15} />
                    </button>
                  </div>
                  <label className="picker-option">
                    <input type="radio" name="scope" checked={scopeDoc === null} onChange={() => setScope(null)} />
                    <span className="picker-option-copy">
                      <strong>Alle dokumenter</strong>
                      <small>{documents.length} dokumenter</small>
                    </span>
                  </label>
                  {documents.map((document) => (
                    <label key={document.id} className="picker-option">
                      <input
                        type="radio"
                        name="scope"
                        checked={scopeDoc?.id === document.id}
                        onChange={() => setScope(document.id)}
                      />
                      <span className="picker-file-icon">
                        <FileText size={15} aria-hidden="true" />
                      </span>
                      <span className="picker-option-copy">
                        <strong>{document.filename}</strong>
                        <small>{document.page_count ?? "–"} sider</small>
                      </span>
                    </label>
                  ))}
                  <p className="picker-footnote">Valget gjelder for neste spørsmål.</p>
                  <button type="button" className="button button--secondary button--small picker-done" onClick={() => setPickerOpen(false)}>
                    Ferdig
                  </button>
                </div>
              )}
            </div>
            {conversationId && !detail.error && (
              <button
                type="button"
                className="icon-button danger-icon"
                aria-label="Slett samtalen"
                title="Slett samtalen"
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 size={16} />
              </button>
            )}
            <button type="button" className="icon-button sources-toggle" aria-label="Åpne kilder" onClick={() => setDrawerOpen(true)}>
              <PanelRight size={17} />
            </button>
          </div>
        </header>

        <div className={`chat-message-list${showIntro ? " chat-message-list--empty" : ""}`} role="log" aria-live="polite" aria-label="Meldinger">
          {detail.loading && (
            <div className="spinner-row" role="status">
              <span className="spinner" aria-hidden="true" />
              <span>Laster samtalen…</span>
            </div>
          )}
          {detail.error && (
            <div className="chat-empty-error" role="alert">
              <p>{detail.error}</p>
              <Link to="/chat">Start en ny samtale</Link>
            </div>
          )}

          {showIntro && (
            <div className="chat-intro">
              <span className="chat-intro-icon">
                <MessageSquarePlus size={20} />
              </span>
              <p className="eyebrow">LITT KONTEKST GÅR LANGT</p>
              <h2>Spør om hva som helst i dokumentene dine</h2>
              <p className="chat-intro-subtitle">
                Svaret bygger bare på det som står i dokumentene, og du ser hvilken side det kommer fra. Velg gjerne ett
                dokument øverst for å snevre inn.
              </p>
              <div className="selected-doc-summary">
                {scopeDoc ? (
                  <span className="selected-doc-pill">
                    <FileText size={14} aria-hidden="true" />
                    <span>{scopeDoc.filename}</span>
                  </span>
                ) : noDocuments ? (
                  <span className="no-doc-selected">
                    Du har ingen dokumenter ennå. <Link to="/documents">Last opp en PDF</Link> først.
                  </span>
                ) : (
                  <span className="selected-doc-pill">
                    <FileText size={14} aria-hidden="true" />
                    <span>Alle dokumenter ({documents.length})</span>
                  </span>
                )}
              </div>
              <div className="prompt-suggestions">
                <span className="suggestion-caption">PRØV ET SPØRSMÅL</span>
                {PROMPTS.map((prompt) => (
                  <button key={prompt} type="button" className="suggestion-chip" onClick={() => setDraft(prompt)}>
                    {prompt}
                    <ArrowUp size={13} className="suggestion-arrow" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <article
              key={message.id}
              // An answer without sources means "not found in your documents": styled quietly.
              className={`chat-message chat-message--${message.role}${
                message.role === "assistant" && message.sources.length === 0 ? " chat-message--noinfo" : ""
              }`}
            >
              <div className={`message-avatar${message.role === "assistant" ? " message-avatar--assistant" : ""}`} aria-hidden="true">
                {message.role === "assistant" ? <BookOpen size={15} /> : initial}
              </div>
              <div className="message-body">
                <div className="message-meta">
                  <strong>{message.role === "assistant" ? "Dokumentassistent" : "Du"}</strong>
                  <span>{timeAgo(message.created_at)}</span>
                </div>
                <MessageContent
                  content={message.content}
                  onCite={(ref) => {
                    const source = message.sources.find((s) => s.ref === ref);
                    if (source) selectSource(source);
                  }}
                />
                {message.role === "assistant" && message.sources.length > 0 && (
                  <div className="citation-block">
                    <span className="citation-label">KILDER</span>
                    <div className="citation-list">
                      {message.sources.map((source) => (
                        <button key={source.ref} type="button" className="citation-chip" onClick={() => selectSource(source)}>
                          <FileText size={14} aria-hidden="true" />
                          <span>{source.filename}</span>
                          <span className="citation-page">side {source.page_number}</span>
                          <ArrowUp size={12} className="citation-arrow" aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </article>
          ))}

          {pending !== null && (
            <>
              <article className="chat-message chat-message--user">
                <div className="message-avatar" aria-hidden="true">
                  {initial}
                </div>
                <div className="message-body">
                  <div className="message-meta">
                    <strong>Du</strong>
                  </div>
                  <div className="message-content">
                    <p>{pending}</p>
                  </div>
                </div>
              </article>
              <article className="chat-message chat-message--assistant" role="status">
                <div className="message-avatar message-avatar--assistant" aria-hidden="true">
                  <BookOpen size={15} />
                </div>
                <div className="message-body">
                  <div className="message-meta">
                    <strong>Dokumentassistent</strong>
                  </div>
                  <div className="thinking-indicator">
                    <span className="thinking-dots" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    <strong>Tenker…</strong>
                    <span>Søker i dokumentene og skriver svar. Det kan ta opptil et halvt minutt.</span>
                  </div>
                </div>
              </article>
            </>
          )}
          <div ref={endRef} />
        </div>

        <div className="composer-wrap">
          {error && (
            <div className="chat-request-error" role="alert">
              <span>{error}</span>
            </div>
          )}
          {noDocuments && (
            <p className="composer-helper composer-helper--warning">
              Du må laste opp et dokument før du kan stille spørsmål. <Link to="/documents">Last opp en PDF</Link>
            </p>
          )}
          <form className="chat-composer" onSubmit={onSubmit}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={noDocuments ? "Last opp et dokument for å komme i gang" : "Still et spørsmål om dokumentene dine…"}
              rows={2}
              maxLength={MAX_LENGTH}
              disabled={pending !== null || noDocuments}
              aria-label="Spørsmål"
            />
            <div className="composer-footer">
              <span>
                <span className="composer-key">↵</span> sender <span className="composer-divider">·</span> Shift + ↵ gir ny
                linje
                {draft.length > MAX_LENGTH * 0.8 && ` · ${draft.length}/${MAX_LENGTH}`}
              </span>
              <button className="send-button" type="submit" disabled={!draft.trim() || pending !== null || noDocuments} aria-label="Send">
                <ArrowUp size={17} />
              </button>
            </div>
          </form>
          <p className="composer-disclaimer">
            Svarene bygger på utdrag fra dokumentene dine og kan inneholde feil. Sjekk viktige svar mot kilden.
          </p>
        </div>
      </section>

      <SourcesPanel source={selected} />
      {drawerOpen && (
        <div
          className="sources-drawer-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDrawerOpen(false);
          }}
        >
          <SourcesPanel source={selected} mobile onClose={() => setDrawerOpen(false)} />
        </div>
      )}

      <ConfirmDialog
        open={confirmingDelete}
        title="Slette samtalen?"
        description="Dette kan ikke angres."
        confirmLabel="Slett"
        onConfirm={remove}
        onCancel={() => setConfirmingDelete(false)}
      >
        <p>Samtalen og alle meldingene i den slettes for godt.</p>
      </ConfirmDialog>
    </div>
  );
}

export default function ChatPage() {
  const { id } = useParams();
  // key: switching conversation resets all chat state
  return <ChatWorkspace key={id ?? "new"} conversationId={id} />;
}
