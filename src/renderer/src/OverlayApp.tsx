import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  screenshotDataUrl?: string
  timestamp: number
  streaming?: boolean
}

type ChatStreamEvent =
  | { requestId: string; type: 'delta'; text: string }
  | { requestId: string; type: 'done' }
  | { requestId: string; type: 'error'; message: string }

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

function CrossIcon(): React.JSX.Element {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <path d="M5 5l14 14M19 5L5 19" />
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
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  // Only auto-scroll while the user is already at (or near) the bottom, so
  // scrolling up to read a past message — including mid-stream — doesn't
  // get yanked back down by every incoming chunk. Starts true so the first
  // message and normal sends still scroll into view.
  const isPinnedToBottomRef = useRef(true)

  const handleMessagesScroll = (): void => {
    const el = messagesContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isPinnedToBottomRef.current = distanceFromBottom < 60
  }

  useEffect(() => {
    const minimizedHandler = (_event: unknown, value: boolean): void => setMinimized(value)
    window.electron.ipcRenderer.on('overlay:minimized-changed', minimizedHandler)
    return () => {
      window.electron.ipcRenderer.removeListener('overlay:minimized-changed', minimizedHandler)
    }
  }, [])

  useEffect(() => {
    if (isPinnedToBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
    }
  }, [messages])

  useEffect(() => {
    const handler = (_event: unknown, data: ChatStreamEvent): void => {
      if (data.type === 'delta') {
        setMessages((prev) =>
          prev.map((m) => (m.id === data.requestId ? { ...m, text: m.text + data.text } : m))
        )
      } else if (data.type === 'done') {
        setMessages((prev) =>
          prev.map((m) => (m.id === data.requestId ? { ...m, streaming: false } : m))
        )
        setSending(false)
      } else if (data.type === 'error') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === data.requestId
              ? {
                  ...m,
                  text: m.text ? `${m.text}\n\n⚠ ${data.message}` : `⚠ ${data.message}`,
                  streaming: false
                }
              : m
          )
        )
        setSending(false)
      }
    }
    window.electron.ipcRenderer.on('chat:stream-event', handler)
    return () => {
      window.electron.ipcRenderer.removeListener('chat:stream-event', handler)
    }
  }, [])

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
    // Sending your own message should always land at the bottom, even if
    // you'd scrolled up to read something earlier.
    isPinnedToBottomRef.current = true

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
    const assistantId = nextMessageId()
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      text: '',
      timestamp: Date.now(),
      streaming: true
    }
    setMessages((prev) => [...prev, userMessage, assistantMessage])

    // Fire-and-forget — the reply streams back via 'chat:stream-event',
    // handled by the listener above, keyed on assistantId as the requestId.
    window.api.sendChatMessageStream(assistantId, text, screenshotDataUrl)
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
        <button className="overlay-close-btn" onClick={() => window.api.quitApp()} title="Quit">
          <CrossIcon />
        </button>
      </div>

      <div className="overlay-messages" ref={messagesContainerRef} onScroll={handleMessagesScroll}>
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
            {message.streaming && message.text === '' ? (
              <span className="overlay-typing-inline">
                <span className="overlay-typing-dot" />
                <span className="overlay-typing-dot" />
                <span className="overlay-typing-dot" />
              </span>
            ) : (
              <div className="overlay-markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
              </div>
            )}
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
