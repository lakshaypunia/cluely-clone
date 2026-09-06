import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  screenshotDataUrls?: string[]
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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(((reader.result as string) ?? '').split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read recording'))
    reader.readAsDataURL(blob)
  })
}

const MIC_MIME_CANDIDATES = [
  'audio/ogg;codecs=opus',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/wav'
]

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

function MicIcon(): React.JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
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
  // Screenshots queued up via Ctrl/Cmd+Shift+S (or the camera button) before
  // sending — lets you capture several and send them together in one message.
  const [pendingScreenshots, setPendingScreenshots] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)

  // Mic dictation (Ctrl/Cmd+Shift+7): records the user's own mic locally,
  // then sends the finished clip to the server for a one-shot transcription
  // once recording stops — not a live/continuous stream. `isRecordingRef`
  // (not the `micRecording` state) is what the toggle logic reads, so a
  // rapid second shortcut press can't race a not-yet-flushed state update.
  const [micRecording, setMicRecording] = useState(false)
  const [micStatus, setMicStatus] = useState<string | null>(null)
  const isRecordingRef = useRef(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

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

  // Ctrl/Cmd+Shift+H is a main-process global shortcut, so it arrives here
  // as a push event rather than a call the renderer initiates. Routed
  // through a ref (updated on every render below, right after handleSend is
  // defined) so this one-time subscription always calls the latest
  // handleSend closure instead of a stale one.
  const handleSendRef = useRef<(forceScreenshot?: boolean) => Promise<void>>(async () => {})
  useEffect(() => {
    const quickSendHandler = (): void => {
      void handleSendRef.current(true)
    }
    window.electron.ipcRenderer.on('shortcut:quick-send', quickSendHandler)
    return () => {
      window.electron.ipcRenderer.removeListener('shortcut:quick-send', quickSendHandler)
    }
  }, [])

  // Ctrl/Cmd+Shift+R / +Y — scroll the message list up/down, same global-
  // shortcut push pattern as quick-send above.
  const SCROLL_STEP = 120
  useEffect(() => {
    const scrollHandler = (_event: unknown, direction: 'up' | 'down'): void => {
      const el = messagesContainerRef.current
      if (!el) return
      el.scrollTop += direction === 'up' ? -SCROLL_STEP : SCROLL_STEP
    }
    window.electron.ipcRenderer.on('shortcut:scroll', scrollHandler)
    return () => {
      window.electron.ipcRenderer.removeListener('shortcut:scroll', scrollHandler)
    }
  }, [])

  const handleRecordingStop = async (mimeType: string): Promise<void> => {
    const chunks = audioChunksRef.current
    audioChunksRef.current = []
    micStreamRef.current?.getTracks().forEach((track) => track.stop())
    micStreamRef.current = null
    mediaRecorderRef.current = null
    isRecordingRef.current = false
    setMicRecording(false)

    if (chunks.length === 0) return

    setMicStatus('Transcribing…')
    try {
      const blob = new Blob(chunks, { type: mimeType })
      const base64 = await blobToBase64(blob)
      const result = await window.api.transcribeAudio(base64, mimeType.split(';')[0])
      if (result.error) {
        setMicStatus(`Mic error: ${result.error}`)
      } else {
        setMicStatus(null)
        if (result.text) {
          setInput((prev) => (prev ? `${prev} ${result.text}` : result.text))
        }
      }
    } catch (error) {
      setMicStatus(error instanceof Error ? error.message : 'Transcription failed')
    }
  }

  const startMicRecording = async (): Promise<void> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MIC_MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      audioChunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        void handleRecordingStop(recorder.mimeType || mimeType || 'audio/webm')
      }
      mediaRecorderRef.current = recorder
      micStreamRef.current = stream
      recorder.start()
      isRecordingRef.current = true
      setMicRecording(true)
      setMicStatus(null)
    } catch (error) {
      setMicStatus(error instanceof Error ? error.message : 'Microphone access failed')
    }
  }

  // Toggle, not push-to-talk: first press starts recording (shown live via
  // the "Listening…" indicator in the composer), second press stops it and
  // kicks off transcription.
  const toggleMicDictation = (): void => {
    if (isRecordingRef.current) {
      mediaRecorderRef.current?.stop()
    } else {
      void startMicRecording()
    }
  }
  const toggleMicDictationRef = useRef<() => void>(() => {})
  useEffect(() => {
    toggleMicDictationRef.current = toggleMicDictation
  })

  // Ctrl/Cmd+Shift+7/8/9/0 — mic toggle, clear composer, send, toggle the
  // screenshot-attach flag. Same global-shortcut push pattern as above.
  useEffect(() => {
    const micToggleHandler = (): void => toggleMicDictationRef.current()
    window.electron.ipcRenderer.on('shortcut:mic-toggle', micToggleHandler)
    return () => {
      window.electron.ipcRenderer.removeListener('shortcut:mic-toggle', micToggleHandler)
    }
  }, [])

  useEffect(() => {
    const clearInputHandler = (): void => setInput('')
    window.electron.ipcRenderer.on('shortcut:clear-input', clearInputHandler)
    return () => {
      window.electron.ipcRenderer.removeListener('shortcut:clear-input', clearInputHandler)
    }
  }, [])

  useEffect(() => {
    const sendHandler = (): void => {
      void handleSendRef.current()
    }
    window.electron.ipcRenderer.on('shortcut:send', sendHandler)
    return () => {
      window.electron.ipcRenderer.removeListener('shortcut:send', sendHandler)
    }
  }, [])

  // Ctrl/Cmd+Shift+0 clears the queued screenshots (in case one was captured
  // by mistake), and Ctrl/Cmd+Shift+S captures one and adds it to the queue.
  useEffect(() => {
    const clearScreenshotsHandler = (): void => setPendingScreenshots([])
    window.electron.ipcRenderer.on('shortcut:clear-screenshots', clearScreenshotsHandler)
    return () => {
      window.electron.ipcRenderer.removeListener(
        'shortcut:clear-screenshots',
        clearScreenshotsHandler
      )
    }
  }, [])

  const lastCaptureTimestampRef = useRef<number>(0)
  useEffect(() => {
    const captureResultHandler = (
      _event: unknown,
      result: { dataUrl: string; timestamp: number } | null
    ): void => {
      if (!result || result.timestamp === lastCaptureTimestampRef.current) return
      lastCaptureTimestampRef.current = result.timestamp
      setPendingScreenshots((prev) => [...prev, result.dataUrl])
    }
    window.electron.ipcRenderer.on('capture:result', captureResultHandler)
    return () => {
      window.electron.ipcRenderer.removeListener('capture:result', captureResultHandler)
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
          prev.map((m) => {
            if (m.id !== data.requestId) return m
            if (m.text) window.api.copyToClipboard(m.text)
            return { ...m, streaming: false }
          })
        )
        sendingRef.current = false
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
        sendingRef.current = false
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

  // forceScreenshot is set by the Ctrl/Cmd+Shift+H "quick send" shortcut:
  // captures one more screenshot on top of whatever's already queued and
  // falls back to a default prompt if the composer is empty, since the
  // point of that shortcut is "capture and ask" with no typing required.
  const handleSend = async (forceScreenshot = false): Promise<void> => {
    // `sendingRef` (not the `sending` state) guards re-entrancy: React state
    // updates are async, so a second call arriving in the same tick — e.g.
    // a global hotkey firing twice for one keypress — could still see the
    // stale `sending === false` from before `setSending(true)` flushes. The
    // ref updates synchronously, so it actually blocks the second call.
    if (sendingRef.current) return

    // Capture client-side first so the thumbnails shown in the bubble are
    // exactly the images that get sent to the server, not a second,
    // separate capture.
    const freshCapture = forceScreenshot
      ? ((await window.api.captureScreen())?.dataUrl ?? undefined)
      : undefined
    const screenshotDataUrls = freshCapture
      ? [...pendingScreenshots, freshCapture]
      : pendingScreenshots
    const text = input.trim() || (forceScreenshot ? "What's on my screen?" : '')
    if (!text && screenshotDataUrls.length === 0) return
    sendingRef.current = true

    setInput('')
    setPendingScreenshots([])
    setSending(true)
    // Sending your own message should always land at the bottom, even if
    // you'd scrolled up to read something earlier.
    isPinnedToBottomRef.current = true

    const userMessage: ChatMessage = {
      id: nextMessageId(),
      role: 'user',
      text,
      screenshotDataUrls: screenshotDataUrls.length ? screenshotDataUrls : undefined,
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
    window.api.sendChatMessageStream(assistantId, text, screenshotDataUrls)
  }
  useEffect(() => {
    handleSendRef.current = handleSend
  })

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
            {message.screenshotDataUrls && message.screenshotDataUrls.length > 0 && (
              <div className="overlay-bubble-thumbs">
                {message.screenshotDataUrls.map((url, index) => (
                  <img
                    key={index}
                    className="overlay-bubble-thumb"
                    src={url}
                    alt={`Screenshot ${index + 1}`}
                  />
                ))}
              </div>
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

      {(micRecording || micStatus) && (
        <div className={`overlay-mic-status${micRecording ? ' overlay-mic-status-live' : ''}`}>
          {micRecording && <span className="overlay-mic-dot" />}
          {micRecording ? 'Listening…' : micStatus}
        </div>
      )}

      {pendingScreenshots.length > 0 && (
        <div className="overlay-pending-thumbs">
          {pendingScreenshots.map((url, index) => (
            <div key={index} className="overlay-pending-thumb-wrap">
              <img
                className="overlay-pending-thumb"
                src={url}
                alt={`Queued screenshot ${index + 1}`}
              />
              <button
                className="overlay-pending-thumb-remove"
                onClick={() => setPendingScreenshots((prev) => prev.filter((_, i) => i !== index))}
                title="Remove"
              >
                <CrossIcon />
              </button>
            </div>
          ))}
        </div>
      )}

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
            className={`overlay-icon-btn${micRecording ? ' overlay-icon-btn-active' : ''}`}
            onClick={() => toggleMicDictationRef.current()}
            title="Dictate a message with your mic"
          >
            <MicIcon />
          </button>
          <button
            className={`overlay-icon-btn${pendingScreenshots.length ? ' overlay-icon-btn-active' : ''}`}
            onClick={async () => {
              const result = await window.api.captureScreen()
              if (result) setPendingScreenshots((prev) => [...prev, result.dataUrl])
            }}
            title="Capture a screenshot and queue it for this message"
          >
            <CameraIcon />
          </button>
          <button
            className="overlay-send-btn"
            onClick={() => handleSend()}
            disabled={sending || (!input.trim() && pendingScreenshots.length === 0)}
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
