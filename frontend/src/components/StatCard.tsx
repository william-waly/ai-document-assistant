import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: ReactNode;
  detail: string;
  icon: ReactNode;
  accent?: "teal" | "blue" | "gold" | "violet";
}

export default function StatCard({ label, value, detail, icon, accent = "teal" }: StatCardProps) {
  return (
    <article className="stat-card">
      <div className={`stat-icon stat-icon--${accent}`}>{icon}</div>
      <div className="stat-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}
