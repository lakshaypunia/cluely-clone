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
import icon from '../../resources/icon.png?asset'

let overlayWindow: BrowserWindow | null = null
let overlayInteractive = false
let overlayMinimized = false

interface CaptureResult {
  dataUrl: string
  width: number
  height: number
  timestamp: number
}

type ChatResult = { reply: string } | { error: string }

// Downscale before the image ever leaves this process — smaller payloads for
// the test server, and less to store on disk.
const CAPTURE_MAX_WIDTH = 1280
const capturesDir = join(app.getPath('userData'), 'captures')

const EXPANDED_BOUNDS = { width: 380, height: 540 }
const DOT_SIZE = 36
const CHAT_SERVER_URL = process.env.CLUELY_CHAT_SERVER_URL ?? 'http://localhost:4319/api/chat'

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

async function sendChatMessage(message: string, includeScreenshot: boolean): Promise<ChatResult> {
  let screenshot: string | undefined
  if (includeScreenshot) {
    const capture = await captureScreen()
    screenshot = capture?.dataUrl
  }

  try {
    const response = await fetch(CHAT_SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, screenshot })
    })
    if (!response.ok) {
      throw new Error(`Server responded ${response.status}`)
    }
    const data = (await response.json()) as { reply?: string }
    return { reply: data.reply ?? '(empty reply)' }
  } catch (error) {
    const messageText =
      error instanceof Error ? error.message : 'Unknown error contacting chat server'
    return { error: `${messageText} — is the test server running (\`npm run test-server\`)?` }
  }
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createOverlayWindow(): void {
  overlayWindow = new BrowserWindow({
    width: EXPANDED_BOUNDS.width,
    height: EXPANDED_BOUNDS.height,
    x: 80,
    y: 60,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
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

  // Float above fullscreen apps and follow the user across virtual desktops.
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // Phase 2: exclude this window from OS-level screen capture (see plan.md).
  overlayWindow.setContentProtection(true)

  // Phase 3: click-through by default so the overlay never blocks the app underneath.
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })

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
    const anchor = clampToDisplay(current, EXPANDED_BOUNDS.width, EXPANDED_BOUNDS.height)
    animateWindowBounds(overlayWindow, { ...anchor, ...EXPANDED_BOUNDS })
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

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // Phase 4: renderer-triggered capture (e.g. a button while the overlay is
  // in interactive mode), in addition to the global shortcut below.
  ipcMain.handle('capture:screen', () => captureScreen())

  ipcMain.handle('chat:send', (_event, payload: { message: string; includeScreenshot: boolean }) =>
    sendChatMessage(payload.message, payload.includeScreenshot)
  )

  ipcMain.on('overlay:toggle-minimize', () => toggleOverlayMinimize())

  createWindow()
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
      createWindow()
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
