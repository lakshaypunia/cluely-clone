# Cluely-style Overlay — Architecture Plan

R&D prototype exploring how "invisible overlay" AI copilot apps (Cluely and
similar) are built on Electron: a transparent always-on-top window that is
excluded from screen-capture/share pipelines, plus a screenshot -> LLM ->
overlay response loop.

Built on the existing `electron-vite` + React + TypeScript scaffold in this
repo. No backend/LLM provider has been chosen yet — Phase 5 is a placeholder
until that's decided.

## How the invisibility mechanism works

One OS API per platform, exposed by Electron as `win.setContentProtection(true)`:

- **Windows**: wraps `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)`
- **macOS**: wraps `NSWindow.sharingType = .none`
- **Linux**: no reliable equivalent across X11/Wayland compositors

This excludes the window from anything that captures via the OS compositor
(native Zoom/Teams/Meet screen share, OBS, Windows Game Bar, Chromium
`getDisplayMedia`). It does **not** defeat a phone camera pointed at the
screen, or capture methods that bypass the compositor. Treat this as one
layer, not a guarantee.

## Phases

### Phase 1 — Overlay window shell
Second `BrowserWindow`, transparent, frameless, always-on-top, not in
taskbar/dock, floats over fullscreen apps and across workspaces.

### Phase 2 — Capture exclusion
`setContentProtection(true)` on the overlay window. Verified manually against
real capture surfaces (OBS, browser `getDisplayMedia` test page, OS screenshot
tool) since this can't be unit tested.

### Phase 3 — Click-through + interaction toggling
`setIgnoreMouseEvents` default-on so the overlay doesn't block the app
underneath, with a global shortcut to flip into interactive mode to type/click
inside it, and another shortcut to show/hide it entirely.

### Phase 4 — Screen content capture pipeline
Separate from Phase 2 — this is the app reading the screen *behind* the
overlay to feed to an LLM. `desktopCapturer.getSources()` (or a native
screenshot lib) triggered on hotkey, downscaled before leaving the machine.

### Phase 5 — Backend / LLM communication
IPC from renderer -> main -> HTTPS out to an LLM API. Streamed responses back
into the overlay via IPC events. Provider/backend TBD.

### Phase 6 — Persistence & stealth details
Dock/taskbar hiding, alt-tab visibility decisions, process/executable naming.
Diminishing-returns polish once Phases 1-5 work.

### Phase 7 — Packaging & signing
`electron-builder` (already in devDependencies) for Win/macOS, code-signed —
unsigned overlay-style apps get flagged hard by AV/SmartScreen.

## Known limitations (be honest about these, don't oversell)

- Screen-capture exclusion is a real OS feature but not universal — some
  capture paths (older Windows APIs, some Linux compositors, hardware capture
  cards) will still see the window.
- This is an arms race: capture/proctoring tooling actively tries to detect
  and defeat this class of overlay. No step here should be presented to a
  user as "guaranteed undetectable."
- Linux has no first-class equivalent to `setContentProtection` — the overlay
  will likely be visible to capture on Linux regardless of what we build.

## Tracking

Progress is tracked step-by-step in `steps.md`, updated after each unit of
work — check that file for current status before resuming work here.
