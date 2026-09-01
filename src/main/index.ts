import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  desktopCapturer,
  screen
} from 'electron'
import { join } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

let overlayWindow: BrowserWindow | null = null
// Interactive by default so the chat is usable immediately without needing
// Ctrl/Cmd+Shift+I first; that shortcut still toggles it into click-through
// afterwards for whenever it needs to stay out of the way.
let overlayInteractive = true
let overlayMinimized = false

interface CaptureResult {
  dataUrl: string
  width: number
  height: number
  timestamp: number
}

type ChatStreamEvent =
  | { requestId: string; type: 'delta'; text: string }
  | { requestId: string; type: 'done' }
  | { requestId: string; type: 'error'; message: string }

// Downscale before the image ever leaves this process — smaller payloads for
// the test server, and less to store on disk.
const CAPTURE_MAX_WIDTH = 1280
const capturesDir = join(app.getPath('userData'), 'captures')

const DEFAULT_EXPANDED_BOUNDS = { width: 340, height: 460 }
const MIN_EXPANDED_BOUNDS = { width: 280, height: 320 }
const MAX_EXPANDED_BOUNDS = { width: 640, height: 820 }
const DOT_SIZE = 18

// Tracks whatever size the user last resized the expanded panel to, so
// minimizing and then maximizing again restores that size instead of
// snapping back to the default.
let expandedBounds = { ...DEFAULT_EXPANDED_BOUNDS }
const CHAT_SERVER_URL = process.env.CLUELY_CHAT_SERVER_URL ?? 'http://localhost:4319/api/chat'
const CHAT_STREAM_SERVER_URL = `${CHAT_SERVER_URL}/stream`

async function captureScreen(): Promise<CaptureResult | null> {
  const display = screen.getPrimaryDisplay()
  const fullWidth = display.size.width * display.scaleFactor
  const fullHeight = display.size.height * display.scaleFactor
  const scale = Math.min(1, CAPTURE_MAX_WIDTH / fullWidth)

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(fullWidth * scale),
      height: Math.round(fullHeight * scale)
    }
  })

  const primary = sources.find((source) => source.display_id === String(display.id)) ?? sources[0]
  if (!primary || primary.thumbnail.isEmpty()) return null

  const size = primary.thumbnail.getSize()
  const timestamp = Date.now()

  // Persisted to disk so capture quality/output can be inspected directly,
  // separate from whatever the overlay UI shows.
  try {
    await mkdir(capturesDir, { recursive: true })
    await writeFile(join(capturesDir, `${timestamp}.png`), primary.thumbnail.toPNG())
  } catch (error) {
    console.error('Failed to persist capture:', error)
  }

  return {
    dataUrl: primary.thumbnail.toDataURL(),
    width: size.width,
    height: size.height,
    timestamp
  }
}

async function triggerCaptureFromShortcut(): Promise<void> {
  const result = await captureScreen()
  if (!result || !overlayWindow) return
  overlayWindow.webContents.send('capture:result', result)
}

// Streams a chat reply from the server (SSE) and relays each piece to the
// renderer over IPC as it arrives, keyed by requestId so concurrent/stale
// streams can't clobber each other. Fire-and-forget from the caller's side —
// progress goes out via `chat:stream-event`, not a return value.
async function streamChatMessage(
  sender: Electron.WebContents,
  requestId: string,
  message: string,
  screenshot?: string
): Promise<void> {
  let finished = false
  const emit = (event: ChatStreamEvent): void => {
    if (event.type !== 'delta') {
      if (finished) return
      finished = true
    }
    if (!sender.isDestroyed()) sender.send('chat:stream-event', event)
  }

  let response: Response
  try {
    response = await fetch(CHAT_STREAM_SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, screenshot })
    })
  } catch (error) {
    const text = error instanceof Error ? error.message : 'Unknown error contacting chat server'
    emit({
      requestId,
      type: 'error',
      message: `${text} — is the test server running (\`npm run test-server\`)?`
    })
    return
  }

  if (!response.ok || !response.body) {
    emit({ requestId, type: 'error', message: `Server responded ${response.status}` })
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let sepIndex: number
      while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, sepIndex)
        buffer = buffer.slice(sepIndex + 2)

        let eventName = 'message'
        let dataStr = ''
        for (const line of rawEvent.split('\n')) {
          if (line.startsWith('event:')) eventName = line.slice(6).trim()
          else if (line.startsWith('data:')) dataStr += line.slice(5).trim()
        }
        if (!dataStr) continue

        let data: { text?: string; message?: string }
        try {
          data = JSON.parse(dataStr)
        } catch {
          continue
        }

        if (eventName === 'delta' && data.text) {
          emit({ requestId, type: 'delta', text: data.text })
        } else if (eventName === 'error') {
          emit({ requestId, type: 'error', message: data.message ?? 'Unknown streaming error' })
        } else if (eventName === 'done') {
          emit({ requestId, type: 'done' })
        }
      }
    }
  } catch (error) {
    const text = error instanceof Error ? error.message : 'Stream interrupted'
    emit({ requestId, type: 'error', message: text })
    return
  }

  emit({ requestId, type: 'done' })
}

function createOverlayWindow(): void {
  overlayWindow = new BrowserWindow({
    width: expandedBounds.width,
    height: expandedBounds.height,
    x: 80,
    y: 60,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    focusable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  overlayWindow.setMinimumSize(MIN_EXPANDED_BOUNDS.width, MIN_EXPANDED_BOUNDS.height)
  overlayWindow.setMaximumSize(MAX_EXPANDED_BOUNDS.width, MAX_EXPANDED_BOUNDS.height)

  overlayWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Keep track of manual resizes so minimize -> maximize restores the size
  // the user actually left it at, not the hardcoded default. Only applies
  // while expanded — while minimized, overlayMinimized guards this, since
  // the animated shrink/grow itself also fires 'resize' events.
  overlayWindow.on('resize', () => {
    if (!overlayWindow || overlayMinimized) return
    const bounds = overlayWindow.getBounds()
    expandedBounds = { width: bounds.width, height: bounds.height }
  })

  // Float above fullscreen apps and follow the user across virtual desktops.
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // Phase 2: exclude this window from OS-level screen capture (see plan.md).
  overlayWindow.setContentProtection(true)

  // Interactive by default (see overlayInteractive above) — click-through
  // only kicks in once the user toggles it via Ctrl/Cmd+Shift+I.
  overlayWindow.setIgnoreMouseEvents(!overlayInteractive, { forward: true })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    overlayWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?overlay=1`)
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/index.html'), { search: 'overlay=1' })
  }

  overlayWindow.once('ready-to-show', () => {
    // showInactive() displays the window without taking OS foreground focus
    // away from whatever the user is currently working in.
    overlayWindow?.showInactive()
  })

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })
}

function toggleOverlayVisibility(): void {
  if (!overlayWindow) return
  if (overlayWindow.isVisible()) {
    overlayWindow.hide()
  } else {
    overlayWindow.showInactive()
  }
}

function toggleOverlayInteractive(): void {
  if (!overlayWindow) return
  overlayInteractive = !overlayInteractive
  // When interactive, stop ignoring mouse events so the user can click/type
  // inside the overlay; when not, forward events through to whatever is
  // underneath so the overlay never blocks the rest of the screen.
  overlayWindow.setIgnoreMouseEvents(!overlayInteractive, { forward: true })
  overlayWindow.webContents.send('overlay:interactive-changed', overlayInteractive)
  // Deliberately not calling .focus() here: doing so on a hotkey press would
  // yank OS foreground focus away from whatever window the user was in,
  // which is what triggers blur/visibilitychange on that window. Toggling
  // into interactive mode just makes the overlay clickable — actual focus
  // only moves when the user clicks into it themselves, same as any window.
}

function animateWindowBounds(
  win: BrowserWindow,
  to: { x: number; y: number; width: number; height: number },
  steps = 10,
  durationMs = 160
): void {
  const from = win.getBounds()
  const stepDuration = durationMs / steps
  let step = 0

  const interval = setInterval(() => {
    step += 1
    const t = step / steps
    win.setBounds({
      x: Math.round(from.x + (to.x - from.x) * t),
      y: Math.round(from.y + (to.y - from.y) * t),
      width: Math.round(from.width + (to.width - from.width) * t),
      height: Math.round(from.height + (to.height - from.height) * t)
    })
    if (step >= steps) clearInterval(interval)
  }, stepDuration)
}

function clampToDisplay(
  anchor: { x: number; y: number },
  width: number,
  height: number
): { x: number; y: number } {
  const display = screen.getDisplayMatching({ x: anchor.x, y: anchor.y, width, height })
  const { x: dx, y: dy, width: dw, height: dh } = display.workArea
  return {
    x: Math.min(Math.max(anchor.x, dx), dx + dw - width),
    y: Math.min(Math.max(anchor.y, dy), dy + dh - height)
  }
}

function toggleOverlayMinimize(): void {
  if (!overlayWindow) return
  overlayMinimized = !overlayMinimized
  const current = overlayWindow.getBounds()

  if (overlayMinimized) {
    // Size constraints must be loosened to the dot's size *before* animating
    // down, otherwise the still-active expanded minimum size would clamp
    // every intermediate setBounds call during the shrink.
    overlayWindow.setMinimumSize(DOT_SIZE, DOT_SIZE)
    overlayWindow.setMaximumSize(DOT_SIZE, DOT_SIZE)
    overlayWindow.setResizable(false)
    animateWindowBounds(overlayWindow, {
      x: current.x,
      y: current.y,
      width: DOT_SIZE,
      height: DOT_SIZE
    })
    // The minimized dot is the entire window's content, so it must always be
    // clickable/draggable regardless of the separate interactive/click-through mode.
    overlayWindow.setIgnoreMouseEvents(false)
  } else {
    overlayWindow.setResizable(true)
    overlayWindow.setMinimumSize(MIN_EXPANDED_BOUNDS.width, MIN_EXPANDED_BOUNDS.height)
    overlayWindow.setMaximumSize(MAX_EXPANDED_BOUNDS.width, MAX_EXPANDED_BOUNDS.height)
    const anchor = clampToDisplay(current, expandedBounds.width, expandedBounds.height)
    animateWindowBounds(overlayWindow, { ...anchor, ...expandedBounds })
    overlayWindow.setIgnoreMouseEvents(!overlayInteractive, { forward: true })
  }

  overlayWindow.webContents.send('overlay:minimized-changed', overlayMinimized)
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Phase 4: renderer-triggered capture (e.g. a button while the overlay is
  // in interactive mode), in addition to the global shortcut below.
  ipcMain.handle('capture:screen', () => captureScreen())

  ipcMain.on(
    'chat:send-stream',
    (event, payload: { requestId: string; message: string; screenshot?: string }) => {
      void streamChatMessage(event.sender, payload.requestId, payload.message, payload.screenshot)
    }
  )

  ipcMain.on('overlay:toggle-minimize', () => toggleOverlayMinimize())
  ipcMain.on('app:quit', () => app.quit())

  createOverlayWindow()

  globalShortcut.register('CommandOrControl+Shift+Space', toggleOverlayVisibility)
  globalShortcut.register('CommandOrControl+Shift+I', toggleOverlayInteractive)
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    void triggerCaptureFromShortcut()
  })
  globalShortcut.register('CommandOrControl+Shift+M', toggleOverlayMinimize)

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createOverlayWindow()
    }
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
