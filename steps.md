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
- [ ] Manual verification: drag an edge/corner of the expanded panel to
      resize it, confirm the grab cursor shows over the titlebar/dot, and
      confirm minimize → maximize restores the resized size (not the default)

## Next up
Waiting on the manual verification pass above. After that: Phase 5 (capture-
exclusion test methodology — the `getDisplayMedia()` test page) is still the
next unstarted research phase, unless you want to keep iterating on the
chat/UI side first.
