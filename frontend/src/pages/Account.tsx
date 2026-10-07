import { useState } from "react";
import { Download, Palette, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { useAuth } from "../auth";
import { useTheme } from "../useTheme";
import type { ThemePreference } from "../theme";
import * as api from "../api";
import ConfirmDialog from "../components/ConfirmDialog";
import Notice from "../components/Notice";
import { useToast } from "../components/Toast";
import { formatDate } from "../format";
import { useWorkspace } from "../workspace";

type Action = "erase" | "delete" | null;

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "Følg enheten" },
  { value: "light", label: "Lys" },
  { value: "dark", label: "Mørk" },
];

export default function Account() {
  const { user, logout } = useAuth();
  const { preference, choose } = useTheme();
  const { reload } = useWorkspace();
  const showToast = useToast();
  const [action, setAction] = useState<Action>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download(includeText: boolean) {
    setExporting(true);
    setError(null);
    try {
      const blob = await api.exportMyData(includeText);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "mine-data.json";
      link.click();
      URL.revokeObjectURL(url);
      showToast("Dataene dine er lastet ned.");
    } catch (e) {
      setError(api.errorText(e));
    } finally {
      setExporting(false);
    }
  }

  async function erase(password: string) {
    const result = await api.deleteMyData(password);
    setAction(null);
    reload();
    showToast(`Slettet ${result.documents} dokument(er) og ${result.conversations} samtale(r).`);
  }

  async function deleteAccount(password: string) {
    await api.deleteAccount(password);
    setAction(null);
    logout("Kontoen din og alle dataene er slettet.");
  }

  return (
    <div className="page-stack settings-page">
      <div className="page-heading">
        <p className="eyebrow">ARBEIDSOMRÅDET DITT</p>
        <h1>Konto og personvern</h1>
        <p className="page-subtitle">Se hva som er lagret om deg, og ta kontroll over dataene dine.</p>
      </div>

      <div className="settings-grid">
        <nav className="settings-nav" aria-label="Seksjoner">
          <a href="#profil" className="settings-nav-link settings-nav-link--active">
            <UserRound size={16} aria-hidden="true" /> Profil
          </a>
          <a href="#utseende" className="settings-nav-link">
            <Palette size={16} aria-hidden="true" /> Utseende
          </a>
          <a href="#personvern" className="settings-nav-link">
            <ShieldCheck size={16} aria-hidden="true" /> Personvern
          </a>
          <a href="#data" className="settings-nav-link">
            <Download size={16} aria-hidden="true" /> Data
          </a>
        </nav>

        <div className="settings-content">
          {error && <Notice kind="error">{error}</Notice>}

          <section className="panel settings-section" id="profil">
            <div className="settings-section-heading">
              <span className="settings-section-icon">
                <UserRound size={17} />
              </span>
              <div>
                <h2>Profil</h2>
                <p>Det eneste vi lagrer om kontoen din er e-postadressen og et kryptert passord.</p>
              </div>
            </div>
            <dl className="metadata-list">
              <div>
                <dt>E-post</dt>
                <dd>{user?.email}</dd>
              </div>
              <div>
                <dt>Opprettet</dt>
                <dd>{user ? formatDate(user.created_at) : ""}</dd>
              </div>
            </dl>
          </section>

          <section className="panel settings-section" id="utseende">
            <div className="settings-section-heading">
              <span className="settings-section-icon">
                <Palette size={17} />
              </span>
              <div>
                <h2>Utseende</h2>
                <p>Velg lys eller mørk modus, eller la enheten din bestemme.</p>
              </div>
            </div>
            <div className="theme-options" role="radiogroup" aria-label="Utseende">
              {THEMES.map(({ value, label }) => (
                <label key={value} className="theme-option">
                  <input
                    type="radio"
                    name="theme"
                    value={value}
                    checked={preference === value}
                    onChange={() => choose(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>

          <section className="panel settings-section" id="personvern">
            <div className="settings-section-heading">
              <span className="settings-section-icon settings-section-icon--green">
                <ShieldCheck size={17} />
              </span>
              <div>
                <h2>Personvern</h2>
                <p>Laget med personvern i tankene. Dette er ikke en påstand om juridisk GDPR-samsvar.</p>
              </div>
            </div>
            <div className="privacy-points">
              <div>
                <strong>Hva lagres?</strong>
                <p>Filnavn, tekstutdrag fra dokumentene, søkedata (embeddinger) og samtalene dine. Selve PDF-filen lagres ikke.</p>
              </div>
              <div>
                <strong>Hvordan behandles innholdet?</strong>
                <p>Teksten leses ut, deles opp og analyseres av en AI-modell som kjører lokalt på serveren.</p>
              </div>
              <div>
                <strong>Hvor lenge?</strong>
                <p>Dokumenter og samtaler slettes automatisk etter en fastsatt periode (90 dager som standard). Datoen vises ved hvert dokument.</p>
              </div>
              <div>
                <strong>Sendes innhold til eksterne AI-tjenester?</strong>
                <p>Ikke i standardoppsettet. Kun tekstutdragene som trengs for ett spørsmål går til den lokale modellen.</p>
              </div>
            </div>
          </section>

          <section className="panel settings-section" id="data">
            <div className="settings-section-heading">
              <span className="settings-section-icon">
                <Download size={17} />
              </span>
              <div>
                <h2>Datahåndtering</h2>
                <p>Last ned en kopi, eller slett det som er lagret.</p>
              </div>
            </div>

            <div className="data-action-row">
              <div>
                <strong>Last ned dataene mine</strong>
                <p>Kontoen, dokumentene (metadata), samtalene og kildene som en JSON-fil.</p>
              </div>
              <div className="row-buttons">
                <button type="button" className="button button--secondary button--small" disabled={exporting} onClick={() => void download(false)}>
                  <Download size={14} aria-hidden="true" /> Last ned
                </button>
                <button type="button" className="button button--secondary button--small" disabled={exporting} onClick={() => void download(true)}>
                  Med dokumenttekst
                </button>
              </div>
            </div>

            <div className="data-action-row data-action-row--danger">
              <div>
                <strong>Slett dataene mine</strong>
                <p>Fjerner alle dokumenter, søkedata og samtaler. Kontoen beholdes.</p>
              </div>
              <button type="button" className="button button--secondary button--small" onClick={() => setAction("erase")}>
                <Trash2 size={14} aria-hidden="true" /> Slett alle dataene mine
              </button>
            </div>

            <div className="data-action-row data-action-row--danger">
              <div>
                <strong>Slett kontoen</strong>
                <p>Sletter kontoen og alt som hører til den. Dette kan ikke angres.</p>
              </div>
              <button type="button" className="button button--danger-outline button--small" onClick={() => setAction("delete")}>
                Slett kontoen min
              </button>
            </div>
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={action === "erase"}
        title="Slette alle dataene dine?"
        description="Kontoen din beholdes."
        confirmLabel="Slett alt"
        requirePassword
        onConfirm={erase}
        onCancel={() => setAction(null)}
      >
        <p>Alle dokumenter, søkedata og samtaler slettes for godt.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={action === "delete"}
        title="Slette kontoen?"
        description="Dette kan ikke angres."
        confirmLabel="Slett kontoen"
        requirePassword
        onConfirm={deleteAccount}
        onCancel={() => setAction(null)}
      >
        <p>Kontoen og alle dataene dine slettes for godt.</p>
      </ConfirmDialog>
    </div>
  );
}
