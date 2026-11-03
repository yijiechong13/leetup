import type { CuratedProblem, SessionState } from '../types'
import { applyEvidence, isCoreComplete, supportLevelFor } from './session'
import { type PolicyDecision } from './policy'

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
  _problem: CuratedProblem,
): SessionState {
  /* Help on the previous turn shapes everything the learner says next, not
     only the area it was aimed at. A hint on correctness that spells out the
     no-reuse rule must not let that same sentence count as independent
     evidence for requirements. */
  const lastTutor = [...state.messages].reverse().find((m) => m.role === 'assistant')
  const helped = state.focusArea && (lastTutor?.kind === 'hint' || lastTutor?.kind === 'reveal')
    ? state.assistance[state.focusArea]
    : 0
  const updates = helped > 0
    ? decision.evidenceUpdates.map((u) => u.support || u.status === 'unaddressed'
      ? u
      : { ...u, support: supportLevelFor(Math.max(helped, state.assistance[u.area])) })
    : decision.evidenceUpdates

  let next = applyEvidence(state, updates)

  /* Record or update the learner's chosen approach. An alias or a rephrasing
     of the same approach is not a change. The assessment explicitly records
     a learner change separately from clarification of their existing steps. */
  if (decision.approachName) {
    const previous = next.selectedApproach
    const changed = Boolean(previous && decision.approachChangedFrom)

    next = {
      ...next,
      selectedApproach: {
        name: decision.approachName,
        description: decision.approachDescription ?? (changed ? undefined : previous?.description),
        // The transcript keeps the whole history; this is the immediate
        // predecessor, for the summary to mention.
        changedFrom: changed
          ? (decision.approachChangedFrom ?? previous?.name ?? null)
          : (previous?.changedFrom ?? null),
        selectedAtTurn: changed ? next.turn : (previous?.selectedAtTurn ?? next.turn),
      },
    }

    /* The approach is usually re-credited in the very turn it changes, so it is
       never marked for revisit; without this its evidence would still cite the
       old algorithm as support for the new one. */
    if (changed) {
      const fresh = updates
        .filter((u) => u.area === 'approach' && u.status === 'demonstrated' && u.quote)
        .map((u) => u.quote as string)
      const record = next.evidence.approach
      next = {
        ...next,
        evidence: { ...next.evidence, approach: { ...record, creditedQuotes: fresh } },
      }
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
