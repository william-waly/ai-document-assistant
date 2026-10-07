import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Info, X } from "lucide-react";

type Tone = "success" | "info";
type Show = (message: string, tone?: Tone) => void;

const ToastContext = createContext<Show | null>(null);

/** One short confirmation message at a time, in the corner. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; tone: Tone } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback<Show>((message, tone = "success") => {
    window.clearTimeout(timer.current);
    setToast({ message, tone });
    timer.current = window.setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className={`toast toast--${toast.tone}`} role="status">
          <span className="toast-icon">{toast.tone === "success" ? <Check size={16} /> : <Info size={16} />}</span>
          <span>{toast.message}</span>
          <button type="button" className="icon-button toast-close" onClick={() => setToast(null)} aria-label="Lukk melding">
            <X size={15} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): Show {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast must be used inside <ToastProvider>");
  return show;
}
