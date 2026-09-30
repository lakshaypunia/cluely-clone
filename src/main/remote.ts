import { createServer, IncomingMessage, ServerResponse } from 'http'
import { networkInterfaces } from 'os'
import { randomBytes } from 'crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import remoteHtml from './remote.html?raw'

// Phone remote: a tiny LAN-only HTTP server that serves a touch-friendly
// control page and maps each POST straight onto the same command functions
// the global shortcuts use — no synthetic key presses involved.

export interface RemoteServerOptions {
  port: number
  tokenFile: string
  commands: Record<string, () => void>
  sendText: (text: string) => void
  getState: () => unknown
}

export interface RemoteServerInfo {
  urls: string[]
  token: string
}

// Persisted so a phone bookmark (which carries the token) keeps working
// across app restarts. Delete the file to rotate it.
function loadOrCreateToken(tokenFile: string): string {
  try {
    const existing = readFileSync(tokenFile, 'utf8').trim()
    if (existing) return existing
  } catch {
    // no token yet
  }
  const token = randomBytes(9).toString('base64url')
  try {
    mkdirSync(dirname(tokenFile), { recursive: true })
    writeFileSync(tokenFile, token)
  } catch (error) {
    console.error('Failed to persist remote token:', error)
  }
  return token
}

function lanAddresses(): string[] {
  const addresses: string[] = []
  for (const iface of Object.values(networkInterfaces())) {
    for (const addr of iface ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) addresses.push(addr.address)
    }
  }
  return addresses
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

const MAX_BODY_BYTES = 64 * 1024

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        reject(new Error('Invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

export function startRemoteServer(options: RemoteServerOptions): RemoteServerInfo {
  const token = loadOrCreateToken(options.tokenFile)

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(remoteHtml)
      return
    }

    if (!url.pathname.startsWith('/api/')) {
      sendJson(res, 404, { error: 'Not found' })
      return
    }

    // The page itself is public; every API call needs the token.
    if (req.headers['x-remote-token'] !== token) {
      sendJson(res, 401, { error: 'Invalid or missing token' })
      return
    }

    try {
      if (req.method === 'GET' && url.pathname === '/api/state') {
        sendJson(res, 200, {
          commands: Object.keys(options.commands),
          state: options.getState()
        })
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/command') {
        const body = await readJsonBody(req)
        const name = typeof body.command === 'string' ? body.command : ''
        const command = options.commands[name]
        if (!command) {
          sendJson(res, 400, { error: `Unknown command: ${name}` })
          return
        }
        command()
        sendJson(res, 200, { ok: true })
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/message') {
        const body = await readJsonBody(req)
        const text = typeof body.text === 'string' ? body.text.trim() : ''
        if (!text) {
          sendJson(res, 400, { error: 'Message text is empty' })
          return
        }
        options.sendText(text)
        sendJson(res, 200, { ok: true })
        return
      }

      sendJson(res, 404, { error: 'Not found' })
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : 'Bad request' })
    }
  })

  server.on('error', (error) => {
    console.error(`Phone remote server failed on port ${options.port}:`, error)
  })

  server.listen(options.port, '0.0.0.0')

  const urls = lanAddresses().map((ip) => `http://${ip}:${options.port}/?t=${token}`)
  console.log('\n📱 Phone remote ready — open on a phone on the same Wi-Fi:')
  for (const u of urls) console.log(`   ${u}`)
  console.log('')

  return { urls, token }
}
