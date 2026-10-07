import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { AuthProvider } from "./auth";
import { DOC, mockApi, SUMMARY, USER } from "./test/mockApi";

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

/** A logged-in session: the shell always loads the user's documents and conversations. */
const loggedIn = (extra: Parameters<typeof mockApi>[0] = {}) =>
  mockApi({
    "GET /users/me": { body: USER },
    "GET /documents": { body: [DOC] },
    "GET /conversations": { body: [SUMMARY] },
    ...extra,
  });

const GREETING = /God (natt|morgen|dag|kveld), Alice/;

describe("access control in the UI", () => {
  it("sends visitors without a session to the login page", async () => {
    renderApp("/documents");
    expect(await screen.findByRole("heading", { name: "Logg inn" })).toBeInTheDocument();
  });

  it("lets a returning user in when the stored token is still valid", async () => {
    sessionStorage.setItem("docai.token", "stored-token");
    loggedIn();
    renderApp("/");
    expect(await screen.findByRole("heading", { level: 1, name: GREETING })).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
  });

  it("drops an expired stored token and shows the login page", async () => {
    sessionStorage.setItem("docai.token", "expired-token");
    mockApi({ "GET /users/me": { status: 401, body: { detail: "Not authenticated" } } });
    renderApp("/");
    expect(await screen.findByRole("heading", { name: "Logg inn" })).toBeInTheDocument();
    expect(sessionStorage.getItem("docai.token")).toBeNull();
  });

  it("logs out and returns to the login page", async () => {
    sessionStorage.setItem("docai.token", "t");
    loggedIn();
    renderApp("/");
    await userEvent.click(await screen.findByRole("button", { name: "Logg ut" }));
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

    expect(await screen.findByRole("heading", { level: 1, name: GREETING })).toBeInTheDocument();
    const stats = screen.getByLabelText("Nøkkeltall");
    expect(within(stats).getByText("Dokumenter").parentElement).toHaveTextContent("02");
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

  it("explains missing or malformed input before calling the server", async () => {
    const { fetchMock } = mockApi({});
    renderApp("/login");
    await userEvent.click(screen.getByRole("button", { name: "Logg inn" }));
    expect(await screen.findByText("Skriv inn e-postadressen din.")).toBeInTheDocument();
    expect(screen.getByText("Skriv inn passordet.")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("E-post"), "ikke-en-epost");
    await userEvent.click(screen.getByRole("button", { name: "Logg inn" }));
    expect(await screen.findByText("Skriv inn en gyldig e-postadresse.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("can show and hide the password", async () => {
    renderApp("/login");
    const field = screen.getByLabelText("Passord");
    expect(field).toHaveAttribute("type", "password");
    await userEvent.click(screen.getByRole("button", { name: "Vis passord" }));
    expect(field).toHaveAttribute("type", "text");
    await userEvent.click(screen.getByRole("button", { name: "Skjul passord" }));
    expect(field).toHaveAttribute("type", "password");
  });
});

describe("registration", () => {
  it("rejects too short and mismatching passwords without calling the server", async () => {
    const { fetchMock } = mockApi({});
    renderApp("/register");

    await userEvent.type(screen.getByLabelText("E-post"), "new@example.com");
    await userEvent.type(screen.getByLabelText("Passord"), "kort");
    await userEvent.click(screen.getByRole("button", { name: "Opprett konto" }));
    expect(await screen.findByText("Passordet må ha minst 8 tegn.")).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Passord"));
    await userEvent.type(screen.getByLabelText("Passord"), "correct-horse-1");
    await userEvent.type(screen.getByLabelText("Gjenta passord"), "something-else-1");
    await userEvent.click(screen.getByRole("button", { name: "Opprett konto" }));
    expect(await screen.findByText("Passordene er ikke like.")).toBeInTheDocument();
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

    expect(await screen.findByRole("heading", { level: 1, name: GREETING })).toBeInTheDocument();
    expect(screen.getByText("Du har ikke lastet opp noen dokumenter ennå.")).toBeInTheDocument();
  });

  it("tells the user a taken e-mail address is taken", async () => {
    mockApi({ "POST /auth/register": { status: 409, body: { detail: "Email already registered" } } });
    renderApp("/register");
    await userEvent.type(screen.getByLabelText("E-post"), "alice@example.com");
    await userEvent.type(screen.getByLabelText("Passord"), "correct-horse-1");
    await userEvent.type(screen.getByLabelText("Gjenta passord"), "correct-horse-1");
    await userEvent.click(screen.getByRole("button", { name: "Opprett konto" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("E-postadressen er allerede i bruk.");
  });
});

describe("dashboard", () => {
  beforeEach(() => sessionStorage.setItem("docai.token", "t"));

  it("has a 'Ny samtale' button and lists recent conversations and documents", async () => {
    loggedIn();
    renderApp("/");
    const main = within(await screen.findByRole("main"));
    expect((await main.findAllByRole("link", { name: "Ny samtale" }))[0]).toHaveAttribute("href", "/chat");
    expect(await main.findByRole("link", { name: /Hva er SRP\?/ })).toHaveAttribute("href", "/chat/c1");
    const documentLinks = await main.findAllByRole("link", { name: /forelesning\.pdf/ }); // name + "open" action
    expect(documentLinks.every((link) => link.getAttribute("href") === "/documents/d1")).toBe(true);
  });

  it("counts questions (not messages) and pages", async () => {
    loggedIn({ "GET /conversations": { body: [{ ...SUMMARY, message_count: 6 }] } });
    renderApp("/");
    const stats = within(await screen.findByLabelText("Nøkkeltall"));
    expect(stats.getByText("Spørsmål stilt").parentElement).toHaveTextContent("03");
    expect(stats.getByText("Sider").parentElement).toHaveTextContent("3");
  });

  it("shows a friendly empty state for a new user", async () => {
    loggedIn({ "GET /documents": { body: [] }, "GET /conversations": { body: [] } });
    renderApp("/");
    expect(await screen.findByText("Du har ikke lastet opp noen dokumenter ennå.")).toBeInTheDocument();
    expect(screen.getByText("Du har ikke startet noen samtale ennå.")).toBeInTheDocument();
  });

  it("shows an error when the data cannot be loaded", async () => {
    loggedIn({ "GET /documents": { status: 500, body: null } });
    renderApp("/");
    expect(await screen.findByRole("alert")).toHaveTextContent("Noe gikk galt på serveren");
  });
});

describe("documents", () => {
  beforeEach(() => sessionStorage.setItem("docai.token", "t"));

  it("lists the user's documents with size and when they are deleted", async () => {
    loggedIn();
    renderApp("/documents");
    expect(await screen.findByRole("link", { name: /forelesning\.pdf/ })).toBeInTheDocument();
    expect(screen.getByText("2,0 KB")).toBeInTheDocument();
    expect(screen.getByText(/slettes automatisk 90 dager etter opplasting/)).toBeInTheDocument();
  });

  it("filters by name and sorts", async () => {
    loggedIn({
      "GET /documents": {
        body: [DOC, { ...DOC, id: "d2", filename: "arkitektur.pdf", size_bytes: 9_000_000 }],
      },
    });
    renderApp("/documents");
    await screen.findByRole("link", { name: /arkitektur\.pdf/ });

    await userEvent.type(screen.getByLabelText("Søk i dokumenter"), "arkit");
    expect(screen.queryByRole("link", { name: /forelesning\.pdf/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /arkitektur\.pdf/ })).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Søk i dokumenter"));
    await userEvent.type(screen.getByLabelText("Søk i dokumenter"), "finnes-ikke");
    expect(screen.getByText("Ingen dokumenter passer til søket.")).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Søk i dokumenter"));
    await userEvent.selectOptions(screen.getByRole("combobox"), "large");
    const names = screen.getAllByRole("link", { name: /\.pdf/ }).map((a) => a.textContent);
    expect(names[0]).toContain("arkitektur.pdf"); // largest first
  });

  it("refuses non-PDF files in the browser, before anything is sent", async () => {
    const { calls } = loggedIn({ "GET /documents": { body: [] } });
    renderApp("/documents");
    await screen.findByText("Ingen dokumenter ennå.");

    const input = document.querySelector<HTMLInputElement>("#file-input")!;
    await userEvent.upload(input, new File(["hei"], "notater.txt", { type: "text/plain" }), { applyAccept: false });

    expect(await screen.findByRole("alert")).toHaveTextContent("«notater.txt» er ikke en PDF-fil.");
    expect(calls.some((c) => c.key === "POST /documents")).toBe(false);
  });

  it("shows the server's reason when a PDF is rejected", async () => {
    loggedIn({
      "GET /documents": { body: [] },
      "POST /documents": { status: 422, body: { detail: "No extractable text found (scanned PDF? OCR is not supported)" } },
    });
    renderApp("/documents");
    await screen.findByText("Ingen dokumenter ennå.");
    const input = document.querySelector<HTMLInputElement>("#file-input")!;
    await userEvent.upload(input, new File(["%PDF-1.4"], "skannet.pdf", { type: "application/pdf" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Fant ingen tekst i PDF-en");
  });

  it("uploads a PDF and reloads the list", async () => {
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

    expect(await screen.findByRole("link", { name: /forelesning\.pdf/ })).toBeInTheDocument();
    expect(calls.filter((c) => c.key === "POST /documents")).toHaveLength(1);
    expect(await screen.findByText("Lastet opp: forelesning.pdf")).toBeInTheDocument();
  });

  it("asks for confirmation before deleting, then deletes", async () => {
    let deleted = false;
    const { calls } = loggedIn({
      "GET /documents": () => ({ body: deleted ? [] : [DOC] }),
      "DELETE /documents/d1": () => {
        deleted = true;
        return { status: 204 };
      },
    });
    renderApp("/documents");
    await userEvent.click(await screen.findByRole("button", { name: "Slett forelesning.pdf" }));

    expect(calls.some((c) => c.key.startsWith("DELETE"))).toBe(false); // nothing yet
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("forelesning.pdf");
    await userEvent.click(within(dialog).getByRole("button", { name: "Slett" }));

    await waitFor(() => expect(calls.some((c) => c.key === "DELETE /documents/d1")).toBe(true));
    expect(await screen.findByText("Ingen dokumenter ennå.")).toBeInTheDocument();
  });

  it("cancelling the confirmation deletes nothing", async () => {
    const { calls } = loggedIn();
    renderApp("/documents");
    await userEvent.click(await screen.findByRole("button", { name: "Slett forelesning.pdf" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Avbryt" }));
    expect(calls.some((c) => c.key.startsWith("DELETE"))).toBe(false);
  });
});

describe("document details", () => {
  beforeEach(() => sessionStorage.setItem("docai.token", "t"));

  it("shows the metadata and honest limits: no download or preview of the original", async () => {
    loggedIn({ "GET /documents/d1": { body: DOC } });
    renderApp("/documents/d1");

    expect(await screen.findByRole("heading", { level: 1, name: "forelesning.pdf" })).toBeInTheDocument();
    expect(screen.getByText("Klar")).toBeInTheDocument();
    expect(screen.getByText(/lagres ikke, så den kan ikke lastes ned/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /last ned/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Start samtale/ })).toHaveAttribute("href", "/chat?doc=d1");
  });

  it("deletes the document after confirmation and returns to the list", async () => {
    let deleted = false;
    const { calls } = loggedIn({
      "GET /documents": () => ({ body: deleted ? [] : [DOC] }),
      "GET /documents/d1": { body: DOC },
      "DELETE /documents/d1": () => {
        deleted = true;
        return { status: 204 };
      },
    });
    renderApp("/documents/d1");
    await userEvent.click(await screen.findByRole("button", { name: "Slett dokumentet" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Slett dokumentet" }));

    await waitFor(() => expect(calls.some((c) => c.key === "DELETE /documents/d1")).toBe(true));
    expect(await screen.findByRole("heading", { name: "Dokumenter" })).toBeInTheDocument();
  });

  it("shows a clear error for a document that is missing or belongs to someone else", async () => {
    loggedIn({ "GET /documents/nope": { status: 404, body: { detail: "Document not found" } } });
    renderApp("/documents/nope");
    expect(await screen.findByRole("alert")).toHaveTextContent("Dokumentet finnes ikke.");
  });
});

describe("conversations list", () => {
  beforeEach(() => sessionStorage.setItem("docai.token", "t"));

  it("lists, filters and deletes conversations", async () => {
    let deleted = false;
    const { calls } = loggedIn({
      "GET /conversations": () => ({
        body: deleted ? [] : [SUMMARY, { ...SUMMARY, id: "c2", title: "Om databaser" }],
      }),
      "DELETE /conversations/c2": () => {
        deleted = true;
        return { status: 204 };
      },
    });
    renderApp("/conversations");
    expect(await screen.findByRole("link", { name: /Om databaser/ })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Søk i samtaler"), "SRP");
    expect(screen.queryByRole("link", { name: /Om databaser/ })).not.toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Søk i samtaler"));

    await userEvent.click(screen.getByRole("button", { name: "Slett samtalen «Om databaser»" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Slett" }));
    await waitFor(() => expect(calls.some((c) => c.key === "DELETE /conversations/c2")).toBe(true));
  });
});

describe("account and privacy", () => {
  beforeEach(() => sessionStorage.setItem("docai.token", "t"));

  it("shows what is stored and offers no features the backend does not have", async () => {
    loggedIn();
    renderApp("/account");
    expect(await screen.findByRole("heading", { name: "Konto og personvern" })).toBeInTheDocument();
    expect(screen.getByText("alice@example.com", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText(/Selve PDF-filen lagres ikke/)).toBeInTheDocument();
    expect(screen.queryByText(/passord/i, { selector: "button" })).not.toBeInTheDocument(); // no fake "change password"
    expect(screen.queryByText(/Google/)).not.toBeInTheDocument();
  });

  it("requires the password before erasing all data", async () => {
    const { calls } = loggedIn({ "DELETE /users/me/data": { body: { documents: 2, conversations: 1 } } });
    renderApp("/account");

    await userEvent.click(await screen.findByRole("button", { name: "Slett alle dataene mine" }));
    const dialog = within(screen.getByRole("dialog"));
    const confirm = dialog.getByRole("button", { name: "Slett alt" });
    expect(confirm).toBeDisabled(); // no password yet

    await userEvent.type(dialog.getByLabelText("Bekreft med passordet ditt"), "correct-horse-1");
    await userEvent.click(confirm);

    expect(await screen.findByText("Slettet 2 dokument(er) og 1 samtale(r).")).toBeInTheDocument();
    const call = calls.find((c) => c.key === "DELETE /users/me/data");
    expect(JSON.parse(String(call?.init?.body))).toEqual({ password: "correct-horse-1" });
  });

  it("shows the server's message when the password is wrong, and deletes nothing", async () => {
    loggedIn({ "DELETE /users/me": { status: 403, body: { detail: "Incorrect password" } } });
    renderApp("/account");

    await userEvent.click(await screen.findByRole("button", { name: "Slett kontoen min" }));
    const dialog = within(screen.getByRole("dialog"));
    await userEvent.type(dialog.getByLabelText("Bekreft med passordet ditt"), "feil-passord");
    await userEvent.click(dialog.getByRole("button", { name: "Slett kontoen" }));

    expect(await dialog.findByRole("alert")).toHaveTextContent("Feil passord.");
    expect(screen.getByRole("heading", { name: "Konto og personvern" })).toBeInTheDocument(); // still logged in
  });

  it("logs out after the account was deleted", async () => {
    loggedIn({ "DELETE /users/me": { status: 204 } });
    renderApp("/account");
    await userEvent.click(await screen.findByRole("button", { name: "Slett kontoen min" }));
    const dialog = within(screen.getByRole("dialog"));
    await userEvent.type(dialog.getByLabelText("Bekreft med passordet ditt"), "correct-horse-1");
    await userEvent.click(dialog.getByRole("button", { name: "Slett kontoen" }));

    expect(await screen.findByRole("heading", { name: "Logg inn" })).toBeInTheDocument();
    expect(screen.getByText("Kontoen din og alle dataene er slettet.")).toBeInTheDocument();
    expect(sessionStorage.getItem("docai.token")).toBeNull();
  });
});

describe("light and dark mode", () => {
  beforeEach(() => sessionStorage.setItem("docai.token", "t"));

  it("switches with the button in the top bar and remembers the choice", async () => {
    loggedIn();
    renderApp("/");
    const toggle = await screen.findByRole("button", { name: "Bytt til mørk modus" });

    await userEvent.click(toggle);
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem("docai.theme")).toBe("dark");

    await userEvent.click(screen.getByRole("button", { name: "Bytt til lys modus" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(localStorage.getItem("docai.theme")).toBe("light");
  });

  it("starts in the mode the device prefers, and the button reflects it", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("dark"),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    loggedIn();
    renderApp("/");
    expect(await screen.findByRole("button", { name: "Bytt til lys modus" })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("keeps the top-bar button in step with the choice made on the account page", async () => {
    loggedIn();
    renderApp("/account");
    expect(await screen.findByRole("button", { name: "Bytt til mørk modus" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Mørk" }));

    expect(screen.getByRole("button", { name: "Bytt til lys modus" })).toBeInTheDocument();
  });

  it("offers 'follow the device', 'light' and 'dark' on the account page", async () => {
    loggedIn();
    renderApp("/account");
    const group = within(await screen.findByRole("radiogroup", { name: "Utseende" }));
    expect(group.getByRole("radio", { name: "Følg enheten" })).toBeChecked();

    await userEvent.click(group.getByRole("radio", { name: "Mørk" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(group.getByRole("radio", { name: "Mørk" })).toBeChecked();

    await userEvent.click(group.getByRole("radio", { name: "Følg enheten" }));
    expect(document.documentElement).not.toHaveAttribute("data-theme");
    expect(localStorage.getItem("docai.theme")).toBeNull();
  });
});

describe("security and accessibility of the rendered pages", () => {
  beforeEach(() => sessionStorage.setItem("docai.token", "t"));

  it.each(["/", "/documents", "/conversations", "/account", "/chat"])(
    "%s uses no inline styles (the production CSP forbids them) and every control has a name",
    async (path) => {
      loggedIn();
      const { container } = renderApp(path);
      await screen.findByRole("main");
      await waitFor(() => expect(screen.queryByText("Laster…")).not.toBeInTheDocument());

      expect(container.querySelectorAll("[style]")).toHaveLength(0);
      expect(container.querySelectorAll("script, iframe, img[src^='http']")).toHaveLength(0);
      for (const control of container.querySelectorAll("button, a[href]")) {
        const name = control.getAttribute("aria-label") || control.getAttribute("title") || control.textContent?.trim();
        expect(name, control.outerHTML.slice(0, 120)).toBeTruthy();
      }
    },
  );

  it("renders unknown pages with a way back", async () => {
    loggedIn();
    renderApp("/finnes-ikke");
    expect(await screen.findByRole("heading", { name: "Siden finnes ikke" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Til oversikten" })).toHaveAttribute("href", "/");
  });
});
