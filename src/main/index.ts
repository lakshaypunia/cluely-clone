import { app, shell, BrowserWindow, ipcMain, globalShortcut } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

let overlayWindow: BrowserWindow | null = null
let overlayInteractive = false

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
    width: 440,
    height: 140,
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
    overlayWindow?.show()
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
    overlayWindow.show()
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
  if (overlayInteractive) {
    overlayWindow.focus()
  }
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

  createWindow()
  createOverlayWindow()

  globalShortcut.register('CommandOrControl+Shift+Space', toggleOverlayVisibility)
  globalShortcut.register('CommandOrControl+Shift+I', toggleOverlayInteractive)

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
