import type { CuratedProblem, SessionState } from '../types'
import { matchApproach } from './reasoningAreas'
import { applyEvidence, isCoreComplete } from './session'
import { isApproachChange, type PolicyDecision } from './policy'

/**
 * The backend's half of a turn: what a policy decision does to the session.
 *
 * Runs before the turn is worded, so the generator is handed the state the
 * learner is about to be spoken to from — the new approach, the reasoning just
 * credited, the current focus. Everything that changes the learner's record
 * happens here, in one place, for both providers.
 */
export function applyDecision(
  state: SessionState,
  decision: PolicyDecision,
  problem: CuratedProblem,
): SessionState {
  let next = applyEvidence(state, decision.evidenceUpdates)

  /* Record or update the learner's chosen approach. An alias or a rephrasing
     of the same approach is not a change — `isApproachChange` resolves both
     through the curated families before deciding. */
  if (decision.approachName) {
    const matched = matchApproach(problem, decision.approachName)
    const previous = next.selectedApproach
    const changed = isApproachChange(
      problem,
      previous?.name ?? null,
      decision.approachName,
    )

    next = {
      ...next,
      selectedApproach: {
        name: matched?.name ?? decision.approachName,
        recognised: matched !== null,
        // The transcript keeps the whole history; this is the immediate
        // predecessor, for the summary to mention.
        changedFrom: changed
          ? (decision.approachChangedFrom ?? previous?.name ?? null)
          : (previous?.changedFrom ?? null),
        selectedAtTurn: changed ? next.turn : (previous?.selectedAtTurn ?? next.turn),
      },
    }
  }

  /* Restart the question ladder on areas invalidated by an approach change:
     the new approach deserves an open question, not a hint aimed at the old
     one. The assistance record is deliberately NOT reset — help already given
     stays on the record, so re-explained areas cannot come back as
     "independent". */
  if (decision.resetAttention.length > 0) {
    const attention = { ...next.attention }
    for (const area of decision.resetAttention) attention[area] = 0
    next = { ...next, attention }
  }

  /* Advance the question ladder, and record any support rung delivered.
     Both are per-area, so moving focus starts a fresh ladder while the record
     of help already given on the previous area is preserved. */
  if (decision.focusArea) {
    const area = decision.focusArea
    next = {
      ...next,
      attention: decision.bumpAttention
        ? { ...next.attention, [area]: next.attention[area] + 1 }
        : next.attention,
      assistance:
        decision.assistanceRung !== null
          ? {
              ...next.assistance,
              [area]: Math.max(next.assistance[area], decision.assistanceRung),
            }
          : next.assistance,
    }
  }

  /* Deferred areas: set aside after a failed understanding check, and cleared
     again the moment the learner does explain one. That is what lets a
     deferred idea be resolved later without the tutor having nagged. */
  const nowDemonstrated = decision.evidenceUpdates
    .filter((u) => u.status === 'demonstrated')
    .map((u) => u.area)

  let deferredAreas = next.deferredAreas.filter(
    (area) => !nowDemonstrated.includes(area),
  )
  if (decision.deferArea && !deferredAreas.includes(decision.deferArea))
    deferredAreas = [...deferredAreas, decision.deferArea]

  next = { ...next, deferredAreas }

  /* Phase. A session that was finished but is no longer — because the learner
     changed approach, or contradicted themselves — goes back to active rather
     than sitting on a completion it no longer has. */
  const phase: SessionState['phase'] = decision.complete
    ? 'complete'
    : decision.paused
      ? 'paused'
      : next.phase !== 'exploring' && !isCoreComplete(next)
        ? 'exploring'
        : next.phase

  return {
    ...next,
    focusArea: decision.focusArea,
    awaitingCheck: decision.awaitCheck ? decision.focusArea : null,
    phase,
  }
}
