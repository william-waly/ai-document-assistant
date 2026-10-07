import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { errorText } from "../api";
import { useAuth } from "../auth";
import Brand from "../components/Brand";
import Notice from "../components/Notice";

const MIN_PASSWORD = 8;
type Errors = Partial<Record<"email" | "password" | "repeat", string>>;

/** One component for both /login and /register. */
export default function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { user, notice, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === "register";
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/";

  if (user) return <Navigate to={from} replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    // Friendly checks first. The backend validates everything again regardless.
    const next: Errors = {};
    if (!email.trim()) next.email = "Skriv inn e-postadressen din.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = "Skriv inn en gyldig e-postadresse.";
    if (!password) next.password = "Skriv inn passordet.";
    else if (isRegister && password.length < MIN_PASSWORD) next.password = `Passordet må ha minst ${MIN_PASSWORD} tegn.`;
    if (isRegister && repeat !== password) next.repeat = "Passordene er ikke like.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      if (isRegister) await register(email.trim(), password);
      else await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (e) {
      setFormError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const passwordType = showPassword ? "text" : "password";

  return (
    <main className="auth-page">
      <section className="auth-form-side">
        <Link to="/" className="auth-brand">
          <Brand />
        </Link>

        <div className="auth-form-wrap">
          <p className="eyebrow">EN ROLIGERE VEI TIL SVARET</p>
          <h1>{isRegister ? "Opprett konto" : "Logg inn"}</h1>
          <p className="auth-subtitle">
            {isRegister
              ? "Samle lesingen din på ett sted og still spørsmål med kilder."
              : "Logg inn for å fortsette til dokumentene dine."}
          </p>

          <div className="notice-stack">
            {notice && !formError && <Notice kind="info">{notice}</Notice>}
            {formError && <Notice kind="error">{formError}</Notice>}
          </div>

          <form className="auth-form" onSubmit={onSubmit} noValidate>
            <div className="form-field">
              <label htmlFor="email">E-post</label>
              <span className={`input-wrap${errors.email ? " input-wrap--error" : ""}`}>
                <Mail size={16} aria-hidden="true" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="deg@eksempel.no"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "email-error" : undefined}
                />
              </span>
              {errors.email && (
                <small id="email-error" className="field-error">
                  {errors.email}
                </small>
              )}
            </div>

            <div className="form-field">
              <label htmlFor="password">Passord</label>
              <span className={`input-wrap${errors.password ? " input-wrap--error" : ""}`}>
                <LockKeyhole size={16} aria-hidden="true" />
                <input
                  id="password"
                  type={passwordType}
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  placeholder={isRegister ? `Minst ${MIN_PASSWORD} tegn` : "Skriv inn passordet"}
                  maxLength={72}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? "password-error" : undefined}
                />
                <button
                  type="button"
                  className="field-trailing"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Skjul passord" : "Vis passord"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </span>
              {errors.password && (
                <small id="password-error" className="field-error">
                  {errors.password}
                </small>
              )}
            </div>

            {isRegister && (
              <div className="form-field">
                <label htmlFor="repeat">Gjenta passord</label>
                <span className={`input-wrap${errors.repeat ? " input-wrap--error" : ""}`}>
                  <LockKeyhole size={16} aria-hidden="true" />
                  <input
                    id="repeat"
                    type={passwordType}
                    autoComplete="new-password"
                    placeholder="Skriv passordet en gang til"
                    maxLength={72}
                    value={repeat}
                    onChange={(e) => setRepeat(e.target.value)}
                    aria-invalid={!!errors.repeat}
                    aria-describedby={errors.repeat ? "repeat-error" : undefined}
                  />
                </span>
                {errors.repeat && (
                  <small id="repeat-error" className="field-error">
                    {errors.repeat}
                  </small>
                )}
              </div>
            )}

            <button className="button button--primary auth-submit" type="submit" disabled={busy}>
              {busy ? "Vent…" : isRegister ? "Opprett konto" : "Logg inn"} {!busy && <ArrowRight size={16} aria-hidden="true" />}
            </button>
          </form>

          {isRegister && (
            <p className="auth-privacy">
              Dokumentene dine er private og kan bare nås av deg. Du kan slette dem og tilhørende data når som helst.
              <span>
                Teksten behandles av en lokal AI-modell og slettes automatisk etter en fastsatt periode.
              </span>
            </p>
          )}

          <p className="auth-switch">
            {isRegister ? "Har du allerede en konto?" : "Ny her?"}
            <Link to={isRegister ? "/login" : "/register"}>{isRegister ? "Logg inn" : "Opprett konto"}</Link>
          </p>
        </div>

        <div className="auth-footer">
          <span>AI Document Assistant</span>
          <span>Teknisk demonstrasjon</span>
        </div>
      </section>

      <aside className="auth-story" aria-hidden="true">
        <div className="auth-story-top">
          <span className="auth-story-kicker">
            <span /> ET KILDEBASERT ARBEIDSOMRÅDE
          </span>
        </div>
        <div className="auth-story-copy">
          <p className="eyebrow">LES MINDRE, FORSTÅ MER</p>
          <h2>
            Gode spørsmål fortjener
            <br />
            <em>tydelige kilder.</em>
          </h2>
          <p>
            Samle dokumentene dine på ett rolig sted. Spør, utforsk, og behold hvert svar knyttet til siden det kom
            fra.
          </p>
        </div>
        <div className="auth-story-art">
          <div className="story-document story-document--back" />
          <div className="story-document story-document--front">
            <span className="story-line story-line--title" />
            <span className="story-line" />
            <span className="story-line story-line--short" />
            <div className="story-citation">
              <span className="story-citation-mark">12</span>
              <span>
                <b>Kildehenvisning</b>
                <small>Side 12 · Programvarearkitektur</small>
              </span>
            </div>
          </div>
          <div className="story-orbit story-orbit--one" />
          <div className="story-orbit story-orbit--two" />
        </div>
        <div className="auth-story-bottom">
          <span>Laget med personvern i tankene</span>
          <span>Privat som standard · Kilder alltid synlige</span>
        </div>
      </aside>
    </main>
  );
}
