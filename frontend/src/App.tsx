import { useEffect, useState } from "react";
import { fetchHealth, type Health } from "./api";

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHealth()
      .then(setHealth)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main className="container">
      <h1>AI Document Assistant</h1>
      <p className="muted">Still spørsmål til dine egne PDF-dokumenter.</p>

      <section className="card">
        <h2>Systemstatus</h2>
        {error && <p className="bad">Backend utilgjengelig: {error}</p>}
        {!error && !health && <p>Sjekker…</p>}
        {health && (
          <ul>
            <li>API: <span className="ok">{health.status}</span></li>
            <li>Database: <span className="ok">{health.database}</span></li>
            <li>pgvector: <span className="ok">{health.pgvector}</span></li>
          </ul>
        )}
      </section>
    </main>
  );
}
