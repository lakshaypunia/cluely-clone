import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

interface CaptureResult {
  dataUrl: string
  width: number
  height: number
  timestamp: number
}

// Custom APIs for renderer
const api = {
  captureScreen: (): Promise<CaptureResult | null> => ipcRenderer.invoke('capture:screen'),
  // Fire-and-forget: progress arrives via 'chat:stream-event' IPC events
  // (delta/done/error), keyed by requestId, not this call's return value.
  sendChatMessageStream: (requestId: string, message: string, screenshot?: string): void =>
    ipcRenderer.send('chat:send-stream', { requestId, message, screenshot }),
  toggleMinimize: (): void => ipcRenderer.send('overlay:toggle-minimize'),
  quitApp: (): void => ipcRenderer.send('app:quit'),
  transcribeAudio: (audio: string, mimeType: string): Promise<{ text: string; error?: string }> =>
    ipcRenderer.invoke('audio:transcribe', { audio, mimeType }),
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
