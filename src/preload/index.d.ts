import { ElectronAPI } from '@electron-toolkit/preload'

interface CaptureResult {
  dataUrl: string
  width: number
  height: number
  timestamp: number
}

type ChatResult = { reply: string } | { error: string }

interface Api {
  captureScreen: () => Promise<CaptureResult | null>
  sendChatMessage: (message: string, includeScreenshot: boolean) => Promise<ChatResult>
  toggleMinimize: () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
