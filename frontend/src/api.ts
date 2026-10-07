// Typed client for the backend API. All network access in the app goes through here.

const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

// ---- types (mirror the backend's response models) ----------------------------------------

export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface DocumentInfo {
  id: string;
  filename: string;
  size_bytes: number;
  page_count: number | null;
  status: string;
  created_at: string;
  expires_at: string | null; // when the retention policy deletes it
}

export interface SearchHit {
  document_id: string;
  filename: string;
  page_number: number;
  chunk_index: number;
  content: string;
  score: number; // cosine similarity, 1 = same meaning
}

export interface ConversationSummary {
  id: string;
  title: string;
  created_at: string;
  message_count: number;
  last_message_at: string | null;
}

/** One cited source under an assistant answer. `ref` matches the [n] in the text. */
export interface SourceInfo {
  ref: number;
  document_id: string;
  filename: string;
  page_number: number;
  snippet: string;
  score: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: SourceInfo[];
  created_at: string;
}

export interface ConversationDetail {
  id: string;
  title: string;
  created_at: string;
  messages: ChatMessage[];
}

export interface MessageExchange {
  user_message: ChatMessage;
  assistant_message: ChatMessage;
}

export interface DataDeletionResult {
  documents: number;
  conversations: number;
}

// ---- errors ---------------------------------------------------------------------------------

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Backend messages are English; users should see Norwegian. */
const KNOWN_MESSAGES: Record<string, string> = {
  "Invalid email or password": "Feil e-post eller passord.",
  "Email already registered": "E-postadressen er allerede i bruk.",
  "Incorrect password": "Feil passord.",
  "Not authenticated": "Du må logge inn.",
  "Only PDF files are allowed": "Bare PDF-filer er tillatt.",
  "File is not a valid PDF": "Filen er ikke en gyldig PDF.",
  "Document not found": "Dokumentet finnes ikke.",
  "Conversation not found": "Samtalen finnes ikke.",
  "The embedding service is unavailable":
    "Tjenesten som analyserer dokumenter er utilgjengelig. Er Ollama startet?",
  "The language model is unavailable":
    "Språkmodellen er utilgjengelig. Er Ollama startet?",
};

const KNOWN_PREFIXES: [string, string][] = [
  ["File too large", "Filen er for stor."],
  ["No extractable text", "Fant ingen tekst i PDF-en. Er den skannet? OCR støttes ikke."],
  ["Encrypted PDFs", "Krypterte PDF-er støttes ikke."],
  ["The PDF has too many pages", "PDF-en har for mange sider."],
  ["Could not read the PDF", "Kunne ikke lese PDF-filen."],
];

const STATUS_MESSAGES: Record<number, string> = {
  413: "Filen er for stor.",
  429: "For mange forespørsler. Vent litt og prøv igjen.",
  500: "Noe gikk galt på serveren. Prøv igjen senere.",
  502: "En av tjenestene bak er utilgjengelig. Er Ollama startet?",
};

/** Turns a failed response into a message that is safe and useful to show. */
export function messageFor(status: number, body: unknown): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") {
    if (KNOWN_MESSAGES[detail]) return KNOWN_MESSAGES[detail];
    const prefix = KNOWN_PREFIXES.find(([start]) => detail.startsWith(start));
    if (prefix) return prefix[1];
  }
  if (STATUS_MESSAGES[status]) return STATUS_MESSAGES[status];
  if (Array.isArray(detail)) {
    // FastAPI validation errors: [{ msg: "...", loc: [...] }, ...]
    const messages = detail
      .map((item) => (item as { msg?: string }).msg)
      .filter((msg): msg is string => Boolean(msg));
    if (messages.length) return `Ugyldig input: ${messages.join(". ")}`;
  }
  if (typeof detail === "string") return detail;
  return "Noe gikk galt. Prøv igjen.";
}

export function errorText(error: unknown): string {
  return error instanceof ApiError ? error.message : "Noe gikk galt. Prøv igjen.";
}

// ---- transport --------------------------------------------------------------------------------

let getToken: () => string | null = () => null;
let onUnauthorized: () => void = () => {};

/** Called once by the auth provider, so this module never imports React. */
export function configureApi(options: { getToken: () => string | null; onUnauthorized: () => void }) {
  getToken = options.getToken;
  onUnauthorized = options.onUnauthorized;
}

interface RequestOptions {
  method?: string;
  json?: unknown;
  form?: FormData;
  auth?: boolean; // default true
  blob?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (options.auth !== false && token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  } else if (options.form) {
    body = options.form; // the browser sets the multipart boundary itself
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { method: options.method ?? "GET", headers, body });
  } catch {
    throw new ApiError(0, "Får ikke kontakt med serveren. Sjekk at den kjører.");
  }

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    if (response.status === 401 && options.auth !== false && token) {
      onUnauthorized(); // token expired or account deleted: log out everywhere
      throw new ApiError(401, "Økten din har utløpt. Logg inn på nytt.");
    }
    throw new ApiError(response.status, messageFor(response.status, data));
  }
  if (response.status === 204) return undefined as T;
  if (options.blob) return (await response.blob()) as T;
  return (await response.json()) as T;
}

// ---- endpoints -----------------------------------------------------------------------------------

export const register = (email: string, password: string) =>
  request<User>("/auth/register", { method: "POST", json: { email, password }, auth: false });

export const login = (email: string, password: string) =>
  request<{ access_token: string }>("/auth/login", {
    method: "POST",
    json: { email, password },
    auth: false,
  });

export const getMe = () => request<User>("/users/me");

export const listDocuments = () => request<DocumentInfo[]>("/documents");

export const getDocument = (id: string) => request<DocumentInfo>(`/documents/${id}`);

export const uploadDocument = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return request<DocumentInfo>("/documents", { method: "POST", form });
};

export const deleteDocument = (id: string) => request<void>(`/documents/${id}`, { method: "DELETE" });

export const listConversations = () => request<ConversationSummary[]>("/conversations");

export const createConversation = () =>
  request<ConversationSummary>("/conversations", { method: "POST", json: {} });

export const getConversation = (id: string) => request<ConversationDetail>(`/conversations/${id}`);

export const deleteConversation = (id: string) =>
  request<void>(`/conversations/${id}`, { method: "DELETE" });

/** Asks a question. Slow (several seconds): retrieval plus a local language model. */
export const sendMessage = (conversationId: string, content: string) =>
  request<MessageExchange>(`/conversations/${conversationId}/messages`, {
    method: "POST",
    json: { content },
  });

export const search = (query: string, limit = 5, documentId?: string) =>
  request<SearchHit[]>("/search", {
    method: "POST",
    json: { query, limit, ...(documentId ? { document_id: documentId } : {}) },
  });

export const exportMyData = (includeDocumentText: boolean) =>
  request<Blob>(`/users/me/export?include_document_text=${includeDocumentText}`, { blob: true });

export const deleteMyData = (password: string) =>
  request<DataDeletionResult>("/users/me/data", { method: "DELETE", json: { password } });

export const deleteAccount = (password: string) =>
  request<void>("/users/me", { method: "DELETE", json: { password } });
