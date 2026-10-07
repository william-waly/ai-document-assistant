import { useCallback, useEffect, useState } from "react";
import { applyPreference, effectiveTheme, readPreference, THEME_EVENT, type ThemePreference } from "./theme";

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);
  const [effective, setEffective] = useState(() => effectiveTheme(readPreference()));

  // Several components use this hook at once (top bar, account page): keep them in step.
  useEffect(() => {
    const sync = () => setPreference(readPreference());
    window.addEventListener(THEME_EVENT, sync);
    window.addEventListener("storage", sync); // another tab changed it
    return () => {
      window.removeEventListener(THEME_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // While following the system, react when the operating system switches.
  useEffect(() => {
    setEffective(effectiveTheme(preference));
    if (preference !== "system" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setEffective(effectiveTheme("system"));
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [preference]);

  const choose = useCallback((next: ThemePreference) => applyPreference(next), []);

  return { preference, effective, choose };
}
