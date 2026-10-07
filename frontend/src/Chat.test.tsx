import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import type { ChatMessage, ConversationDetail } from "./api";
import App from "./App";
import { AuthProvider } from "./auth";
import { DOC, mockApi, SOURCE, SUMMARY, USER } from "./test/mockApi";

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

const message = (over: Partial<ChatMessage>): ChatMessage => ({
  id: "m",
  role: "assistant",
  content: "",
  sources: [],
  created_at: "2026-03-01T10:00:00Z",
  ...over,
});

const QUESTION = message({ id: "m1", role: "user", content: "Hva er SRP?" });
const ANSWER = message({ id: "m2", content: "En klasse bør ha ett hovedansvar [1].", sources: [SOURCE] });

const DETAIL: ConversationDetail = {
  id: "c1",
  title: "Hva er SRP?",
  created_at: "2026-03-01T10:00:00Z",
  messages: [QUESTION, ANSWER],
};

beforeEach(() => sessionStorage.setItem("docai.token", "t"));

const base = (extra: Parameters<typeof mockApi>[0] = {}) =>
  mockApi({
    "GET /users/me": { body: USER },
    "GET /documents": { body: [DOC] },
    "GET /conversations": { body: [SUMMARY] },
    ...extra,
  });

const sourceChip = () => screen.findByRole("button", { name: /DAT109_forelesning_05\.pdf.*side 12/ });

describe("viewing a conversation", () => {
  it("shows earlier messages and the cited source as file name and page", async () => {
    base({ "GET /conversations/c1": { body: DETAIL } });
    renderApp("/chat/c1");

    expect(await screen.findByText(/ett hovedansvar/, { selector: ".message-content span" })).toBeInTheDocument();
    expect(await sourceChip()).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Hva er SRP?" })).toBeInTheDocument();
  });

  it("shows the latest answer's source in the Sources panel right away, with page, excerpt and a link", async () => {
    base({ "GET /conversations/c1": { body: DETAIL } });
    renderApp("/chat/c1");

    const panel = within(await screen.findByRole("complementary", { name: "Kilder" }));
    expect(await panel.findByText("Side 12")).toBeInTheDocument();
    expect(panel.getByText(/bør ha ett hovedansvar/)).toBeInTheDocument();
    expect(panel.getByRole("link", { name: /Åpne dokumentet/ })).toHaveAttribute("href", "/documents/d1");
  });

  it("switches the Sources panel when another answer's source is clicked", async () => {
    const other = { ...SOURCE, document_id: "d2", filename: "annen.pdf", page_number: 3, snippet: "Et annet utdrag." };
    const detail = {
      ...DETAIL,
      messages: [
        QUESTION,
        ANSWER,
        message({ id: "m3", role: "user", content: "Og noe mer?" }),
        message({ id: "m4", content: "Se også dette [1].", sources: [other] }),
      ],
    };
    base({ "GET /conversations/c1": { body: detail } });
    renderApp("/chat/c1");
    const panel = within(await screen.findByRole("complementary", { name: "Kilder" }));
    expect(await panel.findByText("annen.pdf")).toBeInTheDocument(); // latest answer first

    await userEvent.click(await sourceChip()); // the older answer's source

    expect(panel.getByText("DAT109_forelesning_05.pdf")).toBeInTheDocument();
    expect(panel.getByText("Side 12")).toBeInTheDocument();
  });

  it("shows an empty Sources panel when the conversation has no sources yet", async () => {
    base({ "GET /conversations/c1": { body: { ...DETAIL, messages: [] } } });
    renderApp("/chat/c1");
    const panel = within(await screen.findByRole("complementary", { name: "Kilder" }));
    expect(panel.getByText("Kildene vises her")).toBeInTheDocument();
  });

  it("makes the [1] marker in the text clickable too", async () => {
    base({ "GET /conversations/c1": { body: DETAIL } });
    renderApp("/chat/c1");

    await userEvent.click(await screen.findByRole("button", { name: "Vis kilde 1" }));

    expect(within(screen.getByRole("complementary", { name: "Kilder" })).getByText("Side 12")).toBeInTheDocument();
  });

  it("marks an answer without sources as 'not found in your documents'", async () => {
    const detail = {
      ...DETAIL,
      messages: [message({ id: "m9", content: "Jeg finner ikke tilstrekkelig informasjon i dokumentene dine." })],
    };
    base({ "GET /conversations/c1": { body: detail } });
    renderApp("/chat/c1");

    const answer = await screen.findByText(/finner ikke tilstrekkelig informasjon/);
    expect(answer.closest("article")).toHaveClass("chat-message--noinfo");
    expect(screen.queryByText("KILDER")).not.toBeInTheDocument();
  });

  it("shows a clear error for a conversation that does not exist (or belongs to someone else)", async () => {
    base({ "GET /conversations/nope": { status: 404, body: { detail: "Conversation not found" } } });
    renderApp("/chat/nope");
    expect(await screen.findByRole("alert")).toHaveTextContent("Samtalen finnes ikke.");
  });

  it("lists the conversations in the history rail", async () => {
    base();
    renderApp("/chat");
    const rail = within(await screen.findByRole("complementary", { name: "Samtaler" }));
    expect(await rail.findByText("Hva er SRP?")).toBeInTheDocument();
    expect(rail.getByRole("link", { name: "Start ny samtale" })).toHaveAttribute("href", "/chat");
  });

  it("offers suggested prompts that fill the question box", async () => {
    base();
    renderApp("/chat");
    await userEvent.click(await screen.findByRole("button", { name: /Hva er hovedbegrepene\?/ }));
    expect(screen.getByLabelText("Spørsmål")).toHaveValue("Hva er hovedbegrepene?");
  });
});

describe("asking questions", () => {
  it("starts a new conversation on the first question and shows the answer with sources", async () => {
    const { calls } = base({
      "POST /conversations": { status: 201, body: { ...SUMMARY, message_count: 0, last_message_at: null } },
      "POST /conversations/c1/messages": { status: 201, body: { user_message: QUESTION, assistant_message: ANSWER } },
      "GET /conversations/c1": { body: DETAIL },
    });
    renderApp("/chat");

    await userEvent.type(await screen.findByLabelText("Spørsmål"), "Hva er SRP?");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await sourceChip()).toBeInTheDocument();
    expect(calls.filter((c) => c.key === "POST /conversations")).toHaveLength(1);
    const sent = calls.find((c) => c.key === "POST /conversations/c1/messages");
    expect(JSON.parse(String(sent?.init?.body))).toEqual({ content: "Hva er SRP?" }); // all documents: no document_id
  });

  it("sends with Enter and keeps Shift+Enter for new lines", async () => {
    const { calls } = base({
      "GET /conversations/c1": { body: { ...DETAIL, messages: [] } },
      "POST /conversations/c1/messages": { status: 201, body: { user_message: QUESTION, assistant_message: ANSWER } },
    });
    renderApp("/chat/c1");
    const box = await screen.findByLabelText("Spørsmål");

    await userEvent.type(box, "linje en{Shift>}{Enter}{/Shift}linje to");
    expect(box).toHaveValue("linje en\nlinje to");
    expect(calls.some((c) => c.key.startsWith("POST /conversations/c1/messages"))).toBe(false);

    await userEvent.type(box, "{Enter}");
    await waitFor(() => expect(calls.some((c) => c.key === "POST /conversations/c1/messages")).toBe(true));
  });

  it("shows a loading state while waiting and blocks double sending", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    base({ "GET /conversations/c1": { body: { ...DETAIL, messages: [] } } });
    const original = globalThis.fetch;
    // A slow server: the answer only arrives when we let it.
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/conversations/c1/messages")) {
        await gate;
        return new Response(JSON.stringify({ user_message: QUESTION, assistant_message: ANSWER }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }
      return original(input, init);
    }) as typeof fetch;

    renderApp("/chat/c1");
    await userEvent.type(await screen.findByLabelText("Spørsmål"), "Hva er SRP?");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText(/Søker i dokumentene og skriver svar/)).toBeInTheDocument();
    expect(screen.getByText("Tenker…")).toBeInTheDocument();
    expect(screen.getByLabelText("Spørsmål")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();

    release();
    expect(await sourceChip()).toBeInTheDocument();
    expect(screen.queryByText("Tenker…")).not.toBeInTheDocument();
  });

  it("keeps the question in the box and shows the error when the language model is down", async () => {
    base({
      "GET /conversations/c1": { body: { ...DETAIL, messages: [] } },
      "POST /conversations/c1/messages": { status: 502, body: { detail: "The language model is unavailable" } },
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
          : { status: 201, body: { user_message: QUESTION, assistant_message: ANSWER } };
      },
      "GET /conversations/c1": { body: DETAIL },
    });
    renderApp("/chat");

    await userEvent.type(await screen.findByLabelText("Spørsmål"), "Hva er SRP?");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByRole("alert");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await sourceChip()).toBeInTheDocument();
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

  it("blocks asking when there are no documents to answer from, and says why", async () => {
    base({ "GET /documents": { body: [] } });
    renderApp("/chat");
    expect(await screen.findByText(/Du må laste opp et dokument før du kan stille spørsmål/)).toBeInTheDocument();
    expect(screen.getByLabelText("Spørsmål")).toBeDisabled();
  });
});

describe("limiting a question to one document", () => {
  it("sends the chosen document's id", async () => {
    const { calls } = base({
      "GET /conversations/c1": { body: { ...DETAIL, messages: [] } },
      "POST /conversations/c1/messages": { status: 201, body: { user_message: QUESTION, assistant_message: ANSWER } },
    });
    renderApp("/chat/c1");

    await userEvent.click(await screen.findByRole("button", { name: /Alle dokumenter \(1\)/ }));
    await userEvent.click(within(screen.getByRole("group")).getByRole("radio", { name: /forelesning\.pdf/ }));
    await userEvent.click(screen.getByRole("button", { name: "Ferdig" }));
    await userEvent.type(screen.getByLabelText("Spørsmål"), "Hva er SRP?");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(calls.some((c) => c.key === "POST /conversations/c1/messages")).toBe(true));
    const sent = calls.find((c) => c.key === "POST /conversations/c1/messages");
    expect(JSON.parse(String(sent?.init?.body))).toEqual({ content: "Hva er SRP?", document_id: "d1" });
  });

  it("is preselected when coming from a document ('Start samtale')", async () => {
    base();
    renderApp("/chat?doc=d1");
    expect(await screen.findByRole("button", { name: /forelesning\.pdf/ })).toBeInTheDocument();
  });
});

describe("deleting a conversation", () => {
  it("asks first, then deletes and returns to a fresh chat", async () => {
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

    await userEvent.click(await screen.findByRole("button", { name: "Slett samtalen" }));
    expect(calls.some((c) => c.key.startsWith("DELETE"))).toBe(false);
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Slett" }));

    await waitFor(() => expect(calls.some((c) => c.key === "DELETE /conversations/c1")).toBe(true));
    expect(await screen.findByText("Samtalene dine vises her.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Ny samtale" })).toBeInTheDocument();
  });
});
