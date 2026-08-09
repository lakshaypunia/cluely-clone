// Zero-dependency local test server for the overlay's chat interface.
// Not a real backend/LLM integration — it just echoes back what it received
// so the send -> server -> reply round trip can be exercised end to end.
const http = require('http')

const PORT = process.env.PORT || 4319

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

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/chat') {
    try {
      const body = await readJsonBody(req)
      const message = typeof body.message === 'string' ? body.message : ''
      const screenshot = typeof body.screenshot === 'string' ? body.screenshot : null

      console.log(
        `[chat] "${message}"${screenshot ? ` + screenshot (${Math.round(screenshot.length / 1024)}KB)` : ''}`
      )

      const reply = screenshot
        ? `Test server received "${message}" plus a screenshot (${Math.round(screenshot.length / 1024)}KB data URL).`
        : `Test server received "${message}".`

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ reply, receivedAt: Date.now() }))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid JSON body' }))
    }
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

server.listen(PORT, () => {
  console.log(`Test chat server listening on http://localhost:${PORT}`)
})
