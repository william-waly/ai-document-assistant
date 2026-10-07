import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import MessageContent from "./components/MessageContent";

describe("MessageContent", () => {
  it("renders paragraphs, lists and bold text", () => {
    const { container } = render(
      <MessageContent content={"Første avsnitt med **fet** tekst.\n\n- punkt en\n- punkt to\n\n1. først\n2. så"} />,
    );
    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(container.querySelector("strong")).toHaveTextContent("fet");
    expect(container.querySelectorAll("ul li")).toHaveLength(2);
    expect(container.querySelectorAll("ol li")).toHaveLength(2);
  });

  it("renders code blocks as text", () => {
    const { container } = render(<MessageContent content={"```python\nprint('hei')\n```"} />);
    expect(container.querySelector("pre code")).toHaveTextContent("print('hei')");
  });

  it("never turns model output into HTML", () => {
    const evil = '<img src=x onerror="alert(1)"> <script>alert(2)</script> **fet**';
    const { container } = render(<MessageContent content={evil} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container).toHaveTextContent('<img src=x onerror="alert(1)">');
    expect(container).toHaveTextContent("<script>alert(2)</script>");
  });

  it("turns [n] markers into buttons that report which source was clicked", async () => {
    const onCite = vi.fn();
    render(<MessageContent content="Se [1] og [2, 3]." onCite={onCite} />);

    await userEvent.click(screen.getByRole("button", { name: "Vis kilde 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Vis kilde 3" }));

    expect(onCite.mock.calls).toEqual([[1], [3]]);
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("leaves brackets that are not citations alone", () => {
    render(<MessageContent content="Matrisen [a] og listen [x, y] er ikke kilder." />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
