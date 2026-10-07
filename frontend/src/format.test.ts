import { describe, expect, it } from "vitest";
import { displayName, formatBytes, greeting, percent, retentionDays, timeAgo, truncate } from "./format";

describe("formatBytes", () => {
  it("uses sensible units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2,0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5,0 MB");
  });
});

describe("truncate", () => {
  it("leaves short text alone", () => {
    expect(truncate("kort", 10)).toBe("kort");
  });

  it("cuts at a word boundary and adds an ellipsis", () => {
    expect(truncate("en to tre fire fem", 12)).toBe("en to tre…");
  });
});

describe("percent", () => {
  it("rounds and never goes negative", () => {
    expect(percent(0.824)).toBe("82 %");
    expect(percent(-0.2)).toBe("0 %");
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-10-07T12:00:00Z").getTime();
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("describes recent times in Norwegian", () => {
    expect(timeAgo(ago(10_000), now)).toBe("Akkurat nå");
    expect(timeAgo(ago(5 * 60_000), now)).toBe("5 min siden");
    expect(timeAgo(ago(3 * 3_600_000), now)).toBe("3 t siden");
    expect(timeAgo(ago(30 * 3_600_000), now)).toBe("I går");
    expect(timeAgo(ago(4 * 86_400_000), now)).toBe("4 dager siden");
  });

  it("falls back to a date after two weeks, and never goes negative", () => {
    expect(timeAgo(ago(30 * 86_400_000), now)).toMatch(/2026/);
    expect(timeAgo(new Date(now + 60_000).toISOString(), now)).toBe("Akkurat nå");
  });
});

describe("greeting and names", () => {
  it("greets by time of day", () => {
    expect(greeting(new Date(2026, 0, 1, 3))).toBe("God natt");
    expect(greeting(new Date(2026, 0, 1, 8))).toBe("God morgen");
    expect(greeting(new Date(2026, 0, 1, 14))).toBe("God dag");
    expect(greeting(new Date(2026, 0, 1, 21))).toBe("God kveld");
  });

  it("derives a first name from the e-mail address, since no name is stored", () => {
    expect(displayName("william.waly@example.com")).toBe("William");
    expect(displayName("alice@example.com")).toBe("Alice");
    expect(displayName("bob_smith+test@example.com")).toBe("Bob");
    expect(displayName("@example.com")).toBe("@example.com");
  });
});

describe("retentionDays", () => {
  it("is the number of days between upload and automatic deletion", () => {
    expect(retentionDays("2026-02-01T10:00:00Z", "2026-05-02T10:00:00Z")).toBe(90);
    expect(retentionDays("2026-02-01T10:00:00Z", null)).toBeNull();
  });
});
