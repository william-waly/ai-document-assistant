import { Link } from "react-router-dom";
import * as api from "../api";
import Alert from "../components/Alert";
import SearchBox from "../components/SearchBox";
import Spinner from "../components/Spinner";
import { formatDate } from "../format";
import { useLoad } from "../hooks";

const LATEST = 5;

export default function Dashboard() {
  const { data, error, loading } = useLoad(async () => {
    const [documents, conversations] = await Promise.all([api.listDocuments(), api.listConversations()]);
    return { documents, conversations };
  });

  return (
    <>
      <h1>Oversikt</h1>

      {loading && <Spinner />}
      {error && <Alert kind="error">{error}</Alert>}

      {data && (
        <>
          <section className="stats" aria-label="Nøkkeltall">
            <div className="card stat">
              <span className="stat-number">{data.documents.length}</span>
              <span className="muted">{data.documents.length === 1 ? "dokument" : "dokumenter"}</span>
            </div>
            <div className="card stat">
              <span className="stat-number">{data.conversations.length}</span>
              <span className="muted">{data.conversations.length === 1 ? "samtale" : "samtaler"}</span>
            </div>
            <div className="card stat stat-action">
              <Link to="/documents" className="btn btn-primary">
                Last opp dokument
              </Link>
            </div>
          </section>

          <section className="card">
            <h2>Søk i dokumenter</h2>
            <p className="muted small">Finner passasjer etter betydning, ikke bare eksakte ord.</p>
            <SearchBox />
          </section>

          <section className="card">
            <div className="section-head">
              <h2>Siste opplastede dokumenter</h2>
              <Link to="/documents">Se alle</Link>
            </div>
            {data.documents.length === 0 ? (
              <p className="muted">
                Du har ingen dokumenter ennå. <Link to="/documents">Last opp din første PDF</Link>.
              </p>
            ) : (
              <ul className="plain-list">
                {data.documents.slice(0, LATEST).map((doc) => (
                  <li key={doc.id}>
                    <Link to={`/documents/${doc.id}`}>{doc.filename}</Link>
                    <span className="muted small">
                      {doc.page_count ?? "?"} sider · {formatDate(doc.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
