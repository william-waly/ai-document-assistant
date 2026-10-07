// Applies a saved light/dark choice BEFORE the page is drawn, so there is no flash of the wrong theme.
// A separate file (not inline) because the Content-Security-Policy only allows scripts from our own origin.
// Without a saved choice the page simply follows the system setting (prefers-color-scheme).
try {
  var theme = localStorage.getItem("docai.theme");
  if (theme === "light" || theme === "dark") document.documentElement.setAttribute("data-theme", theme);
} catch (e) {
  /* storage unavailable: follow the system */
}
