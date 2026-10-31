/**
 * Minimal chat-completions client.
 *
 * Deliberately thin and dependency-free: it speaks the OpenAI chat-completions
 * request/response shape, which is what most school-provided endpoints expose.
 * Pointing LeetUP at a different provider should mean editing `.env`, not this
 * file — and if a provider differs, `parseCompletion` below is the one seam to
 * adjust.
 *
 * Note this runs in the browser, so `VITE_LLM_API_KEY` is visible to anyone
 * with devtools. That is acceptable for a course prototype with a scoped key;
 * a deployed version would proxy these calls through a server that holds the
 * key. It is called out in the README rather than hidden here.
 */

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

/**
 * Read lazily, so importing this module never throws outside a Vite build.
 *
 * In the browser the values come from Vite's `import.meta.env` (i.e. `.env`).
 * Under Node — the offline harness in `scripts/`, or any future server-side
 * runner — the same names are read from `process.env`, so one `.env` file
 * configures both without a second config format.
 */
export function llmConfig() {
  const viteEnv = (import.meta.env ?? {}) as Record<string, string | undefined>
  // Read `process` off globalThis: it does not exist in the browser bundle, and
  // this keeps Node's types out of the app's compilation.
  const nodeEnv =
    (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env ?? {}
  const read = (key: string) => viteEnv[key] ?? nodeEnv[key] ?? ''

  return {
    apiKey: read('VITE_LLM_API_KEY'),
    apiUrl: read('VITE_LLM_API_URL'),
    model: read('VITE_LLM_MODEL'),
    enabled: read('VITE_USE_LLM') === 'true',
  }
}

/**
 * True when the LLM provider is switched on *and* actually configured. A
 * missing key with `VITE_USE_LLM=true` is a misconfiguration, not a reason to
 * break the session, so the provider seam falls back to the scripted engine.
 */
export function isLlmConfigured(): boolean {
  const { apiKey, apiUrl, model, enabled } = llmConfig()
  return Boolean(enabled && apiKey && apiUrl && model)
}

const TIMEOUT_MS = 30_000

export async function chatCompletion(
  messages: ChatTurn[],
  options: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  const { apiKey, apiUrl, model } = llmConfig()
  if (!apiKey || !apiUrl || !model)
    throw new LlmError(
      'LLM is not configured. Copy .env.example to .env and set VITE_LLM_API_KEY, VITE_LLM_API_URL and VITE_LLM_MODEL.',
    )

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.5,
        max_tokens: options.maxTokens ?? 400,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new LlmError(
        `LLM request failed: ${response.status} ${response.statusText}${
          detail ? ` — ${detail.slice(0, 300)}` : ''
        }`,
      )
    }

    return parseCompletion(await response.json())
  } catch (error) {
    if (error instanceof LlmError) throw error
    if (error instanceof DOMException && error.name === 'AbortError')
      throw new LlmError(`LLM request timed out after ${TIMEOUT_MS}ms`, error)
    throw new LlmError('LLM request could not be completed', error)
  } finally {
    clearTimeout(timer)
  }
}

/** The one place that knows the response shape. Adjust here for a non-OpenAI API. */
function parseCompletion(body: unknown): string {
  const content = (body as { choices?: { message?: { content?: unknown } }[] })
    ?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim())
    throw new LlmError('LLM returned an empty or unrecognised response body')
  return content.trim()
}

/**
 * Pull a JSON object out of a model reply. Models wrap JSON in prose or fences
 * often enough that being strict here would turn a cosmetic slip into a failed
 * turn, so this tries the whole string, then a fenced block, then the first
 * balanced-looking object.
 */
export function extractJson<T>(raw: string): T {
  const candidates = [raw]

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) candidates.push(fenced[1])

  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first !== -1 && last > first) candidates.push(raw.slice(first, last + 1))

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate.trim()) as T
    } catch {
      /* try the next shape */
    }
  }
  throw new LlmError(`LLM did not return parsable JSON: ${raw.slice(0, 200)}`)
}
