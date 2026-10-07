import { afterEach, describe, expect, it, vi } from "vitest";
import initScript from "../public/theme-init.js?raw";
import styles from "./styles.css?raw";
import { applyPreference, effectiveTheme, readPreference } from "./theme";

const root = () => document.documentElement;

function mockSystemTheme(dark: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("dark") ? dark : !dark,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("theme preference", () => {
  it("follows the system when nothing is saved", () => {
    expect(readPreference()).toBe("system");
    expect(root()).not.toHaveAttribute("data-theme");
  });

  it("saves and applies an explicit choice, and clears it for 'system'", () => {
    applyPreference("dark");
    expect(root()).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem("docai.theme")).toBe("dark");
    expect(readPreference()).toBe("dark");

    applyPreference("system");
    expect(root()).not.toHaveAttribute("data-theme");
    expect(localStorage.getItem("docai.theme")).toBeNull();
  });

  it("ignores unknown saved values", () => {
    localStorage.setItem("docai.theme", "purple");
    expect(readPreference()).toBe("system");
  });

  it("keeps working when storage is unavailable (private mode, blocked cookies)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readPreference()).toBe("system");
    expect(() => applyPreference("dark")).not.toThrow();
    expect(root()).toHaveAttribute("data-theme", "dark"); // still applied for this visit
    vi.restoreAllMocks();
  });

  it("resolves 'system' using the operating system's setting", () => {
    mockSystemTheme(true);
    expect(effectiveTheme("system")).toBe("dark");
    mockSystemTheme(false);
    expect(effectiveTheme("system")).toBe("light");
    expect(effectiveTheme("dark")).toBe("dark"); // an explicit choice always wins
  });

  it("falls back to light where matchMedia does not exist", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(effectiveTheme("system")).toBe("light");
  });
});

describe("theme-init.js (runs before the first paint)", () => {
  const run = () => new Function(initScript)();

  it("applies a saved choice", () => {
    localStorage.setItem("docai.theme", "dark");
    run();
    expect(root()).toHaveAttribute("data-theme", "dark");
  });

  it("does nothing without a saved choice, or with garbage", () => {
    run();
    expect(root()).not.toHaveAttribute("data-theme");
    localStorage.setItem("docai.theme", "javascript:alert(1)");
    run();
    expect(root()).not.toHaveAttribute("data-theme");
  });

  it("does not throw when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(run).not.toThrow();
    vi.restoreAllMocks();
  });
});

describe("stylesheet", () => {
  /** Every [selector, declarations] block of the stylesheet. */
  const blocks = [...styles.matchAll(/([^{}@][^{}]*)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));

  it("is actually loaded (the checks below would pass vacuously on an empty file)", () => {
    expect(styles.length).toBeGreaterThan(20_000);
    expect(blocks.length).toBeGreaterThan(300);
    expect(styles.match(/light-dark\(/g)?.length).toBeGreaterThan(200);
  });

  it("supports both colour schemes and the manual override", () => {
    expect(styles).toMatch(/color-scheme:\s*light dark/);
    expect(styles).toContain(':root[data-theme="dark"]');
    expect(styles).toContain(':root[data-theme="light"]');
  });

  it("gives every light surface a dark counterpart (no bare light background would stay white at night)", () => {
    const lightness = (hex: string) => {
      const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join("") : hex.slice(1);
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
      return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
    };
    const offenders: string[] = [];
    for (const { selector, body } of blocks) {
      // The always-dark teal panel on the login page is exempt. (Not a plain "story-" match: that
      // would also exempt "history-" rules, which is exactly the bug this test once let through.)
      if (/auth-story|(?<![a-z])story-/.test(selector)) continue;
      for (const decl of body.split(";")) {
        if (!/^\s*background/.test(decl)) continue;
        const bare = decl.replace(/light-dark\([^)]*\)/g, "").match(/#[0-9a-fA-F]{3,6}\b/g) ?? [];
        for (const hex of bare) if (lightness(hex) >= 0.6) offenders.push(`${selector} { ${decl.trim()} }`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("does not use any external address", () => {
    expect(styles).not.toMatch(/https?:\/\//);
  });
});
