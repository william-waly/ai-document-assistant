import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { errorText } from "../api";
import Notice from "./Notice";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  confirmLabel: string;
  /** Ask for the password again before a destructive action. */
  requirePassword?: boolean;
  onConfirm: (password: string) => Promise<void>;
  onCancel: () => void;
}

/** Modal built on the native <dialog>: focus trapping, Esc and backdrop for free. */
export default function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel,
  requirePassword = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // Several dialogs can exist on one page: ids must be unique for labels to point at the right element.
  const uid = useId();
  const titleId = `${uid}-title`;
  const passwordId = `${uid}-password`;
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setPassword("");
      setError(null);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onConfirm(password);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="modal-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault(); // Esc: let React state decide
        if (!busy) onCancel();
      }}
    >
      <form className="modal-card" onSubmit={submit}>
        <div className="modal-heading">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="icon-button" aria-label="Lukk" onClick={onCancel} disabled={busy}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-copy">{children}</div>
          {requirePassword && (
            <div className="form-field modal-field-gap">
              <label htmlFor={passwordId}>Bekreft med passordet ditt</label>
              <input
                id={passwordId}
                className="text-input"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}
          {error && (
            <div className="modal-field-gap">
              <Notice kind="error">{error}</Notice>
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="button button--secondary" onClick={onCancel} disabled={busy}>
              Avbryt
            </button>
            <button
              type="submit"
              className="button button--danger"
              disabled={busy || (requirePassword && !password)}
            >
              {busy ? "Jobber…" : confirmLabel}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
