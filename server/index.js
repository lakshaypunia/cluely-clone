// Local chat server for the overlay. Calls Gemini when credentials are
// configured (via server/secrets.json); otherwise falls back to echoing the
// message so the send -> server -> reply pipeline still works end to end
// without any credentials.
//
// secrets.json supports two shapes:
//   1. { "geminiApiKey": "...", "geminiModel": "..." }
//      -> calls the public Generative Language API directly.
//   2. A raw GCP service-account JSON key (type: "service_account", with
//      private_key/client_email/token_uri/project_id, as downloaded from
//      Google Cloud Console)
//      -> exchanges it for an OAuth2 access token (JWT bearer flow) and
//         calls Vertex AI's generateContent endpoint.
const http = require('http')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const PORT = process.env.PORT || 4319
const SECRETS_PATH = path.join(__dirname, 'secrets.json')
const REQUEST_TIMEOUT_MS = 30000
const STREAM_TIMEOUT_MS = 60000
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
const VERTEX_LOCATION = process.env.GEMINI_LOCATION || 'us-central1'

function loadSecrets() {
  try {
    return JSON.parse(fs.readFileSync(SECRETS_PATH, 'utf8'))
  } catch {
    return {}
  }
}

const secrets = loadSecrets()

const apiKey = process.env.GEMINI_API_KEY || secrets.geminiApiKey || null
const serviceAccount =
  secrets.type === 'service_account' && secrets.private_key && secrets.client_email
    ? secrets
    : null

const authMode = apiKey ? 'api-key' : serviceAccount ? 'vertex-service-account' : 'none'

if (authMode === 'api-key') {
  console.log(`[chat] Gemini configured via API key (model: ${secrets.geminiModel || GEMINI_MODEL})`)
} else if (authMode === 'vertex-service-account') {
  console.log(
    `[chat] Gemini configured via Vertex AI service account (project: ${serviceAccount.project_id}, location: ${VERTEX_LOCATION}, model: ${GEMINI_MODEL})`
  )
} else {
  console.log(
    `[chat] No Gemini credentials found (checked GEMINI_API_KEY env var and ${SECRETS_PATH}) — falling back to echo replies`
  )
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
    })
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {})
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function parseScreenshot(dataUrl) {
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl)
  if (!match) return null
  return { mimeType: match[1], data: match[2] }
}

function buildParts(message, screenshotDataUrl) {
  const parts = [{ text: message || '' }]
  if (screenshotDataUrl) {
    const image = parseScreenshot(screenshotDataUrl)
    if (image) {
      parts.push({ inline_data: { mime_type: image.mimeType, data: image.data } })
    }
  }
  return parts
}

function extractText(body) {
  const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || ''
  if (!text) {
    const blockReason = body?.promptFeedback?.blockReason
    throw new Error(blockReason ? `Gemini blocked the prompt (${blockReason})` : 'Gemini returned no text')
  }
  return text
}

async function fetchWithTimeout(url, options, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

// Reads an SSE response body (`data: {...}\n\n` events), pulls the text
// delta out of each Gemini-shaped chunk, and hands it to onDelta as it
// arrives — used to relay Gemini's own streaming format onward.
async function consumeSse(body, onDelta) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    // Google's SSE frames are \r\n\r\n-terminated, not \n\n — normalize first.
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')

    let sepIndex
    while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, sepIndex)
      buffer = buffer.slice(sepIndex + 2)

      for (const line of rawEvent.split('\n')) {
        if (!line.startsWith('data:')) continue
        const dataStr = line.slice(5).trim()
        if (!dataStr) continue

        let obj
        try {
          obj = JSON.parse(dataStr)
        } catch {
          continue
        }

        const blockReason = obj?.promptFeedback?.blockReason
        if (blockReason) throw new Error(`Gemini blocked the prompt (${blockReason})`)

        const text = obj?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || ''
        if (text) onDelta(text)
      }
    }
  }
}

// System prompt for the chat conversation (not used for transcription,
// which has its own single-purpose instruction below).
const SYSTEM_PROMPT =`You are an expert software engineer and Computer Science specialist serving as an ultra-fast, real-time technical interview assistant. Your sole job is to analyze questions captured from the user's screen or messages and provide concise, accurate, production-grade answers.

---

### INPUT HANDLING RULES
1. **Screen & Image Context:** Whenever you receive an image or a message saying "what is on my screen", immediately extract the primary technical question, coding problem, multiple-choice question, or discussion prompt shown. Ignore irrelevant UI elements, browser tabs, or background clutter.
2. **Language Selection:**
   - Always check the screen or text prompt for an explicitly required programming language (e.g., C++, Java, TypeScript, Go).
   - If a specific language is shown, stated, or implied by function signatures/templates in the question, you MUST write your solution in that language.
   - If NO language is specified, default strictly to **Python** (Python 3).

---

### RESPONSE FORMAT & STRUCTURE
You must optimize for fast, at-a-glance readability during live interviews. Deliver responses using clear bullet points and clean structure:

1. **Direct Core Answer / Verdict:**
   - For algorithmic problems: State the optimal approach and target time/space complexity in 1–2 bullets.
   - For multiple-choice questions: State the correct option clearly in the very first line.
   - For conceptual/system design/CSE core questions: State the direct answer or definition immediately.

2. **Key Points / Explanation:**
   - Break down the logic, core mechanism, or step-by-step reasoning into 3–5 bullet points.
   - For multiple-choice questions, provide a brief bullet on why the chosen option is correct, and briefly why distractors are wrong.

3. **Complete Code (When Required):**
   - Provide clean, optimal, well-commented code inside standard Markdown fences.
   - Include function signatures matching the exact problem specifications/constraints.
   - Handle edge cases (empty inputs, nulls, bounds).

4. **Complexity Analysis (For Coding Problems):**
   - **Time Complexity:** $O(...)$ with a 1-line justification.
   - **Space Complexity:** $O(...)$ with a 1-line justification.

---

### BEHAVIORAL CONSTRAINTS
- **Zero Fluff:** Never start with conversational filler (e.g., "Sure, I can help with that!", "Looking at your screen...", "Here is your solution:"). Start directly with the answer.
- **Never Mention Prompts:** Do not mention the word "screenshot", "OCR", or "the image you uploaded" in your final text. Refer only to "the problem" or "the question".
- **Tone:** Professional, precise, confident, and direct.`
const SYSTEM_INSTRUCTION = { parts: [{ text: SYSTEM_PROMPT }] }

// --- API key mode (public Generative Language API) ---

async function callGeminiApiKey(message, screenshotDataUrl) {
  const model = secrets.geminiModel || GEMINI_MODEL
  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: buildParts(message, screenshotDataUrl) }],
        systemInstruction: SYSTEM_INSTRUCTION
      })
    }
  )
  const body = await res.json()
  if (!res.ok) {
    throw new Error(`Gemini API error: ${body?.error?.message || `HTTP ${res.status}`}`)
  }
  return extractText(body)
}

// Disables Gemini 2.5's extended "thinking" pass for streamed replies: with
// it on, the model reasons silently and flushes the whole answer as one or
// two chunks right at the end, which defeats the point of streaming for a
// chat UI. Turning it off trades some reasoning depth for responsiveness —
// the right tradeoff for a live chat assistant.
const STREAMING_GENERATION_CONFIG = { thinkingConfig: { thinkingBudget: 0 } }

async function streamGeminiApiKey(message, screenshotDataUrl, onDelta) {
  const model = secrets.geminiModel || GEMINI_MODEL
  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: buildParts(message, screenshotDataUrl) }],
        systemInstruction: SYSTEM_INSTRUCTION,
        generationConfig: STREAMING_GENERATION_CONFIG
      })
    },
    STREAM_TIMEOUT_MS
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`Gemini API error: ${body?.error?.message || `HTTP ${res.status}`}`)
  }
  await consumeSse(res.body, onDelta)
}

// --- Vertex AI service-account mode ---

let cachedToken = null // { accessToken, expiresAt }

function base64url(input) {
  return Buffer.from(input).toString('base64url')
}

async function getVertexAccessToken() {
  if (cachedToken && cachedToken.expiresAt - Date.now() > 60_000) {
    return cachedToken.accessToken
  }

  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: serviceAccount.token_uri,
    iat: now,
    exp: now + 3600
  }
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), serviceAccount.private_key)
  const jwt = `${signingInput}.${signature.toString('base64url')}`

  const res = await fetchWithTimeout(serviceAccount.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  })
  const body = await res.json()
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${body?.error_description || body?.error || `HTTP ${res.status}`}`)
  }

  cachedToken = { accessToken: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 }
  return cachedToken.accessToken
}

async function callGeminiVertex(message, screenshotDataUrl) {
  const accessToken = await getVertexAccessToken()
  const url = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${serviceAccount.project_id}/locations/${VERTEX_LOCATION}/publishers/google/models/${GEMINI_MODEL}:generateContent`

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: buildParts(message, screenshotDataUrl) }],
      systemInstruction: SYSTEM_INSTRUCTION
    })
  })
  const body = await res.json()
  if (!res.ok) {
    throw new Error(`Vertex AI error: ${body?.error?.message || `HTTP ${res.status}`}`)
  }
  return extractText(body)
}

async function streamGeminiVertex(message, screenshotDataUrl, onDelta) {
  const accessToken = await getVertexAccessToken()
  const url = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${serviceAccount.project_id}/locations/${VERTEX_LOCATION}/publishers/google/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`

  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: buildParts(message, screenshotDataUrl) }],
        systemInstruction: SYSTEM_INSTRUCTION,
        generationConfig: STREAMING_GENERATION_CONFIG
      })
    },
    STREAM_TIMEOUT_MS
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`Vertex AI error: ${body?.error?.message || `HTTP ${res.status}`}`)
  }
  await consumeSse(res.body, onDelta)
}

// --- Mic dictation: audio -> text transcription ---

const TRANSCRIBE_PROMPT =
  'Transcribe the spoken audio exactly as spoken, in the language it was spoken in. ' +
  'Output only the raw transcription text, with no preamble, labels, or quotation marks. ' +
  'If there is no discernible speech, output nothing.'

function buildAudioParts(mimeType, data) {
  return [{ inline_data: { mime_type: mimeType, data } }, { text: TRANSCRIBE_PROMPT }]
}

// Unlike extractText, silence/no-speech is a normal outcome here (empty
// string), not an error — only an actual block reason should throw.
function extractTranscript(body) {
  const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || ''
  const blockReason = body?.promptFeedback?.blockReason
  if (blockReason && !text) throw new Error(`Gemini blocked the prompt (${blockReason})`)
  return text.trim()
}

async function transcribeAudioApiKey(mimeType, data) {
  const model = secrets.geminiModel || GEMINI_MODEL
  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: buildAudioParts(mimeType, data) }] })
    }
  )
  const body = await res.json()
  if (!res.ok) {
    throw new Error(`Gemini API error: ${body?.error?.message || `HTTP ${res.status}`}`)
  }
  return extractTranscript(body)
}

async function transcribeAudioVertex(mimeType, data) {
  const accessToken = await getVertexAccessToken()
  const url = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${serviceAccount.project_id}/locations/${VERTEX_LOCATION}/publishers/google/models/${GEMINI_MODEL}:generateContent`

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ contents: [{ role: 'user', parts: buildAudioParts(mimeType, data) }] })
  })
  const body = await res.json()
  if (!res.ok) {
    throw new Error(`Vertex AI error: ${body?.error?.message || `HTTP ${res.status}`}`)
  }
  return extractTranscript(body)
}

function echoReply(message, screenshotDataUrl) {
  return screenshotDataUrl
    ? `Test server received "${message}" plus a screenshot (${Math.round(screenshotDataUrl.length / 1024)}KB data URL).`
    : `Test server received "${message}".`
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/chat') {
    try {
      const body = await readJsonBody(req)
      const message = typeof body.message === 'string' ? body.message : ''
      const screenshot = typeof body.screenshot === 'string' ? body.screenshot : null

      console.log(
        `[chat] "${message}"${screenshot ? ` + screenshot (${Math.round(screenshot.length / 1024)}KB)` : ''}`
      )

      let reply
      if (authMode === 'api-key') {
        reply = await callGeminiApiKey(message, screenshot)
      } else if (authMode === 'vertex-service-account') {
        reply = await callGeminiVertex(message, screenshot)
      } else {
        reply = echoReply(message, screenshot)
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ reply, receivedAt: Date.now() }))
    } catch (err) {
      if (err instanceof SyntaxError) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON body' }))
        return
      }
      console.error('[chat] Gemini call failed:', err.message)
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/api/chat/stream') {
    let body
    try {
      body = await readJsonBody(req)
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid JSON body' }))
      return
    }
    const message = typeof body.message === 'string' ? body.message : ''
    const screenshot = typeof body.screenshot === 'string' ? body.screenshot : null

    console.log(
      `[chat] (stream) "${message}"${screenshot ? ` + screenshot (${Math.round(screenshot.length / 1024)}KB)` : ''}`
    )

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    })
    const sendEvent = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    try {
      if (authMode === 'api-key') {
        await streamGeminiApiKey(message, screenshot, (text) => sendEvent('delta', { text }))
      } else if (authMode === 'vertex-service-account') {
        await streamGeminiVertex(message, screenshot, (text) => sendEvent('delta', { text }))
      } else {
        // No credentials: simulate streaming by trickling the echo reply out
        // word by word, so the pipeline is still exercisable without them.
        const words = echoReply(message, screenshot).split(' ')
        for (let i = 0; i < words.length; i++) {
          sendEvent('delta', { text: i < words.length - 1 ? `${words[i]} ` : words[i] })
          await new Promise((r) => setTimeout(r, 35))
        }
      }
      sendEvent('done', {})
    } catch (err) {
      console.error('[chat] Gemini stream failed:', err.message)
      sendEvent('error', { message: err.message })
    }
    res.end()
    return
  }

  if (req.method === 'POST' && req.url === '/api/transcribe') {
    try {
      const body = await readJsonBody(req)
      const audio = typeof body.audio === 'string' ? body.audio : ''
      const mimeType = typeof body.mimeType === 'string' ? body.mimeType : ''
      if (!audio || !mimeType) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing audio or mimeType' }))
        return
      }

      console.log(`[transcribe] ${mimeType}, ${Math.round(audio.length / 1024)}KB`)

      let text
      if (authMode === 'api-key') {
        text = await transcribeAudioApiKey(mimeType, audio)
      } else if (authMode === 'vertex-service-account') {
        text = await transcribeAudioVertex(mimeType, audio)
      } else {
        text = ''
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ text }))
    } catch (err) {
      if (err instanceof SyntaxError) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON body' }))
        return
      }
      console.error('[transcribe] Gemini call failed:', err.message)
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

server.listen(PORT, () => {
  console.log(`Chat server listening on http://localhost:${PORT}`)
})
