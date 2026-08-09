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

## Next up
Waiting on the manual verification pass above. After that: Phase 5 (capture-
exclusion test methodology — the `getDisplayMedia()` test page) is still the
next unstarted research phase, unless you want to keep iterating on the
chat/UI side first.
