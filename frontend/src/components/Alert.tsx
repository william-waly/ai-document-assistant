import type { ReactNode } from "react";

interface AlertProps {
  kind: "error" | "success" | "info";
  children: ReactNode;
}

/** Errors are announced to screen readers (role="alert"); the rest politely. */
export default function Alert({ kind, children }: AlertProps) {
  return (
    <div className={`alert alert-${kind}`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
