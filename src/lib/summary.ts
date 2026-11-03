import type { CuratedProblem, ReasoningAreaId, SessionState } from '../types'
import { CORE_AREAS, getArea } from './reasoningAreas'
import { isFullyIndependent } from './session'

/**
 * The closing summary, generated from what this learner actually did.
 *
 * Not a canned recap of the hash-map solution: it names the approach *they*
 * chose, reflects the areas they explained, and is explicit about which parts
 * needed help. A summary that flattered the transcript would defeat the point
 * of keeping an evidence record at all.
 */

const SUPPORT_PHRASE: Record<string, string> = {
  independent: 'you worked out yourself',
  'after-hints': 'you reached with a hint or two',
  'after-guidance': 'we walked through together',
}

function areaLine(
  state: SessionState,
  area: ReasoningAreaId,
): string | null {
  const record = state.evidence[area]
  if (record.status === 'unaddressed') return null

  const label = getArea(area).label
  if (record.status === 'demonstrated') {
    const how = SUPPORT_PHRASE[record.support ?? 'independent']
    const credited = record.creditedQuotes ?? []
    const proof = credited.length > 0 ? credited : record.quotes.slice(-1)
    const excerpts = proof.slice(-2).map((quote) => `"${truncate(quote, 90)}"`).join(' and ')
    return `• **${label}** — ${how}${excerpts ? `: ${excerpts}` : '.'}`
  }
  if (record.status === 'revisit')
    return `• **${label}** — still open${record.gap ? `: ${record.gap}` : '.'}`
  return `• **${label}** — partly covered${record.gap ? `: ${record.gap}` : '.'}`
}

/* Display order for all recorded evidence, including situational areas. */
const SUMMARY_ORDER: ReasoningAreaId[] = [
  'approach',
  'justification',
  'correctness',
  'complexity',
  'requirements',
  'comparison',
]

const truncate = (text: string, max = 110) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`

export function buildSummaryText(
  state: SessionState,
  _problem: CuratedProblem,
): string {
  const chosenName = state.selectedApproach?.name ?? null

  const lines: string[] = []

  lines.push(
    state.selectedApproach?.changedFrom
      ? `Here's what you explained, after moving from ${state.selectedApproach.changedFrom} to **${chosenName}**:`
      : "Here's what you explained:",
  )
  lines.push('')

  for (const area of SUMMARY_ORDER) {
    const line = areaLine(state, area)
    if (line) lines.push(line)
  }

  /* Honesty about how the activity was completed. This is one session's
     evidence, not a claim about what the learner can do next time. */
  const supported = SUMMARY_ORDER.filter(
    (id) =>
      state.evidence[id].status === 'demonstrated' &&
      state.evidence[id].support !== 'independent',
  ).map((id) => getArea(id).label)

  lines.push('')
  if (isFullyIndependent(state)) {
    lines.push(
      'You developed your own approach and used the questions to make your reasoning more explicit. The checklist records what you demonstrated in this session.',
    )
  } else if (supported.length > 0) {
    lines.push(
      `The checklist records where you needed help: ${supported.join(
        ', ',
      )}. Trying a similar problem with less support would help you check your understanding.`,
    )
  }

  return lines.join('\n')
}

/**
 * The review-or-pause offer.
 *
 * Reached when gaps remain but there is nothing useful left to ask — typically
 * after a guided explanation the learner could not apply. It is deliberately
 * not a summary: saying "well done, complete" over an unresolved record would
 * misreport what happened.
 */
export function buildReviewOfferText(
  state: SessionState,
  _problem: CuratedProblem,
): string {
  const open = CORE_AREAS.filter(
    (id) => state.evidence[id].status !== 'demonstrated',
  ).map((id) => getArea(id).label)

  const approach = state.selectedApproach?.name

  const lines = [
    `Let's pause there rather than go round the same question again.`,
    '',
    open.length > 0
      ? `Still open: **${open.join('**, **')}**. I have explained what I can for now, and re-asking would not help either of us.`
      : 'There are still gaps in the record, and re-asking would not help either of us.',
    '',
    'Three ways forward, your pick:',
    `• **Review** — I walk back through ${
      approach ? `${approach} ` : ''
    }from the top, slower, and you stop me wherever it stops making sense.`,
    '• **Come back to it** — take a break and pick this up later. Nothing is lost.',
    '• **Keep going** — if any of it has clicked since, explain it and I will pick the thread back up.',
  ]

  return lines.join('\n')
}
