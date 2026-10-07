const LABELS: Record<string, { text: string; className: string }> = {
  ready: { text: "Klar", className: "" },
  processing: { text: "Behandles", className: " status-badge--processing" },
  failed: { text: "Feilet", className: " status-badge--error" },
};

export default function StatusBadge({ status }: { status: string }) {
  const { text, className } = LABELS[status] ?? { text: status, className: "" };
  return (
    <span className={`status-badge${className}`}>
      <span className="status-dot" aria-hidden="true" />
      {text}
    </span>
  );
}
