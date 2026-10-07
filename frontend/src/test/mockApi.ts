import { vi } from "vitest";

interface MockResponse {
  status?: number;
  body?: unknown;
}

type Handler = MockResponse | ((init: RequestInit | undefined) => MockResponse);

/** Replaces fetch with a tiny router keyed by "METHOD /path". Unknown routes fail the test. */
export function mockApi(routes: Record<string, Handler>) {
  const calls: { key: string; init: RequestInit | undefined }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const key = `${init?.method ?? "GET"} ${url.pathname}`;
    calls.push({ key, init });
    const route = routes[key];
    if (!route) throw new Error(`Unexpected request: ${key}`);
    const { status = 200, body = null } = typeof route === "function" ? route(init) : route;
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

export const USER = { id: "u1", email: "alice@example.com", created_at: "2026-01-01T10:00:00Z" };

export const DOC = {
  id: "d1",
  filename: "forelesning.pdf",
  size_bytes: 2048,
  page_count: 3,
  status: "ready",
  created_at: "2026-02-01T10:00:00Z",
  expires_at: "2026-05-02T10:00:00Z",
};
