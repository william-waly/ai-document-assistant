// Light/dark theme. "system" (no saved choice) follows the operating system; an explicit choice is
// stored in localStorage and applied as <html data-theme="...">. The CSS does the rest (light-dark()).
// public/theme-init.js applies the saved choice before the first paint.

export type ThemePreference = "system" | "light" | "dark";

const KEY = "docai.theme";

export function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export function applyPreference(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", preference);
  try {
    if (preference === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, preference);
  } catch {
    /* the choice just won't survive a reload */
  }
  // Tell every part of the page that shows the theme (top-bar button, account page, ...).
  window.dispatchEvent(new Event(THEME_EVENT));
}

export const THEME_EVENT = "docai-theme-change";

export function systemPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

/** What the user actually sees right now. */
export function effectiveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference !== "system") return preference;
  return systemPrefersDark() ? "dark" : "light";
}
