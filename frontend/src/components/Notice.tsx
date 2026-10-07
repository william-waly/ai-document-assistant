import type { ReactNode } from "react";

interface NoticeProps {
  kind: "error" | "success" | "info";
  children: ReactNode;
}

/** Inline message. Errors are announced to screen readers (role="alert"); the rest politely. */
export default function Notice({ kind, children }: NoticeProps) {
  return (
    <div className={`notice notice--${kind}`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
