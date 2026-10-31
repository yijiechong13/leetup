/** Calls the local API; credentials and model settings stay on the server. */
export interface ChatTurn {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export class LlmError extends Error {
  readonly reason: unknown
  constructor(message: string, reason?: unknown) {
    super(message)
    this.name = 'LlmError'
    this.reason = reason
  }
}

const TIMEOUT_MS = 65_000

export async function chatCompletion(
  messages: ChatTurn[],
  options: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, ...options }),
      signal: controller.signal,
    })
    const body = await response.json() as { content?: unknown; error?: string }
    if (!response.ok) throw new LlmError(body.error || `Model request failed: ${response.status}`)
    if (typeof body.content !== 'string' || !body.content.trim())
      throw new LlmError('Model API returned an empty response')
    return body.content.trim()
  } catch (error) {
    if (error instanceof LlmError) throw error
    if (error instanceof DOMException && error.name === 'AbortError')
      throw new LlmError(`Model request timed out after ${TIMEOUT_MS}ms`, error)
    throw new LlmError('Could not reach the local API', error)
  } finally {
    clearTimeout(timer)
  }
}

/** Accept a JSON reply even when the model adds a code fence or preamble. */
export function extractJson<T>(raw: string): T {
  const candidates = [raw]
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) candidates.push(fenced[1])
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first !== -1 && last > first) candidates.push(raw.slice(first, last + 1))
  for (const candidate of candidates) {
    try { return JSON.parse(candidate.trim()) as T } catch { /* try next */ }
  }
  throw new LlmError(`Model did not return parsable JSON: ${raw.slice(0, 200)}`)
}
