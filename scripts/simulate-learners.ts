/**
 * Simulated learners for the LLM-judge test set.
 *
 * Runs LeetUP's real pipeline (getNextResponse in src/lib/llmProvider.ts) in
 * Node, with an LLM playing a persona from llm_judge/personas.md as the
 * learner. Both the tutor's and the learner's model calls go through the local
 * API server (`npm run dev`), so the API key stays on the server.
 *
 * Usage:
 *   npx tsx scripts/simulate-learners.ts --persona P1 --id C01 [--src <checkout>]
 *
 * --src points at another checkout (for example a git worktree of an earlier
 * commit); its src/ is imported instead of this one, so only the tutor version
 * differs between runs. Output: llm_judge/conversations/<id>_<persona>_<commit>.md
 * in the export format of src/lib/exportLog.ts.
 */
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = resolve(import.meta.dirname, '..')
const MAX_LEARNER_TURNS = 12
const MAX_RECOVERIES = 3

/* ---------------- arguments ---------------- */

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`)
  const value = i !== -1 ? process.argv[i + 1] : fallback
  if (value === undefined) {
    console.error(`Missing --${name}`)
    process.exit(1)
  }
  return value
}

const personaId = arg('persona').toUpperCase()
const convId = arg('id')
const srcRoot = resolve(arg('src', ROOT))
const baseUrl = arg('base', process.env.LEETUP_API_BASE ?? 'http://127.0.0.1:8787')
const promptVersion = arg('prompt', 'v2')
const outDir = resolve(arg('out', join(ROOT, 'llm_judge', 'conversations')))

/* chatCompletion() uses a relative fetch('/api/chat'), which only resolves in
   a browser. Prefix relative URLs with the local API base; nothing else in
   the tutor code changes. */
const nodeFetch = globalThis.fetch
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  nodeFetch(typeof input === 'string' && input.startsWith('/') ? baseUrl + input : input, init)
) as typeof fetch

/* ---------------- persona and learner prompt ---------------- */

interface Persona { id: string; name: string; who: string; wants: string; behaves: string; stuck: string }

function loadPersona(id: string): Persona {
  const md = readFileSync(join(ROOT, 'llm_judge', 'personas.md'), 'utf8')
  for (const line of md.split('\n')) {
    const cells = line.split('|').slice(1, -1).map((c) => c.trim().replace(/\*\*/g, ''))
    if (cells.length >= 6 && cells[0].toUpperCase() === id) {
      const [, name, who, wants, behaves, stuck] = cells
      return { id, name, who, wants, behaves, stuck }
    }
  }
  throw new Error(`Persona ${id} not found in llm_judge/personas.md`)
}

function learnerSystemPrompt(persona: Persona, problem: {
  title: string; statement: string; examples: { input: string; output: string }[]
}): string {
  const file = readFileSync(join(ROOT, 'llm_judge', 'learner_prompts', `learner_${promptVersion}.md`), 'utf8')
  const template = file.split(/^## Prompt\s*$/m)[1]
  if (!template) throw new Error(`learner_${promptVersion}.md has no "## Prompt" section`)
  const fields: Record<string, string> = {
    name: persona.name, who: persona.who, wants: persona.wants,
    behaves: persona.behaves, stuck: persona.stuck,
    title: problem.title, statement: problem.statement,
    examples: problem.examples.map((e, i) => `Example ${i + 1}: ${e.input} -> ${e.output}`).join('\n'),
  }
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => fields[key] ?? '').trim()
}

/* ---------------- run info ---------------- */

function codeVersion(dir: string): string {
  try {
    const commit = execSync('git rev-parse --short HEAD', { cwd: dir }).toString().trim()
    // Same rule as server/api.mjs: test outputs are not code changes.
    const dirty = execSync("git status --porcelain -- . ':!red_team' ':!llm_judge' ':!dev_logs' ':!ai_logs' ':!scripts/simulate-learners.ts' ':!scripts/judge.ts'", { cwd: dir }).toString().trim()
    return dirty ? `${commit}-dirty` : commit
  } catch {
    return 'unknown'
  }
}

async function apiModel(): Promise<string> {
  try {
    const body = await (await fetch('/api/status')).json() as { model?: string; configured?: boolean }
    if (body.configured === false) throw new Error('API server has no ANTHROPIC_API_KEY')
    return body.model ?? 'unknown'
  } catch (error) {
    console.error(`Cannot reach the local API at ${baseUrl}. Start it with \`npm run dev\`.`, error)
    process.exit(1)
  }
}

/* ---------------- main ---------------- */

const lib = (file: string) => import(pathToFileURL(join(srcRoot, 'src', file)).href)
const { llmProvider } = await lib('lib/llmProvider.ts')
const { createSession, startSession } = await lib('lib/session.ts')
const { chatCompletion } = await lib('lib/llmClient.ts')
const { logTurn } = await lib('lib/exportLog.ts')
const { getProblem } = await lib('data/problemBank.ts')

type Msg = { role: 'learner' | 'assistant'; text: string }
type Turn = ReturnType<typeof logTurn>

const persona = loadPersona(personaId)
const model = await apiModel()
const version = codeVersion(srcRoot)
let state = startSession(createSession()).updatedState
const problem = getProblem(state.problemId)
const system = learnerSystemPrompt(persona, problem)
const turns: Turn[] = []

/** The learner model sees the tutor as the other speaker; same-speaker runs are merged. */
function learnerView(messages: Msg[]) {
  const out: { role: 'user' | 'assistant'; content: string }[] = []
  for (const m of messages) {
    const role = m.role === 'learner' ? 'assistant' : 'user'
    const last = out[out.length - 1]
    if (last?.role === role) last.content += `\n\n${m.text}`
    else out.push({ role, content: m.text })
  }
  return out
}

/** Drop an unmatched trailing ``` the learner model sometimes leaves; real code blocks are kept. */
function tidyLearnerText(text: string): string {
  const fences = text.match(/^```/gm)?.length ?? 0
  return fences % 2 === 1 ? text.replace(/\n?```\s*$/, '').trim() : text.trim()
}

console.log(`${convId} ${persona.id} (${persona.name}) on ${version}, model ${model}`)
let learnerTurns = 0
let recoveries = 0
let pending: string | null = null
while (learnerTurns < MAX_LEARNER_TURNS) {
  const text: string = pending ?? tidyLearnerText(await chatCompletion(
    [{ role: 'system', content: system }, ...learnerView(state.messages)],
    { maxTokens: 600 },
  ))
  pending = null
  if (!text.trim()) throw new Error('Learner model returned an empty message')
  const result = await llmProvider.getNextResponse(state, text)
  turns.push(logTurn(result.updatedState, text, result.assistantMessages, result.trace))
  state = result.updatedState
  console.log(`  turn ${state.turn}: ${result.trace?.action ?? '?'}${result.trace?.focusArea ? ` on ${result.trace.focusArea}` : ''}`)

  if (result.trace?.action === 'recover') {
    // A learner in the app would resend the same message; this is not a learner turn.
    if (++recoveries > MAX_RECOVERIES) { console.error('  too many recoveries, stopping'); break }
    pending = text
    continue
  }
  learnerTurns++
  if (result.trace?.action === 'summarise' || state.phase === 'complete') break
}

/* ---------------- export (format of src/lib/exportLog.ts) ---------------- */

function toMarkdown(exportedAt: string): string {
  const firstLearner = state.messages.findIndex((m: Msg) => m.role === 'learner')
  const opening = (firstLearner === -1 ? state.messages : state.messages.slice(0, firstLearner)).map((m: Msg) => m.text)
  const lines = [
    `# LeetUP session – ${state.problemId}`,
    '',
    `- Model: ${model}`,
    `- Code version: ${version}`,
    `- Exported: ${exportedAt}`,
    `- Final phase: ${state.phase}`,
    `- Approach: ${state.selectedApproach?.name ?? '—'}`,
    '',
    '---',
    '',
    ...opening.map((text: string) => `**Tutor:** ${text}\n`),
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
        ...tr.claims.map((c: { area: string; adequate: boolean; quote: string }) => `- Claim ${c.area} (${c.adequate ? 'adequate' : 'not adequate'}): "${c.quote}"`),
        ...tr.missing.map((m: { area: string; gap: string }) => `- Missing ${m.area}: ${m.gap}`),
        ...tr.contradictions.map((c: { area: string; detail: string }) => `- Contradiction ${c.area}: ${c.detail}`),
        ...tr.dropped.map((d: string) => `- Dropped: ${d}`),
        ...(tr.recoveryReason ? [`- Recovery: ${tr.recoveryReason}`] : []),
        `- Checklist: ${t.checklist.map((c: { area: string; status: string }) => `${c.area}=${c.status}`).join(', ')}`,
        '',
        '</details>',
        '',
      )
    }
  }
  return lines.join('\n')
}

mkdirSync(outDir, { recursive: true })
const file = join(outDir, `${convId}_${persona.id}_${version}.md`)
writeFileSync(file, toMarkdown(new Date().toISOString()))
console.log(`  ${learnerTurns} learner turns, final phase ${state.phase} -> ${file}`)
