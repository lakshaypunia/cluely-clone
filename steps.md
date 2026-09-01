# Build Steps — Progress Log

Checklist mirrors the phases in `plan.md`. Update this file (check the box +
add a one-line note + date) every time a step is completed. Keep entries in
chronological order, newest at the bottom of each phase.

## Phase 1 — Overlay window shell
- [x] Create `createOverlayWindow()` in `src/main/index.ts`: transparent,
      frameless, always-on-top, `skipTaskbar`, floats over fullscreen apps
      and all workspaces — 2026-08-09

## Phase 2 — Capture exclusion
- [x] `overlayWindow.setContentProtection(true)` wired in on creation — 2026-08-09
- [x] `npm run dev` builds main/preload/renderer clean and launches both
      windows with no errors — 2026-08-09
- [x] Manually tested by user — confirmed working — 2026-08-09

## Phase 3 — Click-through + interaction toggling
- [x] Default `setIgnoreMouseEvents(true, { forward: true })` so overlay
      doesn't block the app underneath — 2026-08-09
- [x] Global shortcut `CommandOrControl+Shift+Space` — show/hide overlay — 2026-08-09
- [x] Global shortcut `CommandOrControl+Shift+I` — toggle click-through vs
      interactive mode, overlay UI reflects current state via IPC — 2026-08-09
- [x] Minimal overlay renderer (`OverlayApp.tsx`) showing status pill +
      shortcut hints, transparent background — 2026-08-09
- [x] Stopped the overlay from stealing OS focus: `showInactive()` instead of
      `.show()`, removed the forced `.focus()` call on interactive-mode
      toggle. General good practice for overlay windows (don't disturb
      whatever the user is actually working in); not specific to the
      research angle of this project — 2026-08-09

## Phase 4 — Screen content capture pipeline
- [x] `captureScreen()` in `src/main/index.ts` — grabs primary display via
      `desktopCapturer.getSources`, downscaled to `CAPTURE_MAX_WIDTH` (1280px)
      before it ever leaves the process — 2026-08-09
- [x] Captures persisted as PNGs to `<userData>/captures/<timestamp>.png` so
      output quality can be inspected outside the app — 2026-08-09
- [x] Global shortcut `CommandOrControl+Shift+S` triggers a capture and
      pushes the result to the overlay via `capture:result` IPC event — 2026-08-09
- [x] `ipcMain.handle('capture:screen', ...)` + `window.api.captureScreen()`
      exposed through preload for renderer-triggered capture — 2026-08-09
- [x] Overlay UI: "Capture now" button (visible only in interactive mode) +
      thumbnail preview of the last capture with dimensions/timestamp — 2026-08-09
- [x] Typecheck + lint clean, `npm run dev` builds and launches — 2026-08-09
- [ ] Manually verify: press Ctrl/Cmd+Shift+S, confirm thumbnail appears in
      overlay and a PNG lands in `<userData>/captures/` — **needs a human
      check, same as Phase 2**

## Project re-scoped — 2026-08-09
Reframed from a Cluely-style product to a capture-exclusion research/demo
project — see `plan.md` for the updated phase list and the explicit
in-scope/out-of-scope boundary. Old Phase 5 (LLM backend) and Phase 6
(stealth/dock-hiding polish) are dropped; replaced with a test-methodology
phase and a writeup phase, since the actual deliverable is a documented,
honest demo rather than a product.

## Phase 5 — Capture-exclusion test methodology
- [ ] Not started. Plan: local `getDisplayMedia()` test page, OBS
      window/display capture test, OS screenshot tool test — run each
      against the overlay with content protection on vs. off, record results
      per platform in the writeup.

## Phase 6 — Writeup / README
- [ ] Not started. Explain the mechanism, before/after capture screenshots,
      per-platform behavior, explicit limitations section.

## Phase 7 — Packaging & signing
- [ ] Not started

## UI / chat / minimize feature batch — 2026-08-09
Product-side polish requested alongside the research angle: a usable chat
interface talking to a real (test) server, and a minimize-to-dot interaction.
Not one of the numbered research phases — tracked separately here.

- [x] `server/index.js` — zero-dependency Node HTTP test server, `POST
      /api/chat` echoes back the message (+ screenshot size if attached).
      `npm run test-server` to run it. `server/README.md` has details — 2026-08-09
- [x] `server/` excluded from eslint (plain CommonJS, outside the TS/Electron
      toolchain) — 2026-08-09
- [x] Main process: `sendChatMessage()` — optionally captures the screen,
      POSTs `{ message, screenshot }` to `CHAT_SERVER_URL`
      (`http://localhost:4319/api/chat` by default, overridable via
      `CLUELY_CHAT_SERVER_URL`), returns `{ reply }` or `{ error }` — 2026-08-09
- [x] `ipcMain.handle('chat:send', ...)` + `window.api.sendChatMessage()`
      exposed through preload — 2026-08-09
- [x] Redesigned `OverlayApp.tsx`: chat message list (user/assistant
      bubbles), composer with Enter-to-send + Shift+Enter newline, "attach
      screenshot" checkbox, collapsible capture-exclusion demo section — 2026-08-09
- [x] Minimize-to-dot: clicking the status dot (in either expanded or
      minimized state) calls `window.api.toggleMinimize()` →
      `ipcMain.on('overlay:toggle-minimize')` → `toggleOverlayMinimize()` in
      main, which animates the window bounds (`animateWindowBounds`, ~160ms)
      between `EXPANDED_BOUNDS` (380×540) and a `DOT_SIZE` (36×36) square — 2026-08-09
- [x] Minimized dot is always draggable + clickable (`-webkit-app-region:
      drag` + `setIgnoreMouseEvents(false)`) regardless of the separate
      interactive/click-through mode, since it's the window's entire content — 2026-08-09
- [x] Global shortcut `CommandOrControl+Shift+M` — the "command" to
      minimize/maximize without clicking — 2026-08-09
- [x] `clampToDisplay()` keeps the expanded panel on-screen if the dot was
      dragged near a screen edge before maximizing — 2026-08-09
- [x] Typecheck + lint clean; test server verified directly via curl
      (`{"reply":"Test server received \"hello from curl\"."}`) — 2026-08-09
- [x] `npm run dev` + `npm run test-server` both running, app launched clean — 2026-08-09
- [ ] Manual verification needed (same as prior phases — visual/interactive,
      can't be automated):
      1. Chat: type a message, send, confirm the reply bubble appears
      2. Chat with "Attach screenshot" checked — confirm server log shows a
         screenshot size and reply mentions it
      3. Click the dot — confirm smooth shrink to a small draggable circle
      4. Drag the minimized dot around the screen
      5. Click the dot again, or press Ctrl/Cmd+Shift+M — confirm it expands
         back to the full panel, on-screen even near an edge

---

## Dot click/style fix — 2026-08-09
- [x] Fixed: minimized dot wasn't reopening on click. Root cause — the dot is
      a `-webkit-app-region: drag` element (needed so it can be dragged as a
      tiny window), and Electron/Chromium generally swallows the normal
      `click` event on drag regions before it reaches the DOM. Replaced
      `onClick` with manual `mousedown`/`mouseup` timing+movement detection
      (`<500ms`, `<6px` movement = a click) in `OverlayApp.tsx`, applied to
      both the minimized dot and the expanded titlebar dot — 2026-08-09
- [x] Shrunk `DOT_SIZE` from 36 to 18px in `src/main/index.ts` — 2026-08-09
- [x] Minimized dot no longer color-codes interactive state — flat, mostly
      transparent (`rgba(255,255,255,0.05)` fill, faint border), matches
      "just visible" — 2026-08-09
- [x] Typecheck + lint clean, dev app rebuilt and relaunched — 2026-08-09
- [ ] Manual re-verification needed: click should now reliably reopen the
      dot; confirm it's noticeably smaller and effectively invisible until
      hovered/interacted with

## UI simplification pass — 2026-08-09
Stripped the overlay down to just chat, per request — no more visible status
text, shortcut hints, or the separate capture-exclusion demo panel.

- [x] Removed "Overlay" title + "Interactive/Click-through — Ctrl/Cmd+Shift+I"
      text from the titlebar — titlebar is now just the (still-functional)
      dot, no label — 2026-08-09
- [x] Removed the standalone "Capture-exclusion demo" `<details>` section
      (preview image + "Capture now" button) from the overlay UI. The
      underlying `captureScreen()` pipeline, the `Ctrl/Cmd+Shift+S` hotkey,
      and PNGs saved to `<userData>/captures/` are untouched — only the
      on-screen demo panel is gone. Verifying capture exclusion is still
      meant to happen externally (OBS / `getDisplayMedia` test page /
      screenshot tool), not via an in-app preview — 2026-08-09
- [x] Replaced the checkbox+button composer row with two small icon buttons
      (camera toggle for "attach screenshot", arrow to send) — 2026-08-09
- [x] Shrunk `EXPANDED_BOUNDS` from 380×540 to 340×460 to match the leaner
      content — 2026-08-09
- [x] Screenshots are now shown inline in the chat: the screenshot is
      captured client-side in the renderer *before* the message is added to
      the list (not inside the main-process `sendChatMessage`), so the exact
      image sent is rendered as a small thumbnail in the user's bubble.
      `sendChatMessage(message, screenshot?)` now takes the data URL directly
      instead of an `includeScreenshot` boolean and capturing it itself — 2026-08-09
- [x] Typecheck + lint clean, dev app rebuilt and relaunched — 2026-08-09
- [ ] Manual verification needed: send a plain message, then send one with
      the camera toggle on — confirm a small thumbnail appears above the
      message text in your own bubble, and the reply still comes back

## Interactive by default — 2026-08-09
- [x] `overlayInteractive` now starts `true` and the initial
      `setIgnoreMouseEvents` call in `createOverlayWindow` uses it, so the
      overlay is clickable/typeable immediately on launch — no more needing
      `Ctrl/Cmd+Shift+I` first. That shortcut still toggles it into
      click-through afterwards, same as before — 2026-08-09
- [x] Typecheck + lint clean, dev app rebuilt and relaunched — 2026-08-09
- [ ] Manual verification: on a fresh launch, click straight into the chat
      input without pressing any shortcut first and confirm it accepts focus

## Resizable panel + grab cursor — 2026-08-09
- [x] `.overlay-titlebar` and `.overlay-dot-standalone` (the drag regions)
      now show `cursor: grab`, switching to `grabbing` while the mouse button
      is down — 2026-08-09
- [x] Overlay window is now `resizable: true` (was `false`). Edge-drag resize
      relies on Electron's built-in frameless-window hit-testing, no extra
      code needed for that part — 2026-08-09
- [x] Added `setMinimumSize`/`setMaximumSize` (280×320 to 640×820 while
      expanded) so the chat layout can't be resized into something broken or
      absurdly large — 2026-08-09
- [x] The expanded size is now tracked in a mutable `expandedBounds`
      (updated on every `resize` event while not minimized) instead of a
      fixed constant, so minimizing then maximizing restores whatever size
      you last resized to, rather than snapping back to the 340×460 default — 2026-08-09
- [x] Size constraints + `setResizable` are flipped *before* each
      minimize/maximize animation starts (not after) — otherwise the
      still-active expanded minimum size would clamp the shrink animation,
      or the dot-sized constraint would clamp the grow animation — 2026-08-09
- [x] Typecheck + lint clean, dev app rebuilt and relaunched — 2026-08-09
- [x] Manually verified by user — resize, grab cursor, and minimize/maximize
      restoring the resized size all confirmed working — 2026-09-01

## Manual verification — confirmed by user
- [x] All pending manual checks from the chat/minimize/resize batches above
      (chat send/reply, screenshot attach + thumbnail, dot click/drag,
      resize + restore) — user tested the app directly and confirmed it's
      working — 2026-09-01

## Gemini integration prep — 2026-09-01
Server-side groundwork so a `secrets.json` drop-in switches the chat server
from echo mode to real Gemini replies, no code changes needed at handoff.

- [x] `server/index.js` rewritten: loads `server/secrets.json` (gitignored)
      for `geminiApiKey`/`geminiModel`, with `GEMINI_API_KEY`/`GEMINI_MODEL`
      env vars as override. No key found → same echo-reply behavior as
      before (pipeline still exercisable with zero credentials) — 2026-09-01
- [x] With a key present, `callGemini()` POSTs to the Gemini
      `generateContent` REST endpoint via the built-in `fetch` (Node 22, no
      new dependency), sending the message as text and, if attached, the
      screenshot data URL as inline multimodal image data (mime type parsed
      off the `data:` prefix) — 2026-09-01
- [x] 30s request timeout via `AbortController`; Gemini errors (bad key,
      blocked prompt, non-2xx) surface as `502` with `{ "error": "..." }`
      instead of crashing the server or hanging the overlay — 2026-09-01
- [x] `server/secrets.example.json` added showing the expected shape
      (`geminiApiKey`, optional `geminiModel`, defaults to
      `gemini-2.5-flash`); `server/secrets.json` added to `.gitignore` —
      2026-09-01
- [x] `server/README.md` updated with the Gemini setup steps — 2026-09-01
- [x] Verified both paths by hand: server boots and echoes correctly with no
      key configured; separately confirmed it detects a key when
      `GEMINI_API_KEY` is set in the environment (a stray `GEMINI_API_KEY`
      was already present in the dev shell env — unrelated to this project,
      flagged to the user, not committed anywhere) — 2026-09-01
- [x] `npm run typecheck` clean (server/ is plain CommonJS, outside the
      TS/eslint toolchain, unaffected) — 2026-09-01
- [x] User provided real credentials — end-to-end test done — 2026-09-01

## Vertex AI (service-account) auth path — 2026-09-01
User's `secrets.json` turned out to be a GCP service-account key (Vertex AI),
not an AI Studio API key — extended the server to support both.

- [x] **Security catch before testing**: the credential was initially saved
      to `server/secrets.example.json` (tracked, not gitignored) instead of
      `server/secrets.json`. Caught before any commit (`git status` showed
      it untracked, never in history) — moved the real key to
      `server/secrets.json` (gitignored) and restored `secrets.example.json`
      to a placeholder. Flagged to user — 2026-09-01
- [x] `server/index.js`: added a second auth mode. If `secrets.json` has
      `"type": "service_account"` (the raw JSON downloaded from GCP Console,
      used as-is, no reshaping), the server does a JWT bearer token exchange
      (`crypto.sign('RSA-SHA256', ...)` against `private_key`, POSTed to
      `token_uri`) to get an OAuth2 access token, cached until ~60s before
      expiry, then calls Vertex AI's `generateContent` endpoint
      (`{location}-aiplatform.googleapis.com/.../publishers/google/models/...`)
      with it as a Bearer token. Plain-API-key mode (`geminiApiKey`) still
      works as an alternative if `secrets.json` has that shape instead — env
      var `GEMINI_API_KEY` still takes priority over either — 2026-09-01
- [x] `GEMINI_LOCATION` env var (default `us-central1`) for the Vertex
      region; `GEMINI_MODEL` (default `gemini-2.5-flash`) works for both
      modes — 2026-09-01
- [x] `server/README.md` updated to document both credential shapes — 2026-09-01
- [x] Verified end-to-end against the real service account: text-only
      message got a real Gemini reply via Vertex; a message with an attached
      screenshot (multimodal) also got a real reply referencing the image —
      both confirmed working — 2026-09-01
- [x] `npm run typecheck` clean — 2026-09-01

## Chat scroll fix + markdown rendering — 2026-09-01
User ran the app and reported: chat scrolling wasn't working, and replies
needed markdown rendering instead of raw text.

- [x] **Root cause of the scroll bug**: `.overlay-messages` (a flex column
      with `overflow-y: auto`) had `justify-content: flex-end` — a known
      Chromium flexbox gotcha where combining flex-end with overflow breaks
      scrolling to reveal content above the fold. Removed it; the existing
      auto-scroll-to-bottom effect on new messages already gives the same
      "pinned to latest" UX without it. The empty-state placeholder still
      centers correctly on its own (`margin: auto 0`, which wins over
      `justify-content` on the main axis regardless) — 2026-09-01
- [x] Since the overlay window is excluded from screen capture by design
      (Phase 2), it can't be verified with an OS-level screenshot — used a
      throwaway Playwright `_electron` driver script (CDP-based, reads the
      DOM directly, unaffected by capture exclusion) to build the app,
      launch it, send messages past the panel's height, and confirm
      `scrollHeight > clientHeight` with `scrollTop` actually movable
      end-to-end — confirmed fixed. Script and its `playwright-core` dev
      dependency were scratch-only, not committed — 2026-09-01
- [x] Added `react-markdown` + `remark-gfm` (real dependencies) and render
      each bubble's text through them instead of a plain `<p>` — 2026-09-01
- [x] Added `.overlay-markdown` CSS for compact rendering inside a chat
      bubble: paragraphs, lists, links, bold/italic, blockquote, inline code
      + code blocks, tables (GFM), headings, `<hr>` — 2026-09-01
- [x] Caught + fixed a knock-on bug: `base.css` has a global
      `ul { list-style: none; }` (for nav-style lists elsewhere) that was
      silently stripping bullet markers from rendered markdown lists.
      Added explicit `list-style: disc`/`decimal` inside
      `.overlay-markdown` — 2026-09-01
- [x] Verified via the same Playwright driver: sent a prompt asking for
      bold/italic/list/inline-code markdown, confirmed real `<strong>`,
      `<em>`, `<ul><li>`, `<code>` elements in the DOM (not literal
      asterisks/backticks) and visible bullet markers in a CDP screenshot — 2026-09-01
- [x] `npm run typecheck` + `npm run lint` clean; `npm run build` clean — 2026-09-01

## Typing indicator — 2026-09-01
- [x] Added a bouncing-dots bubble shown while waiting for a reply, gone once
      it arrives. Verified via the same Playwright DOM-driving approach
      (screen capture can't see the overlay by design, so this is the only
      way to confirm UI state) — during-send state showed the indicator +
      disabled send button, after-reply state showed it gone — 2026-09-01

## Declined: live system-audio transcription — 2026-09-01
User asked for STT that listens to system audio (even over Bluetooth output)
and types the result into chat. Declined the version where it feeds live
into the invisible/capture-excluded overlay during an active call — that's
the "live answer-feeding" pattern `plan.md` already scoped out (deceiving
whoever's on the other end of the call about the source of the answers,
plus call-recording consent issues). Offered alternatives (mic dictation for
own messages, personal post-call notes with a visible/non-hidden indicator,
accessibility captions). User then said "this is for note taking" without
otherwise changing the request — flagged that a visible, non-hidden,
notes-only version would need to be structurally separate from the existing
invisible chat overlay to actually be that, and asked for confirmation
before building. No confirmation yet — **not built**, no code changes made
for this. Revisit only if the user gives a concrete, structurally-different
ask (separate visible panel, saved transcript, not wired into the live
chat/answer loop) — 2026-09-01

## Streaming chat replies — 2026-09-01
Replies were arriving as one lump after a wait; switched to real token
streaming end-to-end.

- [x] `server/index.js`: new `POST /api/chat/stream` SSE endpoint. Added
      `streamGeminiApiKey`/`streamGeminiVertex` (call Gemini's/Vertex's
      `streamGenerateContent?alt=sse` instead of `generateContent`) and a
      `consumeSse()` reader that parses Gemini's SSE frames and relays each
      text delta out over our own SSE format (`event: delta|done|error`).
      Echo mode (no credentials) simulates streaming by trickling the reply
      out word-by-word, so the pipeline stays testable without them — 2026-09-01
- [x] **Bug caught during testing**: Gemini's SSE frames are
      `\r\n\r\n`-terminated, not `\n\n` — the initial parser split on `\n\n`
      only, silently buffered the entire response, and emitted zero deltas
      (only `done`). Caught via a direct curl/raw-fetch probe of Gemini's
      endpoint showing the actual bytes; fixed by normalizing `\r\n` → `\n`
      before splitting. (Our own server→main relay format uses plain `\n\n`
      already, so the main-process parser didn't need this fix.) — 2026-09-01
- [x] **UX follow-up**: even after the parser fix, short replies still
      arrived as one or two large chunks near the end rather than smoothly —
      Gemini 2.5's "thinking" mode reasons silently and only flushes
      answer-text deltas once reasoning is done. Set
      `generationConfig.thinkingConfig.thinkingBudget: 0` on streaming calls
      only, to trade reasoning depth for responsiveness (the right call for
      a live chat UI); confirmed short replies now arrive in multiple
      visible chunks instead of one jump — 2026-09-01
- [x] `src/main/index.ts`: replaced the non-streaming `sendChatMessage`/
      `chat:send` (removed, dead once renderer switched over) with
      `streamChatMessage()` — reads the server's SSE response body,
      re-parses it the same way, and relays each event to the renderer via
      `sender.send('chat:stream-event', {requestId, type, ...})`, guarded so
      `done`/`error` only fire once per requestId — 2026-09-01
- [x] Preload: `sendChatMessage` (invoke/await) replaced with
      `sendChatMessageStream(requestId, message, screenshot)` (fire-and-forget
      `send`); renderer listens on `chat:stream-event` directly via
      `window.electron.ipcRenderer.on` (same pattern already used for
      `overlay:minimized-changed`) — 2026-09-01
- [x] `OverlayApp.tsx`: `handleSend` now pushes an empty `streaming: true`
      assistant placeholder immediately, appends text as `delta` events
      arrive (`setMessages` map, keyed by requestId = the assistant
      message's own id), clears `streaming`/`sending` on `done`/`error`.
      Per-bubble rendering shows the typing-dots indicator only while that
      specific message is streaming AND still empty; once text starts
      arriving, switches to live-growing markdown — replaces the old
      separate typing bubble entirely — 2026-09-01
- [x] Verified via Playwright DOM sampling (screen capture can't see the
      overlay by design): assistant bubble's text length polled every 500ms
      during a real Gemini reply, confirmed it grows across multiple samples
      (0 → 0 → 87 → 399 chars) rather than jumping straight from empty to
      full — real incremental rendering in the actual app, not simulated — 2026-09-01
- [x] `npm run typecheck` + `npm run lint` + `npm run build` all clean — 2026-09-01

## Scroll-while-streaming fix — 2026-09-01
Streaming made an existing rough edge worse: the auto-scroll-to-bottom
effect fired on every incoming chunk, so trying to scroll up to read a
response while it was still streaming in got yanked back down repeatedly.

- [x] Added a "pinned to bottom" ref, updated from an `onScroll` handler on
      `.overlay-messages` (`distanceFromBottom < 60px`). The auto-scroll
      effect now only fires `scrollIntoView` when pinned — scrolling away
      from the bottom (including mid-stream) now leaves it alone — 2026-09-01
- [x] Sending a new message always force-repins to bottom first
      (`isPinnedToBottomRef.current = true` in `handleSend`), matching normal
      chat UX — hitting send takes you to the bottom regardless of where you
      were reading — 2026-09-01
- [x] **Bug caught while testing this**: `scrollIntoView({ behavior: 'auto' })`
      does not mean "instant" — per spec, `'auto'` defers to the CSS
      `scroll-behavior` value, and empirically some scrollTop writes were
      still getting smoothed/animated over many small steps, which showed up
      as continued drift even while correctly *not* pinned. Switched to
      `behavior: 'instant'` (spec-guaranteed non-animated) — 2026-09-01
- [x] Verified with a throwaway Playwright driver using **real mouse-wheel
      events** (`overlay.mouse.wheel()`, not a raw `scrollTop` write, which
      turned out to trigger different browser-internal smoothing than actual
      user input does): wheel-scrolling up mid-stream held `scrollTop` at 0
      for 4+ seconds of continued streaming (previously drifted upward the
      whole time); wheel-scrolling back down re-pinned and correctly tracked
      the growing content again — 2026-09-01
- [x] `npm run typecheck` + `npm run lint` + `npm run build` all clean — 2026-09-01

## Real desktop app: tray quit + Windows installer — 2026-09-01
User wants to run this as an actual installed app (double-click icon), not
`npm run dev` in a terminal, and asked specifically how to fully quit it
without losing the "closing the overlay doesn't kill the app" behavior.

- [x] Removed the leftover boilerplate window entirely: `createWindow()` in
      `src/main/index.ts` (the default electron-vite template window — logo,
      "IPC test" ping button) is gone, along with its calls in
      `app.whenReady()`/`app.on('activate', ...)`. Only the overlay window
      exists now — 2026-09-01
- [x] `src/renderer/src/App.tsx` simplified to unconditionally render
      `OverlayApp` (the non-overlay boilerplate branch was unreachable once
      the only window loads with `?overlay=1`). Deleted the
      now-dead `components/Versions.tsx` and `assets/electron.svg` — 2026-09-01
- [x] Removed `ipcMain.on('ping', ...)` (only the deleted "Send IPC" link
      used it) — 2026-09-01
- [x] Relocated `shell.openExternal` window-open handling from the deleted
      mainWindow onto the overlay window, so a link clicked inside a
      markdown reply still opens in the system browser instead of
      navigating the overlay itself — 2026-09-01
- [x] Added a system tray icon (`Tray` + `Menu` from `electron`, using the
      existing `resources/icon.png`) with a single-item context menu:
      **Quit** → `app.quit()`. This is now the one deliberate way to fully
      exit — hiding the overlay (Ctrl/Cmd+Shift+Space) and minimizing to the
      dot still only change visibility, never terminate the process,
      exactly as before — 2026-09-01
- [x] Verified via a throwaway Playwright driver: confirmed only one window
      exists on launch (boilerplate window gone), then called `app.quit()`
      directly (the same call the tray's Quit item makes) and confirmed the
      window count drops to 0 **and** the OS process itself fully
      terminates (checked via `Get-Process` afterward — nothing left
      running) — 2026-09-01
- [x] `npm run typecheck` + `npm run lint` + `npm run build` all clean — 2026-09-01
- [x] Built the real installer: `npm run build:win` → typecheck, build,
      then `electron-builder --win` → `dist/cluely-app-1.0.0-setup.exe`
      (NSIS installer, one-click, desktop shortcut). Confirmed unsigned via
      `Get-AuthenticodeSignature` (`NotSigned`) — matches the disclosed
      SmartScreen-warning limitation, not a build failure — 2026-09-01
- [x] User ran the packaged app directly (`dist/win-unpacked/cluely-app.exe`,
      launched a few times over the session, closed via tray Quit and
      relaunched cleanly each time) — 2026-09-01

## Cross button + minimize shortcut report — 2026-09-01
- User reported `Ctrl+Shift+M` doesn't re-expand the overlay after
  minimizing to the dot. Not root-caused (global-shortcut registration
  conflicts are the leading suspect, but unconfirmed) — user redirected to a
  simpler fix before that was pinned down, so **this is still an open,
  unconfirmed bug** if the keyboard shortcut path specifically is used
  again — 2026-09-01
- [x] Per "keep it simple," added a small × button to `.overlay-titlebar`
      (next to the dot, `overlay-close-btn` in `main.css`) wired directly to
      `window.api.toggleMinimize()` — the same call the dot's click makes,
      bypassing the global shortcut entirely. Minimizing now has a plain,
      obvious click target instead of relying only on the dot or the
      possibly-broken shortcut — 2026-09-01
- [x] `npm run typecheck` + `npm run lint` clean; rebuilt
      `dist/win-unpacked/cluely-app.exe` via `npm run build:unpack` and
      relaunched — 2026-09-01

## Reversed: tray removed, × now quits — 2026-09-01
User tried the × (it minimized, as built) and clarified the actual want:
the × should be the real quit action, no tray icon at all, and the existing
Ctrl+Shift+M / Ctrl+Shift+Space shortcuts should stay exactly as they were.

- [x] Removed the tray icon entirely: `Tray`/`Menu` imports, the `tray`
      module-level variable, and `createTray()` (and its call) all deleted
      from `src/main/index.ts`. The `icon` import (from
      `resources/icon.png?asset`) was only used by the tray, so it's gone
      too — 2026-09-01
- [x] Added a real quit path: `ipcMain.on('app:quit', () => app.quit())` in
      main; `quitApp()` added to the preload `api` (fire-and-forget
      `ipcRenderer.send('app:quit')`) and its `.d.ts` type — 2026-09-01
- [x] `OverlayApp.tsx`: the × button's `onClick` now calls
      `window.api.quitApp()` instead of `toggleMinimize()`; tooltip changed
      from "Minimize" to "Quit". The dot's click still toggles
      minimize/maximize, untouched — 2026-09-01
- [x] `Ctrl+Shift+M` and `Ctrl+Shift+Space` registrations in
      `app.whenReady()` were never touched by any of this — confirmed still
      present, unchanged — 2026-09-01
- [x] Verified with a throwaway Playwright driver: launched the built app,
      clicked `.overlay-close-btn` (the × ), confirmed window count dropped
      to 0 **and**, after clearing out an unrelated stale process from
      earlier in the session, confirmed via `Get-Process` that no
      `electron.exe` process remains at all after the click — the × now
      fully terminates the app, no tray fallback needed — 2026-09-01
- [x] `npm run typecheck` + `npm run lint` clean; rebuilt
      `dist/win-unpacked/cluely-app.exe` via `npm run build:unpack` and
      relaunched for the user — 2026-09-01
- [ ] `Ctrl+Shift+M` not re-expanding after minimize is **still an open,
      unconfirmed bug** — not investigated further, superseded by the ×
      button being the primary interaction now, but the shortcut itself
      hasn't been fixed or root-caused

## Next up
Gemini/Vertex wiring, chat scrolling (including while streaming), markdown
rendering, the typing indicator, streaming replies, and a real installable
desktop app are all live and verified. The × button is now the one true
quit path (no tray). Phase 5 (capture-exclusion test methodology — the
`getDisplayMedia()` test page) is the next unstarted research phase from
`plan.md`. Phase 7 (packaging & signing) is partially done — installer
builds and runs, just unsigned. The `Ctrl+Shift+M` re-expand bug is still
open if it comes up again.
