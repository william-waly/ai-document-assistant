import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h1>Siden finnes ikke</h1>
        <p className="muted">Adressen du prøvde å åpne finnes ikke.</p>
        <Link to="/" className="btn btn-primary">
          Til oversikten
        </Link>
      </div>
    </div>
  );
}
