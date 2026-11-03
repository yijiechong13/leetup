import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

const envFile = resolve(process.cwd(), '.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const host = '127.0.0.1'
const port = Number(process.env.LEETUP_API_PORT || 8787)
const configured = () => Boolean(
  process.env.ANTHROPIC_API_KEY &&
  process.env.ANTHROPIC_API_KEY !== 'replace_with_anthropic_key',
)
const model = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5'
/** Commit the logs were produced on; "-dirty" marks uncommitted changes. */
const codeVersion = () => {
  try {
    const commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    const dirty = execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    return dirty ? `${commit}-dirty` : commit
  } catch {
    return 'unknown'
  }
}
const json = (response, status, body) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

async function readBody(request) {
  let text = ''
  for await (const chunk of request) {
    text += chunk
    if (text.length > 1_000_000) throw new Error('Request too large')
  }
  return JSON.parse(text)
}

async function handle(request, response) {
  if (request.method === 'GET' && request.url === '/api/status') {
    return json(response, 200, { configured: configured(), model: model(), version: codeVersion() })
  }
  if (request.method !== 'POST' || request.url !== '/api/chat') {
    return json(response, 404, { error: 'Not found' })
  }
  if (request.headers.origin) {
    let origin
    try { origin = new URL(request.headers.origin) } catch { /* reject below */ }
    if (!origin || !['localhost', '127.0.0.1'].includes(origin.hostname)) {
      return json(response, 403, { error: 'Local requests only' })
    }
  }
  if (!configured()) {
    return json(response, 503, { error: 'Set ANTHROPIC_API_KEY in .env, then restart.' })
  }

  let body
  try {
    body = await readBody(request)
  } catch {
    return json(response, 400, { error: 'Invalid JSON request' })
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0 ||
      !body.messages.every((message) =>
        ['system', 'user', 'assistant'].includes(message?.role) &&
        typeof message?.content === 'string')) {
    return json(response, 400, { error: 'Invalid conversation messages' })
  }

  const system = body.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n')
  const conversation = body.messages.filter((message) => message.role !== 'system')
  if (!conversation.length) {
    return json(response, 400, { error: 'A learner message is required' })
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        Authorization: `Bearer ${process.env.ANTHROPIC_API_KEY}`,
      },
      body: JSON.stringify({
        model: model(),
        max_tokens: body.maxTokens ?? 1200,
        ...(system ? { system } : {}),
        messages: conversation,
      }),
      signal: AbortSignal.timeout(60_000),
    })
    const reply = await upstream.text()
    if (!upstream.ok) {
      return json(response, 502, { error: `Anthropic API returned ${upstream.status}: ${reply.slice(0, 300)}` })
    }
    const blocks = JSON.parse(reply)?.content
    const content = Array.isArray(blocks)
      ? blocks.filter((block) => block.type === 'text').map((block) => block.text).join('\n')
      : ''
    if (!content.trim()) {
      return json(response, 502, { error: 'Anthropic API returned no text' })
    }
    return json(response, 200, { content: content.trim() })
  } catch {
    return json(response, 502, { error: 'Could not reach the Anthropic API' })
  }
}

export async function startApiServer() {
  const server = createServer((request, response) => {
    void handle(request, response).catch(() =>
      json(response, 500, { error: 'Local API error' }))
  })
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(port, host, resolveListen)
  })
  console.log(`LeetUP API listening on http://${host}:${port}`)
  return server
}
