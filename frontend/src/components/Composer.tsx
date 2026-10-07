const MAX_LENGTH = 1000; // same limit as the backend

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => void;
  disabled: boolean;
}

export default function Composer({ value, onChange, onSend, disabled }: ComposerProps) {
  const text = value.trim();

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (text && !disabled) onSend(text);
      }}
    >
      <label htmlFor="chat-input" className="sr-only">
        Spørsmål
      </label>
      <textarea
        id="chat-input"
        rows={2}
        maxLength={MAX_LENGTH}
        value={value}
        disabled={disabled}
        placeholder="Still et spørsmål om dokumentene dine…"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          // Enter sends, Shift+Enter makes a new line (and IME composition is left alone).
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <button type="submit" className="btn btn-primary" disabled={disabled || !text}>
        Send
      </button>
      <span className="hint composer-hint">
        Enter sender · Shift+Enter gir ny linje
        {value.length > MAX_LENGTH * 0.8 && ` · ${value.length}/${MAX_LENGTH}`}
      </span>
    </form>
  );
}
