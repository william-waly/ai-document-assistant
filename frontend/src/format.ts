export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(".", ",")} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("nb-NO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "5 min siden", "I går", ... and a plain date once it is older than two weeks. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "Akkurat nå";
  if (minutes < 60) return `${minutes} min siden`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} t siden`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "I går";
  if (days < 14) return `${days} dager siden`;
  return formatDate(iso);
}

export function greeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) return "God natt";
  if (hour < 10) return "God morgen";
  if (hour < 18) return "God dag";
  return "God kveld";
}

/** "william.waly@example.com" -> "William". Only the e-mail is known; no name is stored. */
export function displayName(email: string): string {
  const first = (email.split("@")[0] ?? "").split(/[._+-]/)[0] ?? "";
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : email;
}

export function longDate(date: Date = new Date()): string {
  return date.toLocaleDateString("nb-NO", { weekday: "long", day: "numeric", month: "long" }).toUpperCase();
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

export const percent = (score: number): string => `${Math.max(0, Math.round(score * 100))} %`;

/** Days between upload and automatic deletion, for the "deleted after N days" notes. */
export function retentionDays(createdIso: string, expiresIso: string | null): number | null {
  if (!expiresIso) return null;
  return Math.round((new Date(expiresIso).getTime() - new Date(createdIso).getTime()) / 86_400_000);
}
