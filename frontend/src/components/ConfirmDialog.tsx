import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { errorText } from "../api";
import Alert from "./Alert";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
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
  children,
  confirmLabel,
  requirePassword = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
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
      className="dialog"
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault(); // Esc: let React state decide
        if (!busy) onCancel();
      }}
    >
      <form onSubmit={submit}>
        <h2 id="dialog-title">{title}</h2>
        <div className="dialog-body">{children}</div>
        {requirePassword && (
          <div className="field">
            <label htmlFor="confirm-password">Bekreft med passordet ditt</label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        )}
        {error && <Alert kind="error">{error}</Alert>}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Avbryt
          </button>
          <button type="submit" className="btn btn-danger" disabled={busy || (requirePassword && !password)}>
            {busy ? "Jobber…" : confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
