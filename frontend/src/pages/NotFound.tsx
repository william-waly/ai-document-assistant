import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="page-content">
      <div className="not-found-card">
        <p className="eyebrow">404</p>
        <h1>Siden finnes ikke</h1>
        <p className="muted">Adressen du prøvde å åpne finnes ikke.</p>
        <Link to="/" className="button button--primary">
          Til oversikten
        </Link>
      </div>
    </div>
  );
}
