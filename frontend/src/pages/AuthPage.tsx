import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { errorText } from "../api";
import { useAuth } from "../auth";
import Alert from "../components/Alert";

const MIN_PASSWORD = 8;

/** One component for both /login and /register. */
export default function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { user, notice, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === "register";
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/";

  if (user) return <Navigate to={from} replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    // Friendly checks first. The backend validates everything again regardless.
    if (isRegister) {
      if (password.length < MIN_PASSWORD) {
        setError(`Passordet må ha minst ${MIN_PASSWORD} tegn.`);
        return;
      }
      if (password !== repeat) {
        setError("Passordene er ikke like.");
        return;
      }
    }

    setBusy(true);
    try {
      if (isRegister) await register(email.trim(), password);
      else await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <h1>{isRegister ? "Opprett konto" : "Logg inn"}</h1>
        <p className="muted">Still spørsmål til dine egne PDF-dokumenter, med kilder.</p>

        {notice && !error && <Alert kind="info">{notice}</Alert>}
        {error && <Alert kind="error">{error}</Alert>}

        <form onSubmit={onSubmit} noValidate={false}>
          <div className="field">
            <label htmlFor="email">E-post</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Passord</label>
            <input
              id="password"
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              required
              minLength={isRegister ? MIN_PASSWORD : undefined}
              maxLength={72}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {isRegister && <span className="hint">Minst {MIN_PASSWORD} tegn.</span>}
          </div>
          {isRegister && (
            <div className="field">
              <label htmlFor="repeat">Gjenta passord</label>
              <input
                id="repeat"
                type="password"
                autoComplete="new-password"
                required
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
              />
            </div>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Vent…" : isRegister ? "Opprett konto" : "Logg inn"}
          </button>
        </form>

        {isRegister && (
          <p className="hint">
            Dokumentene dine blir bare lest som tekst, behandles på din egen maskin med lokal AI, og slettes
            automatisk etter en fastsatt periode. Du kan slette alt selv når som helst.
          </p>
        )}

        <p className="switch">
          {isRegister ? (
            <>
              Har du allerede en konto? <Link to="/login">Logg inn</Link>
            </>
          ) : (
            <>
              Ny her? <Link to="/register">Opprett konto</Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
