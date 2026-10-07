import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./api";
import { mockApi, USER } from "./test/mockApi";

describe("messageFor", () => {
  it("translates known backend messages", () => {
    expect(api.messageFor(401, { detail: "Invalid email or password" })).toBe("Feil e-post eller passord.");
    expect(api.messageFor(409, { detail: "Email already registered" })).toBe("E-postadressen er allerede i bruk.");
  });

  it("translates messages that start with a known phrase", () => {
    expect(api.messageFor(413, { detail: "File too large (max 20 MB)" })).toBe("Filen er for stor.");
    expect(api.messageFor(422, { detail: "No extractable text found (scanned PDF? OCR is not supported)" })).toContain(
      "Fant ingen tekst",
    );
  });

  it("explains validation errors from FastAPI", () => {
    const body = { detail: [{ msg: "String should have at least 8 characters" }] };
    expect(api.messageFor(422, body)).toBe("Ugyldig input: String should have at least 8 characters");
  });

  it("has friendly texts for rate limiting and upstream failures", () => {
    expect(api.messageFor(429, null)).toContain("For mange forespørsler");
    expect(api.messageFor(502, { detail: "x" })).toContain("Ollama");
  });

  it("never throws on odd bodies", () => {
    expect(api.messageFor(500, undefined)).toBeTruthy();
    expect(api.messageFor(418, { detail: 42 })).toBe("Noe gikk galt. Prøv igjen.");
  });
});

describe("request handling", () => {
  const onUnauthorized = vi.fn();

  beforeEach(() => {
    onUnauthorized.mockReset();
    api.configureApi({ getToken: () => "secret-token", onUnauthorized });
  });

  it("sends the bearer token on authenticated calls", async () => {
    const { calls } = mockApi({ "GET /users/me": { body: USER } });
    await api.getMe();
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
  });

  it("never sends the token to the login endpoint", async () => {
    const { calls } = mockApi({ "POST /auth/login": { body: { access_token: "t" } } });
    await api.login("a@b.no", "pw");
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("logs out when the server says the token is no longer valid", async () => {
    mockApi({ "GET /users/me": { status: 401, body: { detail: "Not authenticated" } } });
    await expect(api.getMe()).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("does NOT log out on a wrong password (that is a 401 without a session)", async () => {
    mockApi({ "POST /auth/login": { status: 401, body: { detail: "Invalid email or password" } } });
    await expect(api.login("a@b.no", "wrong")).rejects.toThrow("Feil e-post eller passord.");
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("reports an unreachable server in plain language", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(api.getMe()).rejects.toThrow("Får ikke kontakt med serveren");
  });

  it("sends uploads as multipart without setting the content type itself", async () => {
    const { calls } = mockApi({ "POST /documents": { status: 201, body: {} } });
    await api.uploadDocument(new File(["%PDF-"], "a.pdf", { type: "application/pdf" }));
    expect(calls[0].init?.body).toBeInstanceOf(FormData);
    expect((calls[0].init?.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("sends the password in the body when deleting the account", async () => {
    const { calls } = mockApi({ "DELETE /users/me": { status: 204 } });
    await api.deleteAccount("hemmelig-passord");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ password: "hemmelig-passord" });
  });
});
