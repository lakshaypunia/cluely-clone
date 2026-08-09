import { useEffect, useRef, useState } from 'react'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  screenshotDataUrl?: string
  timestamp: number
}

let messageIdCounter = 0
function nextMessageId(): string {
  messageIdCounter += 1
  return `msg-${Date.now()}-${messageIdCounter}`
}

function CameraIcon(): React.JSX.Element {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

function SendIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2 21l21-9L2 3v7l15 2-15 2z" />
    </svg>
  )
}

function OverlayApp(): React.JSX.Element {
  const [minimized, setMinimized] = useState(false)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [attachScreenshot, setAttachScreenshot] = useState(false)
  const [sending, setSending] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const minimizedHandler = (_event: unknown, value: boolean): void => setMinimized(value)
    window.electron.ipcRenderer.on('overlay:minimized-changed', minimizedHandler)
    return () => {
      window.electron.ipcRenderer.removeListener('overlay:minimized-changed', minimizedHandler)
    }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // The dot is a native OS drag region (needed so it can be dragged around
  // as a tiny window), and Electron/Chromium generally does not deliver a
  // normal `click` event through a drag region — the OS-level drag handler
  // intercepts it. So a "click" is instead detected from raw mousedown ->
  // mouseup timing/movement, which drag regions still deliver.
  const dotPressRef = useRef<{ time: number; x: number; y: number } | null>(null)

  const handleDotMouseDown = (event: React.MouseEvent): void => {
    dotPressRef.current = { time: Date.now(), x: event.screenX, y: event.screenY }
  }

  const handleDotMouseUp = (event: React.MouseEvent): void => {
    const press = dotPressRef.current
    dotPressRef.current = null
    if (!press) return
    const elapsed = Date.now() - press.time
    const distance = Math.hypot(event.screenX - press.x, event.screenY - press.y)
    if (elapsed < 500 && distance < 6) {
      window.api.toggleMinimize()
    }
  }

  const handleSend = async (): Promise<void> => {
    const text = input.trim()
    if (!text || sending) return

    setInput('')
    setSending(true)

    try {
      // Capture client-side first so the thumbnail shown in the bubble is
      // exactly the image that gets sent to the server, not a second,
      // separate capture.
      const screenshotDataUrl = attachScreenshot
        ? ((await window.api.captureScreen())?.dataUrl ?? undefined)
        : undefined

      const userMessage: ChatMessage = {
        id: nextMessageId(),
        role: 'user',
        text,
        screenshotDataUrl,
        timestamp: Date.now()
      }
      setMessages((prev) => [...prev, userMessage])

      const result = await window.api.sendChatMessage(text, screenshotDataUrl)
      const replyMessage: ChatMessage = {
        id: nextMessageId(),
        role: 'assistant',
        text: 'error' in result ? `⚠ ${result.error}` : result.reply,
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
        onMouseDown={handleDotMouseDown}
        onMouseUp={handleDotMouseUp}
      />
    )
  }

  return (
    <div className="overlay-panel">
      <div className="overlay-titlebar">
        <span
          className="overlay-dot"
          onMouseDown={handleDotMouseDown}
          onMouseUp={handleDotMouseUp}
        />
      </div>

      <div className="overlay-messages">
        {messages.length === 0 && <div className="overlay-empty">Ask anything…</div>}
        {messages.map((message) => (
          <div key={message.id} className={`overlay-bubble overlay-bubble-${message.role}`}>
            {message.screenshotDataUrl && (
              <img
                className="overlay-bubble-thumb"
                src={message.screenshotDataUrl}
                alt="Screenshot"
              />
            )}
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
          placeholder="Message…"
          rows={1}
        />
        <div className="overlay-composer-actions">
          <button
            className={`overlay-icon-btn${attachScreenshot ? ' overlay-icon-btn-active' : ''}`}
            onClick={() => setAttachScreenshot((value) => !value)}
            title="Attach a screenshot with this message"
          >
            <CameraIcon />
          </button>
          <button
            className="overlay-send-btn"
            onClick={handleSend}
            disabled={sending || !input.trim()}
            title="Send"
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </div>
  )
}

export default OverlayApp
