import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
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

const loggedIn = (extra: Parameters<typeof mockApi>[0] = {}) =>
  mockApi({ "GET /users/me": { body: USER }, ...extra });

describe("access control in the UI", () => {
  it("sends visitors without a session to the login page", async () => {
    renderApp("/documents");
    expect(await screen.findByRole("heading", { name: "Logg inn" })).toBeInTheDocument();
  });

  it("lets a returning user in when the stored token is still valid", async () => {
    sessionStorage.setItem("docai.token", "stored-token");
    loggedIn({ "GET /documents": { body: [DOC] }, "GET /conversations": { body: [] } });
    renderApp("/");
    expect(await screen.findByRole("heading", { name: "Oversikt" })).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
  });

  it("drops an expired stored token and shows the login page", async () => {
    sessionStorage.setItem("docai.token", "expired-token");
    mockApi({ "GET /users/me": { status: 401, body: { detail: "Not authenticated" } } });
    renderApp("/");
    expect(await screen.findByRole("heading", { name: "Logg inn" })).toBeInTheDocument();
    expect(sessionStorage.getItem("docai.token")).toBeNull();
  });
});

describe("login", () => {
  it("logs in and shows the dashboard with the user's numbers", async () => {
    mockApi({
      "POST /auth/login": { body: { access_token: "new-token" } },
      "GET /users/me": { body: USER },
      "GET /documents": { body: [DOC, { ...DOC, id: "d2", filename: "annen.pdf" }] },
      "GET /conversations": { body: [] },
    });
    renderApp("/login");

    await userEvent.type(screen.getByLabelText("E-post"), "alice@example.com");
    await userEvent.type(screen.getByLabelText("Passord"), "correct-horse-1");
    await userEvent.click(screen.getByRole("button", { name: "Logg inn" }));

    expect(await screen.findByRole("heading", { name: "Oversikt" })).toBeInTheDocument();
    expect(await screen.findByText("forelesning.pdf")).toBeInTheDocument();
    expect(sessionStorage.getItem("docai.token")).toBe("new-token");
  });

  it("shows a readable error for a wrong password and stays on the page", async () => {
    mockApi({ "POST /auth/login": { status: 401, body: { detail: "Invalid email or password" } } });
    renderApp("/login");

    await userEvent.type(screen.getByLabelText("E-post"), "alice@example.com");
    await userEvent.type(screen.getByLabelText("Passord"), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "Logg inn" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Feil e-post eller passord.");
    expect(screen.getByRole("heading", { name: "Logg inn" })).toBeInTheDocument();
  });
});

describe("registration", () => {
  it("rejects mismatching passwords without calling the server", async () => {
    const { fetchMock } = mockApi({});
    renderApp("/register");

    await userEvent.type(screen.getByLabelText("E-post"), "new@example.com");
    await userEvent.type(screen.getByLabelText("Passord"), "correct-horse-1");
    await userEvent.type(screen.getByLabelText("Gjenta passord"), "something-else-1");
    await userEvent.click(screen.getByRole("button", { name: "Opprett konto" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Passordene er ikke like.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates the account, logs in and shows the dashboard", async () => {
    mockApi({
      "POST /auth/register": { status: 201, body: USER },
      "POST /auth/login": { body: { access_token: "t" } },
      "GET /users/me": { body: USER },
      "GET /documents": { body: [] },
      "GET /conversations": { body: [] },
    });
    renderApp("/register");

    await userEvent.type(screen.getByLabelText("E-post"), "alice@example.com");
    await userEvent.type(screen.getByLabelText("Passord"), "correct-horse-1");
    await userEvent.type(screen.getByLabelText("Gjenta passord"), "correct-horse-1");
    await userEvent.click(screen.getByRole("button", { name: "Opprett konto" }));

    expect(await screen.findByRole("heading", { name: "Oversikt" })).toBeInTheDocument();
  });
});

describe("documents", () => {
  const session = () => sessionStorage.setItem("docai.token", "t");

  it("lists the user's documents with when they will be deleted", async () => {
    session();
    loggedIn({ "GET /documents": { body: [DOC] } });
    renderApp("/documents");
    expect(await screen.findByRole("link", { name: "forelesning.pdf" })).toBeInTheDocument();
    expect(screen.getByText("2,0 KB")).toBeInTheDocument();
  });

  it("refuses non-PDF files in the browser, before anything is sent", async () => {
    session();
    const { calls } = loggedIn({ "GET /documents": { body: [] } });
    renderApp("/documents");
    await screen.findByText("Ingen dokumenter ennå.");

    const input = document.querySelector<HTMLInputElement>("#file-input")!;
    await userEvent.upload(input, new File(["hei"], "notater.txt", { type: "text/plain" }), { applyAccept: false });

    expect(await screen.findByRole("alert")).toHaveTextContent("«notater.txt» er ikke en PDF-fil.");
    expect(calls.some((c) => c.key === "POST /documents")).toBe(false);
  });

  it("uploads a PDF and reloads the list", async () => {
    session();
    let uploaded = false;
    const { calls } = loggedIn({
      "GET /documents": () => ({ body: uploaded ? [DOC] : [] }),
      "POST /documents": () => {
        uploaded = true;
        return { status: 201, body: DOC };
      },
    });
    renderApp("/documents");
    await screen.findByText("Ingen dokumenter ennå.");

    const input = document.querySelector<HTMLInputElement>("#file-input")!;
    await userEvent.upload(input, new File(["%PDF-1.4"], "forelesning.pdf", { type: "application/pdf" }));

    expect(await screen.findByRole("link", { name: "forelesning.pdf" })).toBeInTheDocument();
    expect(calls.filter((c) => c.key === "POST /documents")).toHaveLength(1);
  });

  it("asks for confirmation before deleting, then deletes", async () => {
    session();
    let deleted = false;
    const { calls } = loggedIn({
      "GET /documents": () => ({ body: deleted ? [] : [DOC] }),
      "DELETE /documents/d1": () => {
        deleted = true;
        return { status: 204 };
      },
    });
    renderApp("/documents");
    await userEvent.click(await screen.findByRole("button", { name: "Slett" }));

    expect(calls.some((c) => c.key.startsWith("DELETE"))).toBe(false); // nothing yet
    const dialog = screen.getByRole("dialog"); // the table row ALSO has a "Slett" button
    await userEvent.click(within(dialog).getByRole("button", { name: "Slett" }));
    await waitFor(() => expect(calls.some((c) => c.key === "DELETE /documents/d1")).toBe(true));
    expect(await screen.findByText("Ingen dokumenter ennå.")).toBeInTheDocument();
  });
});

describe("account", () => {
  it("requires the password before erasing all data", async () => {
    sessionStorage.setItem("docai.token", "t");
    const { calls } = loggedIn({
      "DELETE /users/me/data": { body: { documents: 2, conversations: 1 } },
    });
    renderApp("/account");

    await userEvent.click(await screen.findByRole("button", { name: "Slett alle dataene mine" }));
    const confirm = screen.getByRole("button", { name: "Slett alt" });
    expect(confirm).toBeDisabled(); // no password yet

    await userEvent.type(screen.getByLabelText("Bekreft med passordet ditt"), "correct-horse-1");
    await userEvent.click(confirm);

    expect(await screen.findByText("Slettet 2 dokument(er) og 1 samtale(r).")).toBeInTheDocument();
    const call = calls.find((c) => c.key === "DELETE /users/me/data");
    expect(JSON.parse(String(call?.init?.body))).toEqual({ password: "correct-horse-1" });
  });
});
