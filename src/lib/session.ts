import type {
  AreaEvidence,
  ChatMessage,
  ReasoningAreaId,
  SessionState,
  SupportLevel,
  TranscriptArea,
} from '../types'
import { defaultProblemId } from '../data/problemBank'
import {
  AREA_IDS,
  CORE_AREAS,
  GREETING,
  OPENING_QUESTION,
  REASONING_AREAS,
  getArea,
} from './reasoningAreas'

/* ------------------------------------------------------------------ *
 * Message helpers
 * ------------------------------------------------------------------ */

let messageCounter = 0

export const createMessage = (
  role: ChatMessage['role'],
  text: string,
  area: TranscriptArea,
  kind: ChatMessage['kind'] = 'question',
): ChatMessage => ({ id: `m${++messageCounter}`, role, text, area, kind })

/* ------------------------------------------------------------------ *
 * Session lifecycle
 * ------------------------------------------------------------------ */

const blankEvidence = (): AreaEvidence => ({
  status: 'unaddressed',
  support: null,
  quotes: [],
  gap: null,
  updatedAtTurn: 0,
})

const emptyRecord = <T>(make: () => T): Record<ReasoningAreaId, T> =>
  Object.fromEntries(AREA_IDS.map((id) => [id, make()])) as Record<
    ReasoningAreaId,
    T
  >

export function createSession(problemId = defaultProblemId): SessionState {
  return {
    problemId,
    started: false,
    phase: 'opening',
    focusArea: null,
    evidence: emptyRecord(blankEvidence),
    attention: emptyRecord(() => 0),
    assistance: emptyRecord(() => 0),
    selectedApproach: null,
    awaitingCheck: null,
    deferredAreas: [],
    turn: 0,
    learnerResponses: [],
    messages: [],
  }
}

/**
 * Opens the session with the learner's own approach, not a restatement of the
 * problem. Restatement and brute force are scaffolding, offered later only if
 * they would actually help.
 */
export function startSession(state: SessionState): {
  assistantMessages: ChatMessage[]
  updatedState: SessionState
} {
  const assistantMessages = [
    ...GREETING.map((t) => createMessage('assistant', t, 'opening', 'feedback')),
    createMessage('assistant', OPENING_QUESTION, 'approach'),
  ]
  return {
    assistantMessages,
    updatedState: {
      ...state,
      started: true,
      phase: 'exploring',
      focusArea: 'approach',
      // The opening question is the first rung of the approach ladder.
      attention: { ...state.attention, approach: 1 },
      messages: [...state.messages, ...assistantMessages],
    },
  }
}

/* ------------------------------------------------------------------ *
 * Evidence record
 * ------------------------------------------------------------------ */

/**
 * How the learner reached an area, from the support already spent on it:
 * 0 none, 1 light hint, 2 stronger hint, 3 guided explanation.
 */
export function supportLevelFor(assistance: number): SupportLevel {
  if (assistance >= 3) return 'after-guidance'
  if (assistance >= 1) return 'after-hints'
  return 'independent'
}

/**
 * Support never silently improves. An area that needed a walkthrough keeps
 * saying so even when the learner later explains it perfectly — that is the
 * difference between completing the activity and demonstrating independent
 * understanding, and the record has to be honest about which happened.
 */
function strongestSupport(
  existing: SupportLevel | null,
  incoming: SupportLevel,
): SupportLevel {
  const rank: Record<SupportLevel, number> = {
    independent: 0,
    'after-hints': 1,
    'after-guidance': 2,
  }
  if (!existing) return incoming
  return rank[existing] >= rank[incoming] ? existing : incoming
}

export interface EvidenceUpdate {
  area: ReasoningAreaId
  status: AreaEvidence['status']
  quote?: string
  gap?: string | null
  /** Allows a known support level when restoring a session. */
  support?: SupportLevel
}

export function applyEvidence(
  state: SessionState,
  updates: EvidenceUpdate[],
): SessionState {
  if (updates.length === 0) return state

  const evidence = { ...state.evidence }
  for (const update of updates) {
    const current = evidence[update.area]
    const derived =
      update.support ?? supportLevelFor(state.assistance[update.area])

    evidence[update.area] = {
      status: update.status,
      support:
        update.status === 'unaddressed'
          ? null
          : strongestSupport(current.support, derived),
      quotes:
        update.quote && !current.quotes.includes(update.quote)
          ? [...current.quotes, update.quote]
          : current.quotes,
      gap: update.gap === undefined ? current.gap : update.gap,
      updatedAtTurn: state.turn,
    }
  }
  return { ...state, evidence }
}

/* ------------------------------------------------------------------ *
 * Projections (read models)
 * ------------------------------------------------------------------ */

export type AreaDisplayStatus =
  | 'unaddressed'
  | 'focus'
  | 'partial'
  | 'independent'
  | 'supported'
  | 'revisit'

export interface ChecklistItem {
  id: ReasoningAreaId
  label: string
  goal: string
  status: AreaDisplayStatus
  necessity: 'core' | 'situational' | 'optional'
  support: SupportLevel | null
  gap: string | null
}

/** The right-hand panel: evidence of understanding, not a queue of questions. */
export function getChecklist(state: SessionState): ChecklistItem[] {
  return REASONING_AREAS.map((area) => {
    const record = state.evidence[area.id]
    let status: AreaDisplayStatus = 'unaddressed'

    if (record.status === 'revisit') status = 'revisit'
    else if (record.status === 'demonstrated')
      status = record.support === 'independent' ? 'independent' : 'supported'
    else if (record.status === 'partial') status = 'partial'

    // The focus marker only overrides states that are not yet settled.
    if (
      state.focusArea === area.id &&
      (status === 'unaddressed' || status === 'partial')
    )
      status = 'focus'

    return {
      id: area.id,
      label: area.label,
      goal: area.goal,
      status,
      necessity: area.necessity,
      support: record.support,
      gap: record.gap,
    }
  })
}

/** Core areas demonstrated, with nothing outstanding to revisit. */
export function isCoreComplete(state: SessionState): boolean {
  return CORE_AREAS.every(
    (id) => state.evidence[id].status === 'demonstrated',
  ) && AREA_IDS.every((id) => state.evidence[id].status !== 'revisit')
}

export function coreProgress(state: SessionState): {
  done: number
  total: number
} {
  return {
    done: CORE_AREAS.filter(
      (id) => state.evidence[id].status === 'demonstrated',
    ).length,
    total: CORE_AREAS.length,
  }
}

/** True when every demonstrated core area was reached without assistance. */
export function isFullyIndependent(state: SessionState): boolean {
  return CORE_AREAS.every(
    (id) =>
      state.evidence[id].status === 'demonstrated' &&
      state.evidence[id].support === 'independent',
  )
}

export function progressLabel(state: SessionState): string {
  if (!state.started) return 'Not started'
  if (state.phase === 'complete') return 'Core reasoning complete'
  if (state.phase === 'paused') return 'Paused — gaps outstanding'
  const { done, total } = coreProgress(state)
  const focus = state.focusArea ? getArea(state.focusArea).label : null
  return focus ? `${done}/${total} · ${focus}` : `${done}/${total} explained`
}
