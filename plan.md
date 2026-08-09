# Screen-Capture-Exclusion Research Project — Plan

## What this project is (and isn't)

A technical demo + writeup of how OS-level "exclude this window from screen
capture" APIs work in Electron, what they actually guarantee, and where they
fall short. The deliverable is an honest, well-documented reference project —
not a product, and not something aimed at defeating any specific interview,
exam, or proctoring platform's integrity checks. That distinction matters and
shapes what does/doesn't belong in this repo:

- **In scope**: the capture-exclusion mechanism itself, a demo overlay that
  exercises it, a screen-capture pipeline for the demo, cross-platform
  differences, documented limitations, a test methodology against real
  capture surfaces (OBS, browser `getDisplayMedia`, OS screenshot tools).
- **Out of scope**: anything aimed at specifically defeating interview/exam
  monitoring (focus/blur/visibility detection used by proctoring or
  interview platforms, tab-switch detection, etc.). That's a different
  problem — deceiving a third party who is actively assessing you — and
  isn't part of this project.

Built on the existing `electron-vite` + React + TypeScript scaffold in this
repo.

## How the capture-exclusion mechanism works

One OS API per platform, exposed by Electron as `win.setContentProtection(true)`:

- **Windows**: wraps `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)`
- **macOS**: wraps `NSWindow.sharingType = .none`
- **Linux**: no reliable equivalent across X11/Wayland compositors

This excludes the window from anything that captures via the OS compositor
(native Zoom/Teams/Meet screen share, OBS, Windows Game Bar, Chromium
`getDisplayMedia`). It does **not** defeat a phone camera pointed at the
screen, or capture methods that bypass the compositor entirely. This is one
layer, not a guarantee — the writeup should say so explicitly.

## Phases

### Phase 1 — Overlay window shell ✅
Second `BrowserWindow`, transparent, frameless, always-on-top, not in
taskbar/dock, floats over fullscreen apps and across workspaces.

### Phase 2 — Capture exclusion ✅
`setContentProtection(true)` on the overlay window.

### Phase 3 — Click-through + interaction toggling ✅
`setIgnoreMouseEvents` default-on so the overlay doesn't block the app
underneath, global shortcuts to flip into interactive mode and to show/hide.
Fixed to avoid stealing OS focus (`showInactive()`, no forced `.focus()`) so
the overlay doesn't disturb whatever window the user is actually working in
— standard good behavior for any overlay-style app, not specific to this
project's research angle.

### Phase 4 — Screen content capture pipeline ✅
`desktopCapturer.getSources()` triggered on hotkey, downscaled, previewed in
the overlay, persisted to disk — demonstrates the "read the screen" half of
this class of app, independent of the capture-exclusion mechanism itself.

### Phase 5 — Capture-exclusion test methodology
Document and script (where possible) how to actually verify Phase 2 works:
- Screenshot tools (OS-native snip, third-party)
- OBS Studio window/display capture
- Browser `getDisplayMedia()` test page (a tiny local HTML page that calls
  `navigator.mediaDevices.getDisplayMedia` and renders the stream — lets you
  visually confirm the overlay is/isn't present in a live capture)
- Record results per platform (Windows confirmed via user testing; macOS/
  Linux behavior documented from API docs, flagged as unverified if not
  tested on real hardware)

### Phase 6 — Writeup / README
The actual portfolio deliverable: explain the mechanism, show before/after
capture screenshots, document per-platform behavior and limitations, explain
why this is one layer and not a guarantee. This is what makes it a credible
technical project rather than a black box.

### Phase 7 — Packaging & signing
`electron-builder` (already in devDependencies) for Win/macOS, code-signed,
so the demo can be run by someone else without SmartScreen/Gatekeeper
friction.

## Known limitations (be honest about these, don't oversell)

- Screen-capture exclusion is a real OS feature but not universal — some
  capture paths (older Windows APIs, some Linux compositors, hardware capture
  cards) will still see the window.
- This is an active arms race in the industry broadly; nothing here should be
  presented as "guaranteed undetectable" anywhere in the writeup.
- Linux has no first-class equivalent to `setContentProtection` — document
  this as a real gap, not something to work around.

## Tracking

Progress is tracked step-by-step in `steps.md`, updated after each unit of
work — check that file for current status before resuming work here.
