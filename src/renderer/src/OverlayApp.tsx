import { useEffect, useRef, useState } from 'react'

interface CaptureResult {
  dataUrl: string
  width: number
  height: number
  timestamp: number
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  hasScreenshot: boolean
  timestamp: number
}

let messageIdCounter = 0
function nextMessageId(): string {
  messageIdCounter += 1
  return `msg-${Date.now()}-${messageIdCounter}`
}

function OverlayApp(): React.JSX.Element {
  const [interactive, setInteractive] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [capture, setCapture] = useState<CaptureResult | null>(null)
  const [capturing, setCapturing] = useState(false)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [attachScreenshot, setAttachScreenshot] = useState(false)
  const [sending, setSending] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const interactiveHandler = (_event: unknown, value: boolean): void => setInteractive(value)
    const minimizedHandler = (_event: unknown, value: boolean): void => setMinimized(value)
    const captureHandler = (_event: unknown, result: CaptureResult): void => setCapture(result)

    window.electron.ipcRenderer.on('overlay:interactive-changed', interactiveHandler)
    window.electron.ipcRenderer.on('overlay:minimized-changed', minimizedHandler)
    window.electron.ipcRenderer.on('capture:result', captureHandler)

    return () => {
      window.electron.ipcRenderer.removeListener('overlay:interactive-changed', interactiveHandler)
      window.electron.ipcRenderer.removeListener('overlay:minimized-changed', minimizedHandler)
      window.electron.ipcRenderer.removeListener('capture:result', captureHandler)
    }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleToggleMinimize = (): void => {
    window.api.toggleMinimize()
  }

  const handleCaptureClick = async (): Promise<void> => {
    setCapturing(true)
    try {
      const result = await window.api.captureScreen()
      if (result) setCapture(result)
    } finally {
      setCapturing(false)
    }
  }

  const handleSend = async (): Promise<void> => {
    const text = input.trim()
    if (!text || sending) return

    const userMessage: ChatMessage = {
      id: nextMessageId(),
      role: 'user',
      text,
      hasScreenshot: attachScreenshot,
      timestamp: Date.now()
    }
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setSending(true)

    try {
      const result = await window.api.sendChatMessage(text, attachScreenshot)
      const replyMessage: ChatMessage = {
        id: nextMessageId(),
        role: 'assistant',
        text: 'error' in result ? `⚠ ${result.error}` : result.reply,
        hasScreenshot: false,
        timestamp: Date.now()
      }
      setMessages((prev) => [...prev, replyMessage])
    } finally {
      setSending(false)
    }
  }

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSend()
    }
  }

  if (minimized) {
    return (
      <div
        className="overlay-dot-standalone"
        data-active={interactive}
        onClick={handleToggleMinimize}
        title="Click, or Ctrl/Cmd+Shift+M, to expand"
      />
    )
  }

  return (
    <div className="overlay-panel">
      <div className="overlay-titlebar">
        <span
          className="overlay-dot"
          data-active={interactive}
          onClick={handleToggleMinimize}
          title="Click, or Ctrl/Cmd+Shift+M, to minimize"
        />
        <div className="overlay-text">
          <strong>Overlay</strong>
          <span>{interactive ? 'Interactive' : 'Click-through'} — Ctrl/Cmd+Shift+I</span>
        </div>
      </div>

      <div className="overlay-chat">
        <div className="overlay-messages">
          {messages.length === 0 && (
            <div className="overlay-empty">
              Send a message to the local test server (<code>npm run test-server</code>).
            </div>
          )}
          {messages.map((message) => (
            <div key={message.id} className={`overlay-bubble overlay-bubble-${message.role}`}>
              {message.hasScreenshot && <span className="overlay-bubble-tag">+ screenshot</span>}
              <p>{message.text}</p>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="overlay-composer">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="Message the test server…"
            rows={2}
          />
          <div className="overlay-composer-row">
            <label className="overlay-checkbox">
              <input
                type="checkbox"
                checked={attachScreenshot}
                onChange={(event) => setAttachScreenshot(event.target.checked)}
              />
              Attach screenshot
            </label>
            <button
              className="overlay-send-btn"
              onClick={handleSend}
              disabled={sending || !input.trim()}
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </div>

      <details className="overlay-capture-section">
        <summary>Capture-exclusion demo</summary>
        {capture && (
          <div className="overlay-preview">
            <img src={capture.dataUrl} alt="Last capture" />
            <span>
              {capture.width}×{capture.height} — {new Date(capture.timestamp).toLocaleTimeString()}
            </span>
          </div>
        )}
        <button className="overlay-capture-btn" onClick={handleCaptureClick} disabled={capturing}>
          {capturing ? 'Capturing…' : 'Capture now (Ctrl/Cmd+Shift+S)'}
        </button>
      </details>
    </div>
  )
}

export default OverlayApp
