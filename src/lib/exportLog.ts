/**
 * Session export for test logs: JSON for scripts and judges, Markdown for
 * reading. Each learner turn carries the tutor's assessment and decision, so a
 * log shows why the checklist moved, not only what was said.
 */
import { getChecklist } from './session'
import type { ChatMessage, SessionState, TurnTrace } from '../types'

export interface TurnLog {
  turn: number
  at: string
  learner: string
  tutor: string[]
  trace: TurnTrace | null
  /** Checklist after this turn. */
  checklist: { area: string; status: string; support: string | null }[]
  phase: SessionState['phase']
  approach: string | null
}

export function logTurn(
  state: SessionState,
  learner: string,
  replies: ChatMessage[],
  trace: TurnTrace | undefined,
): TurnLog {
  return {
    turn: state.turn,
    at: new Date().toISOString(),
    learner,
    tutor: replies.map((m) => m.text),
    trace: trace ?? null,
    checklist: getChecklist(state).map(({ id, status, support }) => ({ area: id, status, support })),
    phase: state.phase,
    approach: state.selectedApproach?.name ?? null,
  }
}

interface RunInfo {
  model: string
  version: string
}

async function runInfo(): Promise<RunInfo> {
  try {
    const body = await (await fetch('/api/status')).json() as Partial<RunInfo>
    return { model: body.model ?? 'unknown', version: body.version ?? 'unknown' }
  } catch {
    return { model: 'unknown', version: 'unknown' }
  }
}

/** Tutor messages shown before the learner's first reply. */
function openingMessages(state: SessionState) {
  const first = state.messages.findIndex((m) => m.role === 'learner')
  return (first === -1 ? state.messages : state.messages.slice(0, first)).map((m) => m.text)
}

function toMarkdown(info: RunInfo, exportedAt: string, state: SessionState, turns: TurnLog[]) {
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
        ...tr.claims.map((c) => `- Claim ${c.area} (${c.adequate ? 'adequate' : 'not adequate'}): "${c.quote}"`),
        ...tr.missing.map((m) => `- Missing ${m.area}: ${m.gap}`),
        ...tr.contradictions.map((c) => `- Contradiction ${c.area}: ${c.detail}`),
        ...tr.dropped.map((d) => `- Dropped: ${d}`),
        ...(tr.recoveryReason ? [`- Recovery: ${tr.recoveryReason}`] : []),
        `- Checklist: ${t.checklist.map((c) => `${c.area}=${c.status}`).join(', ')}`,
        '',
        '</details>',
        '',
      )
    }
  }
  return lines.join('\n')
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportSession(
  state: SessionState,
  turns: TurnLog[],
  format: 'json' | 'md',
) {
  const info = await runInfo()
  const exportedAt = new Date().toISOString()
  const stamp = exportedAt.slice(0, 19).replace(/[:T]/g, '-')
  const name = `leetup_${state.problemId}_${stamp}`
  if (format === 'md') {
    download(`${name}.md`, toMarkdown(info, exportedAt, state, turns), 'text/markdown')
    return
  }
  const data = {
    ...info,
    exportedAt,
    problemId: state.problemId,
    finalPhase: state.phase,
    approach: state.selectedApproach,
    opening: openingMessages(state),
    turns,
    finalEvidence: state.evidence,
  }
  download(`${name}.json`, JSON.stringify(data, null, 2), 'application/json')
}
