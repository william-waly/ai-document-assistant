import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import type { ChatMessage, ConversationDetail } from "./api";
import App from "./App";
import { AuthProvider } from "./auth";
import { DOC, mockApi, USER } from "./test/mockApi";

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

const SOURCE = {
  ref: 1,
  document_id: "d1",
  filename: "DAT109_forelesning_05.pdf",
  page_number: 12,
  snippet: "Single Responsibility Principle betyr at en klasse bør ha ett hovedansvar.",
  score: 0.82,
};

const message = (over: Partial<ChatMessage>): ChatMessage => ({
  id: "m",
  role: "assistant",
  content: "",
  sources: [],
  created_at: "2026-03-01T10:00:00Z",
  ...over,
});

const SUMMARY = {
  id: "c1",
  title: "Hva er SRP?",
  created_at: "2026-03-01T10:00:00Z",
  message_count: 2,
  last_message_at: "2026-03-01T10:01:00Z",
};

const DETAIL: ConversationDetail = {
  id: "c1",
  title: "Hva er SRP?",
  created_at: "2026-03-01T10:00:00Z",
  messages: [
    message({ id: "m1", role: "user", content: "Hva er SRP?" }),
    message({ id: "m2", content: "En klasse bør ha ett hovedansvar [1].", sources: [SOURCE] }),
  ],
};

beforeEach(() => sessionStorage.setItem("docai.token", "t"));

const base = (extra: Parameters<typeof mockApi>[0] = {}) =>
  mockApi({
    "GET /users/me": { body: USER },
    "GET /documents": { body: [DOC] },
    "GET /conversations": { body: [SUMMARY] },
    ...extra,
  });

describe("viewing a conversation", () => {
  it("shows earlier messages, with the cited source: file name and page", async () => {
    base({ "GET /conversations/c1": { body: DETAIL } });
    renderApp("/chat/c1");

    expect(await screen.findByText("Hva er SRP?", { selector: ".msg p" })).toBeInTheDocument();
    expect(screen.getByText(/ett hovedansvar/, { selector: ".msg p" })).toBeInTheDocument();
    const sources = screen.getByRole("list", { name: "Kilder" });
    expect(within(sources).getByText(/DAT109_forelesning_05\.pdf – side 12/)).toBeInTheDocument();
  });

  it("opens a source to show the excerpt and a link to the document", async () => {
    base({ "GET /conversations/c1": { body: DETAIL } });
    renderApp("/chat/c1");

    await userEvent.click(await screen.findByText(/DAT109_forelesning_05\.pdf – side 12/));

    expect(screen.getByText(/bør ha ett hovedansvar\.$/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Åpne dokumentet" })).toHaveAttribute("href", "/documents/d1");
  });

  it("marks an answer without sources as 'not found in your documents'", async () => {
    const detail = {
      ...DETAIL,
      messages: [message({ id: "m9", content: "Jeg finner ikke tilstrekkelig informasjon i dokumentene dine." })],
    };
    base({ "GET /conversations/c1": { body: detail } });
    renderApp("/chat/c1");

    const answer = await screen.findByText(/finner ikke tilstrekkelig informasjon/);
    expect(answer.closest(".msg")).toHaveClass("msg-noinfo");
    expect(screen.queryByRole("list", { name: "Kilder" })).not.toBeInTheDocument();
  });

  it("shows a clear error for a conversation that does not exist (or belongs to someone else)", async () => {
    base({ "GET /conversations/nope": { status: 404, body: { detail: "Conversation not found" } } });
    renderApp("/chat/nope");
    expect(await screen.findByRole("alert")).toHaveTextContent("Samtalen finnes ikke.");
  });

  it("lists the conversations in the sidebar", async () => {
    base();
    renderApp("/chat");
    const sidebar = await screen.findByRole("complementary", { name: "Samtaler" });
    expect(await within(sidebar).findByText("Hva er SRP?")).toBeInTheDocument();
    expect(within(sidebar).getByRole("link", { name: "Ny samtale" })).toHaveAttribute("href", "/chat");
  });
});

describe("asking questions", () => {
  it("starts a new conversation on the first question and shows the answer with sources", async () => {
    let created = false;
    const { calls } = base({
      "POST /conversations": () => {
        created = true;
        return { status: 201, body: { ...SUMMARY, message_count: 0, last_message_at: null } };
      },
      "POST /conversations/c1/messages": {
        status: 201,
        body: { user_message: DETAIL.messages[0], assistant_message: DETAIL.messages[1] },
      },
      "GET /conversations/c1": { body: DETAIL },
    });
    renderApp("/chat");

    await userEvent.type(await screen.findByLabelText("Spørsmål"), "Hva er SRP?");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText(/DAT109_forelesning_05\.pdf – side 12/)).toBeInTheDocument();
    expect(created).toBe(true);
    expect(calls.filter((c) => c.key === "POST /conversations")).toHaveLength(1);
    const sent = calls.find((c) => c.key === "POST /conversations/c1/messages");
    expect(JSON.parse(String(sent?.init?.body))).toEqual({ content: "Hva er SRP?" });
  });

  it("shows a loading state while waiting for the answer", async () => {
    let release: (value: unknown) => void = () => {};
    const gate = new Promise((resolve) => (release = resolve));
    base({
      "GET /conversations/c1": { body: { ...DETAIL, messages: [] } },
      "POST /conversations/c1/messages": () => {
        throw new Error("replaced below");
      },
    });
    // A slow server: the response only arrives when we let it.
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/conversations/c1/messages")) {
        await gate;
        return new Response(
          JSON.stringify({ user_message: DETAIL.messages[0], assistant_message: DETAIL.messages[1] }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }
      return original(input, init);
    }) as typeof fetch;

    renderApp("/chat/c1");
    await userEvent.type(await screen.findByLabelText("Spørsmål"), "Hva er SRP?");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText(/Søker i dokumentene og skriver svar/)).toBeInTheDocument();
    expect(screen.getByLabelText("Spørsmål")).toBeDisabled(); // no double sending
    release(null);
    expect(await screen.findByText(/ett hovedansvar/, { selector: ".msg p" })).toBeInTheDocument();
    expect(screen.queryByText(/Søker i dokumentene og skriver svar/)).not.toBeInTheDocument();
  });

  it("keeps the question in the box and shows the error when the language model is down", async () => {
    base({
      "GET /conversations/c1": { body: { ...DETAIL, messages: [] } },
      "POST /conversations/c1/messages": {
        status: 502,
        body: { detail: "The language model is unavailable" },
      },
    });
    renderApp("/chat/c1");

    await userEvent.type(await screen.findByLabelText("Spørsmål"), "Hva er SRP?");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Språkmodellen er utilgjengelig");
    expect(screen.getByLabelText("Spørsmål")).toHaveValue("Hva er SRP?"); // ready to retry
  });

  it("reuses the conversation when a first question fails and is retried", async () => {
    let attempts = 0;
    const { calls } = base({
      "POST /conversations": { status: 201, body: { ...SUMMARY, message_count: 0, last_message_at: null } },
      "POST /conversations/c1/messages": () => {
        attempts += 1;
        return attempts === 1
          ? { status: 502, body: { detail: "The embedding service is unavailable" } }
          : { status: 201, body: { user_message: DETAIL.messages[0], assistant_message: DETAIL.messages[1] } };
      },
      "GET /conversations/c1": { body: DETAIL },
    });
    renderApp("/chat");

    await userEvent.type(await screen.findByLabelText("Spørsmål"), "Hva er SRP?");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByRole("alert");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText(/DAT109_forelesning_05\.pdf – side 12/)).toBeInTheDocument();
    expect(calls.filter((c) => c.key === "POST /conversations")).toHaveLength(1); // not two empty chats
  });

  it("does not send an empty question", async () => {
    base({ "GET /conversations/c1": { body: { ...DETAIL, messages: [] } } });
    renderApp("/chat/c1");
    await screen.findByLabelText("Spørsmål");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Spørsmål"), "   ");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("warns when there are no documents to answer from", async () => {
    base({ "GET /documents": { body: [] } });
    renderApp("/chat");
    expect(await screen.findByText(/Du har ingen dokumenter ennå/)).toBeInTheDocument();
  });
});

describe("deleting a conversation", () => {
  it("asks first, then deletes and returns to the empty chat page", async () => {
    let deleted = false;
    const { calls } = base({
      "GET /conversations": () => ({ body: deleted ? [] : [SUMMARY] }),
      "GET /conversations/c1": { body: DETAIL },
      "DELETE /conversations/c1": () => {
        deleted = true;
        return { status: 204 };
      },
    });
    renderApp("/chat/c1");

    await userEvent.click(await screen.findByRole("button", { name: "Slett samtale" }));
    expect(calls.some((c) => c.key.startsWith("DELETE"))).toBe(false);
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Slett" }));

    await waitFor(() => expect(calls.some((c) => c.key === "DELETE /conversations/c1")).toBe(true));
    expect(await screen.findByText("Ingen samtaler ennå.")).toBeInTheDocument();
  });
});

describe("dashboard", () => {
  it("has a 'Ny samtale' button and lists recent conversations", async () => {
    base();
    renderApp("/");
    expect(await screen.findByRole("link", { name: "Ny samtale" })).toHaveAttribute("href", "/chat");
    expect(await screen.findByRole("link", { name: "Hva er SRP?" })).toHaveAttribute("href", "/chat/c1");
  });
});
