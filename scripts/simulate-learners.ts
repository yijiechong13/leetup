/**
 * Simulated learners for the LLM-judge test set.
 *
 * LeetUP's turns come from its real pipeline (`llmProvider.getNextResponse`);
 * each learner turn comes from an LLM playing a persona from
 * llm_judge/personas.md. Both go through the local API server, so start it
 * first with `npm run dev`.
 *
 *   npx tsx scripts/simulate-learners.ts --jobs C01:P1,C02:P2 [--root <dir>]
 *
 * --root   checkout whose tutor code is run (default: this repo). Use a git
 *          worktree to run an earlier commit without touching this tree.
 * --jobs   comma-separated <conversationId>:<personaId> pairs.
 * --out    output folder (default llm_judge/conversations).
 * --max    learner-turn limit (default 12).
 * --parallel  conversations run at once (default 3).
 * --prompt learner prompt version, llm_judge/learner_prompts/learner_<v>.md (default v2).
 *
 * Each conversation is saved as Markdown in the format of src/lib/exportLog.ts
 * plus a JSON copy. A run stops at the completion summary or the turn limit.
 */
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/* ---------------- arguments ---------------- */

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`)
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1]
  if (fallback !== undefined) return fallback
  throw new Error(`Missing --${name}`)
}

const repo = resolve(import.meta.dirname, '..')
const root = resolve(arg('root', repo))
const outDir = resolve(arg('out', resolve(repo, 'llm_judge/conversations')))
const maxTurns = Number(arg('max', '12'))
const parallel = Number(arg('parallel', '3'))
const promptVersion = arg('prompt', 'v2')
const apiBase = process.env.LEETUP_API_URL ?? `http://127.0.0.1:${process.env.LEETUP_API_PORT ?? 8787}`
const jobs = arg('jobs').split(',').map((pair) => {
  const [id, persona] = pair.split(':')
  if (!id || !persona) throw new Error(`Bad job "${pair}", expected C01:P1`)
  return { id, persona }
})

/* ---------------- relative fetch → local API ---------------- */

// The tutor's llmClient calls fetch('/api/chat') as the browser would. Node has
// no page origin, so resolve relative URLs against the local API server.
const nodeFetch = globalThis.fetch
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  nodeFetch(typeof input === 'string' && input.startsWith('/') ? apiBase + input : input, init)) as typeof fetch

/* ---------------- tutor modules from the chosen checkout ---------------- */

const load = (path: string) => import(pathToFileURL(resolve(root, path)).href)
const { llmProvider } = await load('src/lib/llmProvider.ts')
const { createSession, startSession } = await load('src/lib/session.ts')
const { logTurn } = await load('src/lib/exportLog.ts')
const { getProblem } = await load('src/data/problemBank.ts')

// Keep the console to progress lines; the trace already records policy notes.
console.info = () => {}

/* ---------------- run information ---------------- */

/** Commit of the checkout being run; "-dirty" only if the tutor code itself changed. */
function codeVersion() {
  const git = (cmd: string) => execSync(`git -C "${root}" ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  try {
    const commit = git('rev-parse --short HEAD')
    return git('status --porcelain -- src server package.json') ? `${commit}-dirty` : commit
  } catch {
    return 'unknown'
  }
}

const status = await (await fetch('/api/status')).json() as { configured?: boolean; model?: string }
if (!status.configured) throw new Error('Local API is not configured; set ANTHROPIC_API_KEY and restart npm run dev.')
const info = { model: status.model ?? 'unknown', version: codeVersion() }

/* ---------------- personas ---------------- */

interface Persona { id: string; name: string; who: string; wants: string; behaves: string; stuck: string }

function readPersonas(): Map<string, Persona> {
  const text = readFileSync(resolve(repo, 'llm_judge/personas.md'), 'utf8')
  const personas = new Map<string, Persona>()
  for (const line of text.split('\n')) {
    const cells = line.split('|').slice(1, -1).map((c) => c.trim())
    if (cells.length !== 6 || !/^P\d+$/.test(cells[0])) continue
    const [id, name, who, wants, behaves, stuck] = cells
    personas.set(id, { id, name: name.replace(/\*/g, ''), who, wants, behaves, stuck })
  }
  return personas
}

const personas = readPersonas()
const problem = getProblem('two-sum')

/* Learner prompt: llm_judge/learner_prompts/learner_<version>.md. The text
   under "## Prompt" is the template; "## Scope rule: strict|volunteer"
   sections fill {{scope_rule}}, chosen by the "Volunteering personas:" line. */
const promptPath = resolve(repo, `llm_judge/learner_prompts/learner_${promptVersion}.md`)
const promptFile = readFileSync(promptPath, 'utf8')

function section(heading: string): string | null {
  const parts = promptFile.split(/^## /m)
  const hit = parts.find((p) => p.startsWith(`${heading}\n`))
  return hit ? hit.slice(heading.length + 1).trim() : null
}

const template = section('Prompt')
if (!template) throw new Error(`${promptPath} has no "## Prompt" section`)
const volunteers = new Set(
  (promptFile.match(/^Volunteering personas:(.*)$/m)?.[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean),
)

function learnerSystemPrompt(p: Persona) {
  const examples = problem.examples
    .map((e: { input: string; output: string }) => `- Input: ${e.input} → Output: ${e.output}`)
    .join('\n')
  const scopeRule = section(`Scope rule: ${volunteers.has(p.id) ? 'volunteer' : 'strict'}`) ?? ''
  const fields: Record<string, string> = {
    name: p.name, who: p.who, wants: p.wants, behaves: p.behaves, stuck: p.stuck,
    title: problem.title, statement: problem.statement, examples, scope_rule: scopeRule,
  }
  return template!
    .replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      if (!(key in fields)) throw new Error(`Unknown field {{${key}}} in ${promptPath}`)
      return fields[key]
    })
    .replace(/\n{3,}/g, '\n\n')
}

async function learnerReply(p: Persona, transcript: { role: 'tutor' | 'learner'; text: string }[]) {
  // The tutor is the "user" from the learner model's point of view.
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: learnerSystemPrompt(p) },
  ]
  for (const m of transcript) {
    const role = m.role === 'tutor' ? 'user' : 'assistant'
    const last = messages[messages.length - 1]
    if (last.role === role) last.content += `\n\n${m.text}`
    else messages.push({ role, content: m.text })
  }
  for (let attempt = 1; ; attempt++) {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, maxTokens: 600 }),
    })
    const body = await response.json() as { content?: string; error?: string }
    if (response.ok && body.content?.trim()) return body.content.trim()
    if (attempt >= 3) throw new Error(`Learner model failed: ${body.error ?? response.status}`)
    await new Promise((r) => setTimeout(r, 3000 * attempt))
  }
}

/* ---------------- Markdown export (same format as src/lib/exportLog.ts) ---------------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

function openingMessages(state: Any): string[] {
  const first = state.messages.findIndex((m: Any) => m.role === 'learner')
  return (first === -1 ? state.messages : state.messages.slice(0, first)).map((m: Any) => m.text)
}

function toMarkdown(exportedAt: string, state: Any, turns: Any[]) {
  const lines = [
    `# LeetUP session – ${state.problemId}`,
    '',
    `- Model: ${info.model}`,
    `- Code version: ${info.version}`,
    `- Exported: ${exportedAt}`,
    `- Final phase: ${state.phase}`,
    `- Approach: ${state.selectedApproach?.name ?? '—'}`,
    '',
    '---',
    '',
    ...openingMessages(state).map((text) => `**Tutor:** ${text}\n`),
  ]
  for (const t of turns) {
    lines.push(`## Turn ${t.turn}`, '', `**Learner:**`, '', t.learner, '')
    for (const text of t.tutor) lines.push(`**Tutor:**`, '', text, '')
    if (t.trace) {
      const tr = t.trace
      lines.push(
        '<details><summary>Tutor decision</summary>',
        '',
        `- Action: \`${tr.action}\`${tr.focusArea ? ` on ${tr.focusArea}` : ''}${tr.overrodeSuggestion ? ` (overrode \`${tr.suggestedAction}\`)` : ''}`,
        `- Reason: ${tr.reason}`,
        `- Intent / progress: ${tr.intent ?? '—'} / ${tr.progress ?? '—'}`,
        ...(tr.claims ?? []).map((c: Any) => `- Claim ${c.area} (${c.adequate ? 'adequate' : 'not adequate'}): "${c.quote}"`),
        ...(tr.missing ?? []).map((m: Any) => `- Missing ${m.area}: ${m.gap}`),
        ...(tr.contradictions ?? []).map((c: Any) => `- Contradiction ${c.area}: ${c.detail}`),
        ...(tr.dropped ?? []).map((d: string) => `- Dropped: ${d}`),
        ...(tr.recoveryReason ? [`- Recovery: ${tr.recoveryReason}`] : []),
        `- Checklist: ${t.checklist.map((c: Any) => `${c.area}=${c.status}`).join(', ')}`,
        '',
        '</details>',
        '',
      )
    }
  }
  return lines.join('\n')
}

/* ---------------- one conversation ---------------- */

async function runConversation(job: { id: string; persona: string }) {
  const persona = personas.get(job.persona)
  if (!persona) throw new Error(`Unknown persona ${job.persona}`)
  let state = startSession(createSession()).updatedState
  const transcript: { role: 'tutor' | 'learner'; text: string }[] =
    openingMessages(state).map((text) => ({ role: 'tutor' as const, text }))
  const turns: Any[] = []
  let recoveries = 0

  for (let n = 1; n <= maxTurns; n++) {
    const text = await learnerReply(persona, transcript)
    const result = await llmProvider.getNextResponse(state, text)
    if (result.trace?.action === 'recover') {
      // A model/network failure is not part of the tutoring; retry the same message.
      if (++recoveries > 3) throw new Error(`${job.id}: tutor model kept failing (${result.trace.recoveryReason})`)
      n--
      await new Promise((r) => setTimeout(r, 4000))
      continue
    }
    state = result.updatedState
    turns.push(logTurn(state, text, result.assistantMessages, result.trace))
    transcript.push({ role: 'learner', text })
    for (const m of result.assistantMessages) transcript.push({ role: 'tutor', text: m.text })
    console.log(`  ${job.id} ${job.persona} turn ${n}: ${result.trace?.action ?? '?'}${result.trace?.focusArea ? ` on ${result.trace.focusArea}` : ''}`)
    if (result.trace?.action === 'summarise' || state.phase === 'complete') break
  }

  const exportedAt = new Date().toISOString()
  const base = `${job.id}_${job.persona}_${info.version}`
  writeFileSync(resolve(outDir, `${base}.md`), toMarkdown(exportedAt, state, turns))
  writeFileSync(resolve(outDir, `${base}.json`), JSON.stringify({
    ...info, exportedAt, conversationId: job.id, persona: job.persona, learnerPrompt: promptVersion,
    problemId: state.problemId, finalPhase: state.phase, approach: state.selectedApproach,
    opening: openingMessages(state), turns, finalEvidence: state.evidence,
  }, null, 2))
  console.log(`${job.id} ${job.persona}: ${turns.length} turns, phase ${state.phase} → ${base}.md`)
}

/* ---------------- main ---------------- */

mkdirSync(outDir, { recursive: true })
console.log(`Running ${jobs.length} conversation(s) on ${info.version} (${info.model}), learner prompt ${promptVersion}, from ${root}`)
const queue = [...jobs]
let failed = 0
await Promise.all(Array.from({ length: Math.min(parallel, queue.length) }, async () => {
  for (let job = queue.shift(); job; job = queue.shift()) {
    try { await runConversation(job) } catch (error) {
      failed++
      console.error(`${job.id} ${job.persona} failed:`, error instanceof Error ? error.message : error)
    }
  }
}))
process.exit(failed ? 1 : 0)
