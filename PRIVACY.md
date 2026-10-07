# Privacy

This document describes what the AI Document Assistant stores, why, for how long,
how it is deleted, and what may leave your machine.

> **This is a technical demonstration.** It applies privacy-by-design techniques,
> but using it does **not** automatically make a deployment GDPR-compliant. A real
> deployment also needs a legal basis, a privacy notice, a data processing
> agreement with any processors, a data protection impact assessment where
> required, security operations (backups, monitoring, incident response) and review
> by someone qualified. Nothing here is legal advice.

## 1. What is stored

| Data | Table | Why it is needed |
|---|---|---|
| E-mail address | `users` | To identify and log in the account |
| Password **hash** (bcrypt, salted). The password itself is never stored | `users` | To verify logins |
| Filename, size in bytes, page count, upload time | `documents` | To list and manage your documents |
| Extracted text, split into chunks with page numbers | `document_chunks` | To find relevant passages and cite the page |
| Embeddings (numeric vectors of each chunk) | `document_chunks` | For semantic search |
| Conversation titles, your questions, the answers | `conversations`, `messages` | To show chat history |
| A copy of the sources cited by each answer (filename, page, short excerpt) | `messages.sources` | To show where an answer came from |

**Not stored:** the original PDF file (it is read in memory and discarded), IP
addresses, tracking data, analytics, cookies. The server log contains request
paths and status codes, and the retention job logs counts only, never content.

Treat embeddings as personal data: vectors can leak information about the text they
were computed from. They are protected and deleted exactly like the text.

## 2. How long data is kept

| Data | Default retention | Setting |
|---|---|---|
| Documents, chunks, embeddings | 90 days after upload | `DOCUMENT_RETENTION_DAYS` |
| Conversations and messages | 90 days after the last message | `CONVERSATION_RETENTION_DAYS` |
| Account | Until you delete it | n/a |

`0` disables a rule. A background job (`RETENTION_SWEEP_MINUTES`, default every 60
minutes) deletes expired data; it can also be run by hand with
`python -m app.services.retention`. Each document shows an `expires_at` date in the
API so users can see when it will be removed.

## 3. How data is deleted

| Action | Endpoint | Effect |
|---|---|---|
| Delete one document | `DELETE /documents/{id}` | Document, chunks and embeddings; its sources are also removed from chat history |
| Delete one conversation | `DELETE /conversations/{id}` | Conversation and all its messages |
| Erase all my data, keep the account | `DELETE /users/me/data` (password required) | All documents, chunks, embeddings, conversations, messages |
| Delete my account | `DELETE /users/me` (password required) | Everything above, plus the account |
| Automatic deletion | retention job | Same code path as a user-initiated delete |

Deletion is enforced in the database with `ON DELETE CASCADE` foreign keys, so child
rows cannot be left behind. Account and bulk deletion require the password again, so
a stolen session token alone cannot wipe an account.

**Known limits**

- The text of an *answer* may contain facts that came from a document. If you delete
  the document, the answer text stays in the chat until you delete the conversation
  (or the retention period passes). Only the stored *sources* are removed.
- Deleted rows may still exist in database backups and write-ahead logs until those
  expire. This project does not configure backups; a real deployment must define a
  backup retention that is consistent with its stated retention.
- PostgreSQL does not physically erase rows immediately (`VACUUM` reclaims space).

## 4. Access and portability

`GET /users/me/export` returns everything stored about you as JSON: account,
document metadata, conversations, messages and sources. Add
`?include_document_text=true` to include the extracted text. Embeddings and the
password hash are omitted because they are internal and not meaningful to a person.

## 5. Who can see the data

Access control is enforced in the backend, not the frontend. Every query filters on
the user id taken from the verified login token, never from the request. Another
user's documents, embeddings and conversations are never returned: they appear as
`404 Not Found`, indistinguishable from data that does not exist. The database also
enforces that a chunk's owner equals its document's owner (composite foreign key).
These guarantees are covered by automated tests.

Anyone with access to the database server or its backups, or with the application's
secrets, can read the data. Database encryption at rest, TLS and operator access
controls are deployment responsibilities and are not provided by this project.

## 6. What is sent to AI services

By default **nothing leaves your machine.**

| Step | What is processed | Default destination |
|---|---|---|
| Embedding a chunk when you upload a document | The chunk text | Local Ollama (`OLLAMA_BASE_URL`) |
| Embedding a search query or question | Your question | Local Ollama |
| Rewriting a follow-up question | Recent messages of the conversation | The configured LLM (local Ollama by default) |
| Generating an answer | Your question and the 5 most relevant chunks | The configured LLM (local Ollama by default) |

Whole documents are never sent anywhere: only the text excerpts needed for a single
question. Embeddings are always computed locally.

### Using an external LLM (optional, off by default)

Set `LLM_PROVIDER=openai_compatible` together with `LLM_BASE_URL` and `LLM_API_KEY`
to use an external provider. **This sends your questions and document excerpts to a
third party**, so the application refuses to start unless you also set
`ALLOW_EXTERNAL_LLM=true`. Before enabling it, check the provider's terms (data
retention, model training, location of processing) and make sure you have a legal
basis and a data processing agreement. The API key is read from the environment and
is never logged.

### Running everything locally with Ollama

1. Install Ollama and pull the models: `ollama pull nomic-embed-text` and
   `ollama pull gemma3:4b`.
2. Keep the defaults (`LLM_PROVIDER=ollama`, `ALLOW_EXTERNAL_LLM=false`).
3. From Docker, point the backend at the host: `OLLAMA_BASE_URL=http://host.docker.internal:11434`
   (or use the bundled container with `docker compose --profile local-llm up` and
   `OLLAMA_BASE_URL=http://ollama:11434`).

## 7. Data minimisation checklist

- Original files are not stored; only the text needed for search and citations.
- No analytics, tracking or third-party scripts.
- Passwords are stored only as salted bcrypt hashes.
- Retention is on by default.
- Secrets live in `.env` (git-ignored), never in code.
