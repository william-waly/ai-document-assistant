import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CountUp from "./components/CountUp";

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("reduce") ? reduce : false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("CountUp", () => {
  it("shows the final value at once with reduced motion, padded", () => {
    mockReducedMotion(true);
    const { container } = render(<CountUp value={3} pad={2} />);
    expect(screen.getByText("03", { selector: ".visually-hidden" })).toBeInTheDocument();
    expect(container.querySelector("[aria-hidden='true']")).toHaveTextContent("03");
  });

  it("always exposes the final value to screen readers while animating", () => {
    mockReducedMotion(false);
    const { container } = render(<CountUp value={12} />);
    expect(container.querySelector(".visually-hidden")).toHaveTextContent("12");
    // the animated digits are decoration only
    expect(container.querySelector("[aria-hidden='true']")).not.toBeNull();
  });

  it("renders zero without animating", () => {
    mockReducedMotion(false);
    const { container } = render(<CountUp value={0} pad={2} />);
    expect(container.querySelector("[aria-hidden='true']")).toHaveTextContent("00");
  });
});
