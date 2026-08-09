import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

interface CaptureResult {
  dataUrl: string
  width: number
  height: number
  timestamp: number
}

type ChatResult = { reply: string } | { error: string }

// Custom APIs for renderer
const api = {
  captureScreen: (): Promise<CaptureResult | null> => ipcRenderer.invoke('capture:screen'),
  sendChatMessage: (message: string, includeScreenshot: boolean): Promise<ChatResult> =>
    ipcRenderer.invoke('chat:send', { message, includeScreenshot }),
  toggleMinimize: (): void => ipcRenderer.send('overlay:toggle-minimize')
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
