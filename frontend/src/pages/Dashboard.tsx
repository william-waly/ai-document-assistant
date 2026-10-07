import { ArrowRight, ArrowUpRight, FileText, MessageCircleMore, MessagesSquare, Plus, Sparkles, UploadCloud, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import ConversationRow from "../components/ConversationRow";
import CountUp from "../components/CountUp";
import DocumentRow from "../components/DocumentRow";
import EmptyState from "../components/EmptyState";
import Notice from "../components/Notice";
import SearchBox from "../components/SearchBox";
import Spinner from "../components/Spinner";
import StatCard from "../components/StatCard";
import { displayName, greeting, longDate } from "../format";
import { useSpotlight } from "../useSpotlight";
import { useWorkspace } from "../workspace";

const RECENT = 3;

export default function Dashboard() {
  const { user } = useAuth();
  const { documents, conversations, loading, error } = useWorkspace();

  // message_count counts both the question and the answer
  const questions = conversations.reduce((sum, c) => sum + Math.floor(c.message_count / 2), 0);
  const pages = documents.reduce((sum, d) => sum + (d.page_count ?? 0), 0);

  const spotlight = useSpotlight<HTMLElement>();

  return (
    <div className="page-stack dashboard-page">
      <section className="welcome-panel" ref={spotlight}>
        <div className="welcome-copy">
          <p className="eyebrow">{longDate()}</p>
          <h1>
            {greeting()}, <em>{displayName(user?.email ?? "")}</em>
            <span>.</span>
          </h1>
          <p>Still spørsmål til dokumentene dine og få svar med kilder.</p>
        </div>
        <div className="welcome-actions">
          <Link to="/chat" className="button button--primary">
            <Plus size={16} aria-hidden="true" /> Ny samtale
          </Link>
          <Link to="/documents" className="button button--secondary">
            <UploadCloud size={16} aria-hidden="true" /> Last opp dokument
          </Link>
        </div>
        <div className="welcome-mark" aria-hidden="true">
          <span className="welcome-page welcome-page--back" />
          <span className="welcome-page welcome-page--front">
            <span />
            <span />
            <i />
          </span>
          <span className="welcome-pin" />
        </div>
      </section>

      {loading && <Spinner />}
      {error && <Notice kind="error">{error}</Notice>}

      {!loading && !error && (
        <>
          <section className="stat-grid" aria-label="Nøkkeltall">
            <StatCard label="Dokumenter" value={<CountUp value={documents.length} pad={2} />} detail="i arbeidsområdet ditt" icon={<FileText size={17} />} accent="teal" />
            <StatCard label="Samtaler" value={<CountUp value={conversations.length} pad={2} />} detail="på tvers av dokumenter" icon={<MessagesSquare size={17} />} accent="blue" />
            <StatCard label="Spørsmål stilt" value={<CountUp value={questions} pad={2} />} detail="totalt" icon={<MessageCircleMore size={17} />} accent="gold" />
            <StatCard label="Sider" value={<CountUp value={pages} />} detail="lest og indeksert" icon={<BookOpen size={17} />} accent="violet" />
          </section>

          <section className="panel search-panel">
            <div className="section-heading">
              <div>
                <h2>Søk i dokumenter</h2>
                <p>Finner passasjer etter betydning, ikke bare eksakte ord.</p>
              </div>
            </div>
            <SearchBox />
          </section>

          <section className="dashboard-columns">
            <div className="panel dashboard-section">
              <div className="section-heading">
                <div>
                  <h2>Siste dokumenter</h2>
                  <p>Dokumentene du la til sist.</p>
                </div>
                <Link className="text-link" to="/documents">
                  Se alle <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </div>
              {documents.length ? (
                <div className="dashboard-doc-list">
                  {documents.slice(0, RECENT).map((document, index) => (
                    <DocumentRow key={document.id} document={document} compact index={index} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Du har ikke lastet opp noen dokumenter ennå."
                  description="Legg til en PDF for å komme i gang."
                  action={
                    <Link className="button button--secondary" to="/documents">
                      Last opp ditt første dokument
                    </Link>
                  }
                />
              )}
            </div>

            <div className="panel dashboard-section">
              <div className="section-heading">
                <div>
                  <div className="heading-title-row">
                    <h2>Siste samtaler</h2>
                    <span className="section-icon-small">
                      <Sparkles size={14} aria-hidden="true" />
                    </span>
                  </div>
                  <p>Fortsett der du slapp.</p>
                </div>
                <Link className="text-link" to="/conversations">
                  Se alle <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </div>
              {conversations.length ? (
                <div className="dashboard-conversation-list">
                  {conversations.slice(0, RECENT).map((conversation, index) => (
                    <ConversationRow key={conversation.id} conversation={conversation} compact index={index} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Du har ikke startet noen samtale ennå."
                  description="Still et spørsmål om et av dokumentene dine."
                  action={
                    <Link className="button button--secondary" to="/chat">
                      Start en samtale
                    </Link>
                  }
                />
              )}
              <Link className="new-chat-nudge" to="/chat">
                <span className="nudge-icon">
                  <Plus size={16} aria-hidden="true" />
                </span>
                <span>
                  <strong>Spør om noe nytt</strong>
                  <small>Velg dokumenter og start en ny samtale</small>
                </span>
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </section>

          <p className="dashboard-footnote">
            <span className="footnote-dot" /> Dokumentene dine behandles av en lokal AI-modell og slettes automatisk
            etter en fastsatt periode.
          </p>
        </>
      )}
    </div>
  );
}
