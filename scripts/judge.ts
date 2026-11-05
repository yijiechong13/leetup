/**
 * LLM judge for the test conversations in llm_judge/conversations/.
 *
 * One judge prompt per criterion, stored as versioned files:
 * llm_judge/judge_prompts/<criterion>_<version>.md. Each conversation is
 * judged separately; verdicts and a one-sentence reason are written to
 * llm_judge/judge_results/<criterion>_<version>.csv. Agreement with the human
 * labels in llm_judge/labels.csv (percentage agreement and Cohen's kappa) is
 * printed per criterion, with the disagreements listed.
 *
 * Model calls go through the local API server (`npm run dev`).
 *
 * Usage:
 *   npx tsx scripts/judge.ts                       # c1_v1 and c2_v1
 *   npx tsx scripts/judge.ts --criterion c1 --version v2
 *   npx tsx scripts/judge.ts --criterion c2 --version v5 --problem-context
 *   npx tsx scripts/judge.ts --score-only          # recompute agreement from saved results
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { problemBank } from '../src/data/problemBank'

const ROOT = resolve(import.meta.dirname, '..')
const DIR = join(ROOT, 'llm_judge')
const CONV_DIR = join(DIR, 'conversations')
const RESULTS_DIR = resolve(process.argv.includes('--results') ? process.argv[process.argv.indexOf('--results') + 1] : join(DIR, 'judge_results'))
const LABELS = join(DIR, 'labels.csv')

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 ? process.argv[i + 1] : undefined
}
const flag = (name: string) => process.argv.includes(`--${name}`)

const baseUrl = arg('base') ?? process.env.LEETUP_API_BASE ?? 'http://127.0.0.1:8787'
const version = arg('version') ?? 'v1'
const criteria = (arg('criterion') ?? 'c1,c2').toLowerCase().split(',')
const only = arg('only')?.split(',') // e.g. --only C03,C07
const scoreOnly = flag('score-only')
const includeProblem = flag('problem-context')
if (!scoreOnly && criteria.includes('c2') && ['v5', 'v6'].includes(version) && !includeProblem) {
  throw new Error('C2 v5 and v6 require --problem-context so the judge can tell a wrong answer from a correct one.')
}

/** C2 was narrowed in criteria_v3.md; v1–v4 are scored against the original C2 labels. */
function labelColumn(criterion: string): string {
  const C = criterion.toUpperCase()
  return C === 'C2' && ['v1', 'v2', 'v3', 'v4'].includes(version) ? 'C2_original_label' : `${C}_label`
}
const CONCURRENCY = 4

/* ---------------- CSV ---------------- */

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((c) => c !== '')) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell)
  if (row.some((c) => c !== '')) rows.push(row)
  const [header, ...body] = rows
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
const toCsv = (header: string[], rows: Record<string, string>[]) =>
  [header.join(','), ...rows.map((r) => header.map((h) => csvCell(r[h] ?? '')).join(','))].join('\n') + '\n'

/* ---------------- agreement ---------------- */

function normalise(v: string | undefined): 'PASS' | 'FAIL' | null {
  const u = (v ?? '').trim().toUpperCase()
  return u === 'PASS' || u === 'FAIL' ? u : null
}

function agreement(pairs: ['PASS' | 'FAIL', 'PASS' | 'FAIL'][]) {
  const n = pairs.length
  if (n === 0) return null
  const agree = pairs.filter(([h, j]) => h === j).length
  const po = agree / n
  const hPass = pairs.filter(([h]) => h === 'PASS').length / n
  const jPass = pairs.filter(([, j]) => j === 'PASS').length / n
  const pe = hPass * jPass + (1 - hPass) * (1 - jPass)
  const kappa = pe === 1 ? null : (po - pe) / (1 - pe)
  const count = (h: string, j: string) => pairs.filter(([a, b]) => a === h && b === j).length
  return {
    n, agree, po, pe, kappa,
    table: { pp: count('PASS', 'PASS'), pf: count('PASS', 'FAIL'), fp: count('FAIL', 'PASS'), ff: count('FAIL', 'FAIL') },
  }
}

function report(criterion: string, results: Record<string, string>[]) {
  const C = criterion.toUpperCase()
  const labels = existsSync(LABELS) ? parseCsv(readFileSync(LABELS, 'utf8')) : []
  const human = new Map(labels.map((r) => [r.conversation_id, normalise(r[labelColumn(criterion)])]))
  const pairs: ['PASS' | 'FAIL', 'PASS' | 'FAIL'][] = []
  const disagreements: string[] = []
  for (const r of results) {
    const h = human.get(r.conversation_id)
    const j = normalise(r.verdict)
    if (!h || !j) continue
    pairs.push([h, j])
    if (h !== j) disagreements.push(`    ${r.conversation_id}: you ${h}, judge ${j}: ${r.reason}`)
  }
  const unlabelled = results.length - pairs.length
  console.log(`\n${C} (${criterion}_${version}): ${results.length} judged, ${pairs.length} with your label${unlabelled ? `, ${unlabelled} skipped (no label or no verdict)` : ''}`)
  const a = agreement(pairs)
  if (!a) {
    console.log('  No labelled conversations yet: fill in labels.csv, then run with --score-only.')
    return
  }
  console.log(`  Agreement: ${a.agree}/${a.n} = ${(a.po * 100).toFixed(1)}%`)
  console.log(`  Cohen's kappa: ${a.kappa === null ? 'undefined (both raters gave one verdict throughout)' : a.kappa.toFixed(3)}  (p_o ${a.po.toFixed(3)}, p_e ${a.pe.toFixed(3)})`)
  console.log(`  You PASS / judge PASS ${a.table.pp}, you PASS / judge FAIL ${a.table.pf}, you FAIL / judge PASS ${a.table.fp}, you FAIL / judge FAIL ${a.table.ff}`)
  if (disagreements.length) console.log('  Disagreements:\n' + disagreements.join('\n'))
}

/* ---------------- judging ---------------- */

const nodeFetch = globalThis.fetch
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  nodeFetch(typeof input === 'string' && input.startsWith('/') ? baseUrl + input : input, init)
) as typeof fetch
const { chatCompletion, extractJson } = await import('../src/lib/llmClient')

function loadPrompt(criterion: string): string {
  const file = join(DIR, 'judge_prompts', `${criterion}_${version}.md`)
  const prompt = readFileSync(file, 'utf8').split(/^## Prompt\s*$/m)[1]
  if (!prompt) throw new Error(`${file} has no "## Prompt" section`)
  return prompt.trim()
}

/** Prompts may ask for analysis before the JSON; take the last object that has a verdict. */
function lastVerdictJson(raw: string): { verdict?: string; reason?: string } {
  for (let start = raw.lastIndexOf('{"verdict"'); start !== -1; start = raw.lastIndexOf('{"verdict"', start - 1)) {
    const end = raw.indexOf('}', start)
    try { return JSON.parse(raw.slice(start, end + 1)) } catch { /* try an earlier one */ }
  }
  const loose = [...raw.matchAll(/\{\s*"verdict"[\s\S]*?\}/g)].pop()?.[0]
  return extractJson(loose ?? raw)
}

/** Supply the problem statement separately from the reusable criterion; no solution guidance. */
function buildJudgeInput(transcript: string): string {
  const conversation = `<conversation>\n${transcript}\n</conversation>`
  if (!includeProblem) return conversation
  const problemId = transcript.match(/^# LeetUP session\s*[–—-]\s*(\S+)/m)?.[1]
  const problem = problemBank.find((entry) => entry.id === problemId)
  if (!problem) throw new Error(`Cannot supply problem context: unknown transcript problem ${problemId ?? '(missing)'}`)
  return [
    '<problem>',
    problem.title,
    problem.statement,
    'Constraints:',
    ...problem.constraints.map((constraint) => `- ${constraint}`),
    problem.followUp ? `Optional follow-up (not required for completion): ${problem.followUp}` : '',
    '</problem>',
    conversation,
  ].filter(Boolean).join('\n')
}

async function judgeOne(system: string, transcript: string) {
  const input = buildJudgeInput(transcript)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const raw = await chatCompletion(
        [{ role: 'system', content: system }, { role: 'user', content: input }],
        { maxTokens: 6000 },
      )
      const out = lastVerdictJson(raw)
      const verdict = normalise(out.verdict)
      if (verdict) return { verdict, reason: (out.reason ?? '').replace(/\s+/g, ' ').trim(), raw }
      throw new Error(`No PASS/FAIL verdict in: ${raw.slice(0, 200)}`)
    } catch (error) {
      if (attempt === 3) return { verdict: 'ERROR', reason: String(error instanceof Error ? error.message : error), raw: '' }
    }
  }
  throw new Error('unreachable')
}

async function pool<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]) }
  }))
  return out
}

const files = readdirSync(CONV_DIR)
  .filter((f) => /^C\d+_.*\.md$/.test(f))
  .filter((f) => !only || only.includes(f.split('_')[0]))
  .sort()

mkdirSync(RESULTS_DIR, { recursive: true })
const HEADER = ['conversation_id', 'file', 'verdict', 'reason']

for (const criterion of criteria) {
  const out = join(RESULTS_DIR, `${criterion}_${version}.csv`)
  let results: Record<string, string>[]
  if (scoreOnly) {
    if (!existsSync(out)) { console.log(`\n${out} not found; run the judge first.`); continue }
    results = parseCsv(readFileSync(out, 'utf8'))
  } else {
    const system = loadPrompt(criterion)
    console.log(`Judging ${files.length} conversations on ${criterion}_${version}…`)
    results = await pool(files, async (file) => {
      const { raw, ...r } = await judgeOne(system, readFileSync(join(CONV_DIR, file), 'utf8'))
      const id = file.split('_')[0]
      // Full judge reply (per-turn analysis plus JSON), for checking how a verdict was reached.
      const rawDir = join(RESULTS_DIR, 'raw', `${criterion}_${version}`)
      mkdirSync(rawDir, { recursive: true })
      writeFileSync(join(rawDir, `${id}.md`), raw)
      console.log(`  ${id} ${r.verdict}`)
      return { conversation_id: id, file, ...r }
    })
    // With --only, keep earlier verdicts for the other conversations.
    if (only && existsSync(out)) {
      const fresh = new Set(results.map((r) => r.conversation_id))
      results = [...parseCsv(readFileSync(out, 'utf8')).filter((r) => !fresh.has(r.conversation_id)), ...results]
        .sort((a, b) => a.conversation_id.localeCompare(b.conversation_id))
    }
    writeFileSync(out, toCsv(HEADER, results))
    console.log(`  -> ${out}`)
  }
  report(criterion, results)
}
