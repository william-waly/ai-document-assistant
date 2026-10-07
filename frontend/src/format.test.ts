import { describe, expect, it } from "vitest";
import { formatBytes, percent, truncate } from "./format";

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
