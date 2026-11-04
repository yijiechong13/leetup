/**
 * Builds llm_judge/results.html: judge–human agreement, pass rates and
 * per-conversation verdicts, from llm_judge/labels.csv and the saved verdicts
 * in llm_judge/judge_results/. Reads files only; never calls the judge.
 *
 * Usage: npx tsx scripts/build-results-page.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const DIR = join(ROOT, 'llm_judge')
const OUT = join(DIR, 'results.html')

const RUNS: { criterion: 'C1' | 'C2'; version: string; final: boolean }[] = [
  { criterion: 'C1', version: 'v2', final: false },
  { criterion: 'C1', version: 'v3', final: true },
  { criterion: 'C2', version: 'v2', final: false },
  { criterion: 'C2', version: 'v3', final: false },
  { criterion: 'C2', version: 'v4', final: true },
]
const FINAL = { C1: 'v3', C2: 'v4' } as const

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ } else if (ch === '"') quoted = false
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

const norm = (v: string | undefined) => {
  const u = (v ?? '').trim().toUpperCase()
  return u === 'PASS' || u === 'FAIL' ? u : ''
}

const labels = parseCsv(readFileSync(join(DIR, 'labels.csv'), 'utf8'))
const verdicts = (criterion: string, version: string) => new Map(
  parseCsv(readFileSync(join(DIR, 'judge_results', `${criterion.toLowerCase()}_${version}.csv`), 'utf8'))
    .map((r) => [r.conversation_id, norm(r.verdict)]),
)

/* Same formulas as scripts/judge.ts. */
function agreement(criterion: 'C1' | 'C2', version: string) {
  const judge = verdicts(criterion, version)
  const pairs = labels
    .map((l) => [norm(l[`${criterion}_label`]), judge.get(l.conversation_id) ?? ''] as const)
    .filter(([h, j]) => h && j)
  const n = pairs.length
  const count = (h: string, j: string) => pairs.filter(([a, b]) => a === h && b === j).length
  const pp = count('PASS', 'PASS'), pf = count('PASS', 'FAIL'), fp = count('FAIL', 'PASS'), ff = count('FAIL', 'FAIL')
  const po = (pp + ff) / n
  const hPass = (pp + pf) / n, jPass = (pp + fp) / n
  const pe = hPass * jPass + (1 - hPass) * (1 - jPass)
  const kappa = pe === 1 ? null : (po - pe) / (1 - pe)
  return { n, agree: pp + ff, po, kappa, pp, pf, fp, ff }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const pct = (x: number) => `${(x * 100).toFixed(1)}%`
const kappaText = (k: number | null) => (k === null ? 'undefined' : k.toFixed(3).replace('-', '−'))
const verdict = (v: string) => `<span class="v v-${v.toLowerCase() || 'none'}">${v || '—'}</span>`

/* 1. Agreement */
const agreementRows = RUNS.map(({ criterion, version, final }) => {
  const a = agreement(criterion, version)
  return `<tr class="${final ? 'final' : ''}">
    <td>${criterion}</td><td>${version}${final ? ' <span class="tag">final</span>' : ''}</td>
    <td class="num">${a.agree}/${a.n} = ${pct(a.po)}</td><td class="num">${kappaText(a.kappa)}</td>
    <td class="num">${a.pp}</td><td class="num">${a.pf}</td><td class="num">${a.fp}</td><td class="num">${a.ff}</td>
  </tr>`
}).join('')

/* 2. Pass rates, final system */
const finalSystem = labels.filter((l) => {
  const n = Number(l.conversation_id.replace(/\D/g, ''))
  return n >= 1 && n <= 15
})
const passRow = (criterion: 'C1' | 'C2') => {
  const pass = finalSystem.filter((l) => norm(l[`${criterion}_label`]) === 'PASS').length
  const fail = finalSystem.filter((l) => norm(l[`${criterion}_label`]) === 'FAIL').length
  const total = finalSystem.length
  return `<tr><td>${criterion}</td><td class="num">${pass}</td><td class="num">${fail}</td><td class="num">${pass}/${total} = ${pct(pass / total)}</td></tr>`
}

/* 3. Per conversation */
const j1 = verdicts('C1', FINAL.C1)
const j2 = verdicts('C2', FINAL.C2)
let disagreeCount = 0
const convRows = labels.map((l) => {
  const h1 = norm(l.C1_label), h2 = norm(l.C2_label)
  const v1 = j1.get(l.conversation_id) ?? '', v2 = j2.get(l.conversation_id) ?? ''
  const d1 = h1 && v1 && h1 !== v1, d2 = h2 && v2 && h2 !== v2
  disagreeCount += Number(Boolean(d1)) + Number(Boolean(d2))
  const version = l.planned_as === 'final system' ? `${esc(l.code_version)}` : `${esc(l.code_version)} <span class="sub">(${esc(l.planned_as)})</span>`
  return `<tr>
    <td><b>${esc(l.conversation_id)}</b></td><td>${esc(l.persona)}</td><td>${version}</td>
    <td class="${d1 ? 'dis' : ''}">${verdict(h1)}</td><td class="${d1 ? 'dis' : ''}">${verdict(v1)}</td>
    <td class="${d2 ? 'dis' : ''}">${verdict(h2)}</td><td class="${d2 ? 'dis' : ''}">${verdict(v2)}</td>
  </tr>`
}).join('')

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LLM Judge Results</title>
<style>
:root { --ink: #1c1c1a; --muted: #6a6964; --line: #d9d7d0; --head: #f3f2ee; --final: #eef3ff; --final-edge: #3b5bdb;
  --pass: #1f6b3a; --pass-bg: #e6f4ea; --fail: #a8321c; --fail-bg: #fbe9e5; --dis: #fff1c9; --dis-edge: #d39e00; }
* { box-sizing: border-box; }
html, body { background: #ffffff; color: var(--ink); }
body { margin: 0; font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
main { max-width: 880px; margin: 0 auto; padding: 28px 16px 48px; }
h1 { font-size: 22px; margin: 0 0 4px; }
.lede { color: var(--muted); margin: 0 0 24px; }
h2 { font-size: 16px; margin: 28px 0 4px; }
.cap { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
th, td { border: 1px solid var(--line); padding: 6px 10px; text-align: left; vertical-align: middle; }
th { background: var(--head); font-weight: 600; font-size: 13px; }
td.num, th.num { text-align: right; white-space: nowrap; }
tr.final td { background: var(--final); font-weight: 600; }
tr.final td:first-child { box-shadow: inset 3px 0 var(--final-edge); }
.tag { display: inline-block; font-size: 11px; font-weight: 600; color: var(--final-edge); border: 1px solid var(--final-edge); border-radius: 3px; padding: 0 4px; margin-left: 4px; vertical-align: 1px; }
.v { display: inline-block; min-width: 40px; text-align: center; font-size: 12px; font-weight: 600; border-radius: 3px; padding: 1px 6px; }
.v-pass { color: var(--pass); background: var(--pass-bg); }
.v-fail { color: var(--fail); background: var(--fail-bg); }
td.dis { background: var(--dis); box-shadow: inset 0 0 0 2px var(--dis-edge); }
.sub { color: var(--muted); font-size: 12px; }
.key { display: inline-block; width: 12px; height: 12px; background: var(--dis); box-shadow: inset 0 0 0 2px var(--dis-edge); vertical-align: -1px; margin-right: 4px; }
.note { margin-top: 28px; padding: 10px 14px; border-left: 3px solid var(--line); color: var(--muted); font-size: 13px; }
.note p { margin: 4px 0; }
code { font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
</style>
</head>
<body>
<main>
<h1>LLM judge results</h1>
<p class="lede">20 simulated conversations, labelled by hand and judged per criterion (C1: credit matches the learner's own reasoning; C2: help matches the learner's difficulty).</p>

<h2>1. Judge–human agreement</h2>
<p class="cap">Agreement and Cohen's kappa against my labels, all 20 conversations. Final prompt versions highlighted.</p>
<div class="scroll"><table>
  <thead><tr><th>Criterion</th><th>Judge prompt</th><th class="num">Agreement</th><th class="num">Cohen's κ</th>
    <th class="num">You PASS /<br>judge PASS</th><th class="num">You PASS /<br>judge FAIL</th><th class="num">You FAIL /<br>judge PASS</th><th class="num">You FAIL /<br>judge FAIL</th></tr></thead>
  <tbody>${agreementRows}</tbody>
</table></div>

<h2>2. Pass rates, final system</h2>
<p class="cap">My labels for the ${finalSystem.length} conversations with the final system (C01–C15, commit ${esc(finalSystem[0]?.code_version ?? '')}).</p>
<div class="scroll"><table>
  <thead><tr><th>Criterion</th><th class="num">PASS</th><th class="num">FAIL</th><th class="num">Pass rate</th></tr></thead>
  <tbody>${passRow('C1')}${passRow('C2')}</tbody>
</table></div>

<h2>3. Per-conversation verdicts</h2>
<p class="cap">My labels against the final judge prompts (C1 ${FINAL.C1}, C2 ${FINAL.C2}). <span class="key"></span>Disagreement (${disagreeCount} in total).</p>
<div class="scroll"><table>
  <thead><tr><th>ID</th><th>Persona</th><th>Version</th><th>My C1</th><th>Judge C1 (${FINAL.C1})</th><th>My C2</th><th>Judge C2 (${FINAL.C2})</th></tr></thead>
  <tbody>${convRows}</tbody>
</table></div>

<div class="note">
  <p>One C2 label (C09) was corrected after the v4 run; see <code>llm_judge/label_changes.md</code>. Agreement uses the corrected labels.</p>
</div>
</main>
</body>
</html>
`
writeFileSync(OUT, html)
console.log(`-> ${OUT}`)
for (const { criterion, version } of RUNS) {
  const a = agreement(criterion, version)
  console.log(`${criterion} ${version}: ${a.agree}/${a.n} = ${pct(a.po)}, kappa ${kappaText(a.kappa)}, ${a.pp}/${a.pf}/${a.fp}/${a.ff}`)
}
console.log(`final-system pass rates: ${['C1', 'C2'].map((c) => `${c} ${finalSystem.filter((l) => norm(l[`${c}_label`]) === 'PASS').length}/${finalSystem.length}`).join(', ')}; disagreements shown: ${disagreeCount}`)
