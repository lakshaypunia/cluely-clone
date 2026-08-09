# Test server

A zero-dependency Node HTTP server used only to exercise the overlay's chat
pipeline end to end (renderer -> main -> HTTP -> reply -> renderer). It is
not a real backend or LLM integration — it just echoes back what it
received, optionally noting a screenshot's size.

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
{ "reply": "Test server received \"hello\" plus a screenshot (42KB data URL).", "receivedAt": 1731000000000 }
```
