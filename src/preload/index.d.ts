import { ElectronAPI } from '@electron-toolkit/preload'

interface CaptureResult {
  dataUrl: string
  width: number
  height: number
  timestamp: number
}

interface Api {
  captureScreen: () => Promise<CaptureResult | null>
  sendChatMessageStream: (requestId: string, message: string, screenshots?: string[]) => void
  toggleMinimize: () => void
  quitApp: () => void
  transcribeAudio: (audio: string, mimeType: string) => Promise<{ text: string; error?: string }>
  copyToClipboard: (text: string) => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
