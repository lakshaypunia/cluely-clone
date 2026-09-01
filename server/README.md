# Chat server

A zero-dependency Node HTTP server that powers the overlay's chat. When
Gemini credentials are configured it calls Gemini for real replies
(including the attached screenshot, if any, as multimodal input). With no
credentials configured it falls back to echoing the message back, so the
send -> server -> reply pipeline still works end to end without them.

## Gemini setup

`server/secrets.json` is gitignored — never commit it. It supports two
shapes:

**Option A — plain API key** (AI Studio, `aistudio.google.com/apikey`).
Copy `server/secrets.example.json` to `server/secrets.json`:

```json
{
  "geminiApiKey": "YOUR_GEMINI_API_KEY",
  "geminiModel": "gemini-2.5-flash"
}
```

**Option B — GCP service account, via Vertex AI.** Save the JSON key file
downloaded from Google Cloud Console (IAM & Admin -> Service Accounts ->
Keys) as `server/secrets.json` as-is — no reshaping needed. The server
detects `"type": "service_account"` and exchanges it for an OAuth2 access
token (JWT bearer flow) to call Vertex AI's `generateContent` endpoint
instead of the public API. The service account needs the **Vertex AI User**
role and the project needs the Vertex AI API enabled. Override the region
with `GEMINI_LOCATION` (default `us-central1`) and the model with
`GEMINI_MODEL` (default `gemini-2.5-flash`) as env vars if needed.

If both `GEMINI_API_KEY` env var and a service-account `secrets.json` are
present, the env var wins. `geminiModel`/`GEMINI_MODEL` likewise override
whatever's in the file.

## Run

```
node server/index.js
```

or from the project root:

```
npm run test-server
```

Listens on `http://localhost:4319` by default (override with `PORT`).

## Endpoint

`POST /api/chat`

```json
{ "message": "hello", "screenshot": "data:image/png;base64,..." }
```

Response:

```json
{ "reply": "...", "receivedAt": 1731000000000 }
```

With no Gemini credentials configured, `reply` is the echo-mode text (e.g.
`Test server received "hello".`). With Gemini configured (either mode),
it's the model's response. A failed Gemini/Vertex/token-exchange call
returns `502` with `{ "error": "..." }`.
