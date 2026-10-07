import { Moon, Sun } from "lucide-react";
import { useTheme } from "../useTheme";

/** Quick switch in the top bar. "Follow the system" is chosen on the account page. */
export default function ThemeToggle() {
  const { effective, choose } = useTheme();
  const toDark = effective === "light";
  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      onClick={() => choose(toDark ? "dark" : "light")}
      aria-label={toDark ? "Bytt til mørk modus" : "Bytt til lys modus"}
      title={toDark ? "Mørk modus" : "Lys modus"}
    >
      {toDark ? <Moon size={17} /> : <Sun size={17} />}
    </button>
  );
}
