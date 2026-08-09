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
- [ ] Manually verify against a real capture surface (OBS / browser
      `getDisplayMedia` test page / OS screenshot tool / Windows Snipping
      Tool) — **still needs a human to actually look at the screen and a
      capture tool; a build succeeding doesn't prove the window is actually
      excluded from capture**

## Phase 3 — Click-through + interaction toggling
- [x] Default `setIgnoreMouseEvents(true, { forward: true })` so overlay
      doesn't block the app underneath — 2026-08-09
- [x] Global shortcut `CommandOrControl+Shift+Space` — show/hide overlay — 2026-08-09
- [x] Global shortcut `CommandOrControl+Shift+I` — toggle click-through vs
      interactive mode, overlay UI reflects current state via IPC — 2026-08-09
- [x] Minimal overlay renderer (`OverlayApp.tsx`) showing status pill +
      shortcut hints, transparent background — 2026-08-09

## Phase 4 — Screen content capture pipeline
- [ ] Not started

## Phase 5 — Backend / LLM communication
- [ ] Not started — blocked on choosing a provider/backend

## Phase 6 — Persistence & stealth details
- [ ] Not started

## Phase 7 — Packaging & signing
- [ ] Not started

---

## Next up
`npm run dev` is currently running (typecheck + lint both clean). Confirm on
your screen that:
1. The overlay panel is visible top-left, translucent, no window frame
2. `Ctrl/Cmd+Shift+Space` hides/shows it
3. `Ctrl/Cmd+Shift+I` flips the status dot green and lets you click into it;
   pressing again goes back to click-through
4. Try screen-sharing this display (Zoom/Meet/Teams) or opening OBS and
   check whether the overlay panel shows up in the capture — this is the one
   thing that actually validates Phase 2, nothing automated can check it

Once confirmed, move to Phase 4 (screen capture pipeline).
