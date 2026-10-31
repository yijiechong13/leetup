import type { CuratedProblem, ReasoningAreaId, SessionState } from '../types'
import { CORE_AREAS, getArea, matchApproach } from './reasoningAreas'
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
  const quote = record.quotes[record.quotes.length - 1]

  if (record.status === 'demonstrated') {
    const how = SUPPORT_PHRASE[record.support ?? 'independent']
    return `• **${label}** — ${how}${quote ? `: "${truncate(quote)}"` : '.'}`
  }
  if (record.status === 'revisit')
    return `• **${label}** — still open${record.gap ? `: ${record.gap}` : '.'}`
  return `• **${label}** — partly covered${record.gap ? `: ${record.gap}` : '.'}`
}

/* Display order — every area that has anything on the record, core or not.
   Justification is not required to finish, but when a learner did explain it
   the summary says so. */
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
  problem: CuratedProblem,
): string {
  const chosenName = state.selectedApproach?.name ?? null
  const approach = matchApproach(problem, chosenName)

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

  if (approach) {
    lines.push('')
    lines.push(
      `For the record, ${approach.name} costs ${approach.timeComplexity} time and ${approach.spaceComplexity} extra space. ${approach.tradeoff}`,
    )
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
  problem: CuratedProblem,
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

  if (approach) {
    const matched = matchApproach(problem, approach)
    if (matched)
      lines.push(
        '',
        `For what it is worth, you did land on ${matched.name}, and that is a correct approach to this problem.`,
      )
  }

  return lines.join('\n')
}

/**
 * Reference implementation for the approach the learner actually chose.
 *
 * Returns null when there is no implementation for that approach — the caller
 * says so plainly rather than substituting a different approach's code.
 */
export function referenceFor(
  state: SessionState,
  problem: CuratedProblem,
): { name: string; code: string } | null {
  const approach = matchApproach(problem, state.selectedApproach?.name ?? null)
  if (!approach?.referenceSolution) return null
  return { name: approach.name, code: approach.referenceSolution }
}

export function referenceUnavailableMessage(
  state: SessionState,
  problem: CuratedProblem,
): string {
  const chosen = state.selectedApproach?.name ?? 'the approach you described'
  const approach = matchApproach(problem, state.selectedApproach?.name ?? null)

  if (approach && approach.correctness === 'incorrect')
    return `I do not have a reference implementation for ${chosen}, because there isn't a correct one — ${approach.correctnessNotes} I could show you an implementation of a different approach, but only if you want to switch to it deliberately rather than have me swap it in.`

  return `I do not have a reference implementation for ${chosen} in this problem's material. I would rather say that than hand you code for a different approach and let it look like yours. If you would like to see one of the curated approaches instead, say which.`
}
