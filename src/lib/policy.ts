import type {
  CuratedProblem,
  ReasoningAreaId,
  SessionState,
} from '../types'
import { AREA_IDS, CORE_AREAS, getArea } from './reasoningAreas'
import { isCoreComplete, type EvidenceUpdate } from './session'

/**
 * The backend policy controller.
 *
 * LeetUP's split: **the model interprets, the controller decides.** The model
 * reads the learner's natural language and reports what it found, with the
 * learner's own words as supporting evidence. Everything that follows — which
 * gap to ask about, how much help to give, whether the activity is complete,
 * what the record says about how the learner got there — is decided here,
 * deterministically, from session state.
 *
 * Nothing in this file calls the network. It is pure and synchronous so the
 * learning policy can be read, reasoned about and tested on its own.
 */

/* ------------------------------------------------------------------ *
 * The model's report
 * ------------------------------------------------------------------ */

export type LearnerIntent =
  | 'propose_approach'
  | 'explain_reasoning'
  | 'answer_question'
  | 'ask_question'
  | 'request_help'
  | 'request_answer'
  | 'meta'
  | 'unclear'

export type TutorAction =
  /** Open, learner-led question on a new focus area. */
  | 'ask_open'
  /** Narrower question in the same area. */
  | 'ask_focused'
  /** The report was uncertain, or the approach is unfamiliar: ask, don't judge. */
  | 'clarify'
  /** A later response contradicts earlier evidence. */
  | 'repair'
  | 'light_hint'
  | 'stronger_hint'
  /** The support ceiling: explain the idea plainly. */
  | 'guided_explanation'
  /** After a guided explanation: invite the learner to apply it. */
  | 'check_understanding'
  /** Optional: contrast with another approach family. */
  | 'compare'
  /** Core activity complete: summarise from the record. */
  | 'summarise'
  /** Nothing useful left to ask, but gaps remain: offer review or a pause. */
  | 'offer_review'
  /** Post-completion: hand over the reference implementation, if one exists. */
  | 'offer_reference'
  /** Model output was unusable. Costs the learner nothing. */
  | 'recover'

export interface DemonstratedClaim {
  area: ReasoningAreaId
  /** Verbatim learner text. Checked against the real message before it counts. */
  quote: string
  adequate: boolean
  confidence: number
}

export interface Assessment {
  intent: LearnerIntent
  approach: {
    name: string | null
    changedFrom: string | null
    /** The model could not place this approach: ask for a worked example. */
    unfamiliar: boolean
    description?: string
  }
  /** Is the learner contributing useful reasoning or actually stuck? */
  progress?: 'progress' | 'stuck' | 'uncertain'
  demonstrated: DemonstratedClaim[]
  missing: { area: ReasoningAreaId; gap: string }[]
  contradictions: { area: ReasoningAreaId; detail: string; quote: string }[]
  needsClarification: boolean
  clarificationReason: string | null
  suggestedFocus: ReasoningAreaId | null
  suggestedAction: TutorAction
}

export interface PolicyDecision {
  action: TutorAction
  focusArea: ReasoningAreaId | null
  /** Applied to the evidence record before the turn is worded. */
  evidenceUpdates: EvidenceUpdate[]
  /** The approach to record, when the learner named or changed one. */
  approachDescription?: string
  approachName: string | null
  approachChangedFrom: string | null
  /** Advance the question ladder on the focus area. */
  bumpAttention: boolean
  /**
   * Support rung delivered this turn (1 light, 2 stronger, 3 guided), or null
   * when the turn gave no assistance. Recorded per area and never cleared.
   */
  assistanceRung: number | null
  /** Set when a guided explanation was just given and must be applied back. */
  awaitCheck: boolean
  /** Area to set aside after a failed understanding check. */
  deferArea: ReasoningAreaId | null
  /** Areas whose question ladder restarts (a new approach needs fresh questions). */
  resetAttention: ReasoningAreaId[]
  complete: boolean
  /** Nothing useful left to ask, but the core reasoning is not complete. */
  paused: boolean
  /** True when the model's suggestedAction was not permitted. */
  overrodeSuggestion: boolean
  reason: string
}

/* ------------------------------------------------------------------ *
 * Validating the model's report
 * ------------------------------------------------------------------ */

const INTENTS: LearnerIntent[] = [
  'propose_approach',
  'explain_reasoning',
  'answer_question',
  'ask_question',
  'request_help',
  'request_answer',
  'meta',
  'unclear',
]

const ACTIONS: TutorAction[] = [
  'ask_open',
  'ask_focused',
  'clarify',
  'repair',
  'light_hint',
  'stronger_hint',
  'guided_explanation',
  'check_understanding',
  'compare',
  'summarise',
  'offer_review',
  'offer_reference',
  'recover',
]

const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9^()+\-*/ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Causal language — the difference between naming a thing and justifying it. */
const CAUSAL =
  /\b(because|since|so that|so it|so we|so you|in order to|that way|which lets|which means|which avoids|lets us|means we|avoids|otherwise|due to|thanks to)\b/

/**
 * Is this quote real, and does it actually support the area claimed?
 *
 * Two checks the model does not get to skip:
 *
 * 1. The quote must appear in the learner's message. A model that paraphrases
 *    or invents supporting text is reporting on something that did not happen.
 * 2. For `approach` and `justification`, a bare noun phrase is not evidence.
 *    "Use a hash map" names a data structure; it does not explain how the
 *    approach runs or why it is the right choice. Those areas need either some
 *    substance or explicit causal language.
 */
export function quoteSupports(
  area: ReasoningAreaId,
  quote: string,
  learnerText: string,
): boolean {
  // Code punctuation is meaningful: do not validate an invented operator
  // by stripping it. Quotes must be actual substrings, allowing line endings
  // and typographic variants: a model quoting "That's" for a learner's
  // "That’s" is quoting faithfully, and dropping it loses real evidence.
  const literal = (text: string) =>
    text
      .replace(/\r\n/g, '\n')
      .replace(/[‘’ʼ′]/g, "'")
      .replace(/[“”″]/g, '"')
      .replace(/[−–—]/g, '-')
      .replace(/×/g, 'x')
      .replace(/ /g, ' ')
      .trim()
  if (!literal(learnerText).includes(literal(quote))) return false
  const q = normalise(quote)
  if (q.length < 3) return false
  if (!normalise(learnerText).includes(q)) return false

  if (area === 'correctness' && /\b(guaranteed?|promise|only one (answer|solution))\b/i.test(q) &&
      !/\b(index|indices|different|distinct|pair|lookup|check|return)\b/i.test(q)) {
    return false
  }

  if (area === 'approach' || area === 'justification') {
    const words = q.split(' ').filter(Boolean).length
    // This only admits code as evidence; the model still judges adequacy.
    const codeStructure = /\b(for|while|if|return)\b|[\w\]]\s*(?:\[[^\]]+\]\s*)?=(?!=)|\w+\s*\([^)]*\)/.test(quote)
    const conciseReason = area === 'justification' &&
      /\b(lookup|look up|scan|search|access|store|storage|memory|pair|pairs|avoids?)\b/.test(q) && words >= 3
    return words >= 8 || CAUSAL.test(q) || conciseReason || (area === 'approach' && codeStructure)
  }
  return true
}

export type ValidationResult =
  | { ok: true; assessment: Assessment; dropped: string[] }
  | { ok: false; reason: string }

/**
 * Structural validation of the model's report, plus evidence checking.
 *
 * A report that cannot be validated is a *model* failure, never a learner
 * failure: the caller recovers without touching the evidence record or the
 * support ladder.
 */
export function validateAssessment(
  raw: unknown,
  learnerText: string,
): ValidationResult {
  if (!raw || typeof raw !== 'object')
    return { ok: false, reason: 'assessment was not an object' }

  const value = raw as Record<string, unknown>
  const dropped: string[] = []

  const asArea = (v: unknown): ReasoningAreaId | null =>
    typeof v === 'string' && (AREA_IDS as string[]).includes(v)
      ? (v as ReasoningAreaId)
      : null

  const approachRaw = (value.approach ?? {}) as Record<string, unknown>

  const demonstrated: DemonstratedClaim[] = []
  if (Array.isArray(value.demonstrated)) {
    for (const entry of value.demonstrated) {
      const item = (entry ?? {}) as Record<string, unknown>
      const area = asArea(item.area)
      const quote = typeof item.quote === 'string' ? item.quote : ''
      if (!area) {
        dropped.push('claim with an unknown area')
        continue
      }
      if (!quoteSupports(area, quote, learnerText)) {
        // Either the quote is not in the learner's message, or it is too thin
        // to support this area. Not evidence.
        dropped.push(`${area}: unsupported quote`)
        continue
      }
      demonstrated.push({
        area,
        quote: quote.trim(),
        adequate: item.adequate !== false,
        confidence:
          typeof item.confidence === 'number' && Number.isFinite(item.confidence)
            ? Math.min(1, Math.max(0, item.confidence))
            : 0,
      })
    }
  }

  const missing = Array.isArray(value.missing)
    ? value.missing
        .map((entry) => {
          const item = (entry ?? {}) as Record<string, unknown>
          const area = asArea(item.area)
          return area
            ? { area, gap: typeof item.gap === 'string' ? item.gap : '' }
            : null
        })
        .filter((v): v is { area: ReasoningAreaId; gap: string } => v !== null)
    : []

  const contradictions = Array.isArray(value.contradictions)
    ? value.contradictions
        .map((entry) => {
          const item = (entry ?? {}) as Record<string, unknown>
          const area = asArea(item.area)
          return area
            ? {
                area,
                detail: typeof item.detail === 'string' ? item.detail : '',
                quote: typeof item.quote === 'string' ? item.quote : '',
              }
            : null
        })
        .filter(
          (v): v is { area: ReasoningAreaId; detail: string; quote: string } =>
            v !== null,
        )
    : []

  return {
    ok: true,
    dropped,
    assessment: {
      intent: INTENTS.includes(value.intent as LearnerIntent)
        ? (value.intent as LearnerIntent)
        : 'unclear',
      approach: {
        name:
          typeof approachRaw.name === 'string' && approachRaw.name.trim()
            ? approachRaw.name.trim()
            : null,
        changedFrom:
          typeof approachRaw.changedFrom === 'string' &&
          approachRaw.changedFrom.trim()
            ? approachRaw.changedFrom.trim()
            : null,
        unfamiliar: approachRaw.unfamiliar === true,
        description: typeof approachRaw.description === 'string' ? approachRaw.description : undefined,
      },
      progress: value.progress === 'stuck' || value.progress === 'uncertain' ? value.progress : 'progress',
      demonstrated,
      missing,
      contradictions,
      needsClarification: value.needsClarification === true,
      clarificationReason:
        typeof value.clarificationReason === 'string'
          ? value.clarificationReason
          : null,
      suggestedFocus: asArea(value.suggestedFocus),
      suggestedAction: ACTIONS.includes(value.suggestedAction as TutorAction)
        ? (value.suggestedAction as TutorAction)
        : 'ask_open',
    },
  }
}

/* ------------------------------------------------------------------ *
 * Choosing what to ask about
 * ------------------------------------------------------------------ */

/**
 * Priority among unresolved areas.
 *
 * Deliberately not a fixed syllabus order: `requirements` and `comparison` are
 * only reachable when something makes them relevant, so a learner who arrives
 * with a justified approach is never marched through a restatement or a
 * compulsory brute force.
 */
const FOCUS_PRIORITY: ReasoningAreaId[] = [
  'approach',
  'justification',
  'correctness',
  'complexity',
]

function isResolved(state: SessionState, area: ReasoningAreaId): boolean {
  return state.evidence[area].status === 'demonstrated'
}

/**
 * The next thing worth asking about, or null when the core activity is done.
 *
 * `relevant` carries areas the assessment has made relevant this turn — a
 * missing requirement, or a comparison the learner's own reasoning invites.
 */
export function selectFocus(
  state: SessionState,
  relevant: Set<ReasoningAreaId> = new Set(),
  exclude: ReasoningAreaId[] = [],
): ReasoningAreaId | null {
  const available = (id: ReasoningAreaId) =>
    !exclude.includes(id) && !isResolved(state, id)

  // 1. Anything contradicted or invalidated comes first: the record is wrong
  //    until it is fixed.
  const contradicted = AREA_IDS.find(
    (id) => state.evidence[id].status === 'revisit' && !exclude.includes(id),
  )
  if (contradicted) return contradicted

  // 2. A situational area only enters the conversation when made relevant.
  if (relevant.has('requirements') && available('requirements'))
    return 'requirements'

  // 3. The core areas, in an order that follows the learner's own approach.
  const core = FOCUS_PRIORITY.find(available)
  if (core) return core

  // 4. Optional comparison, only if something made it relevant.
  if (relevant.has('comparison') && available('comparison')) return 'comparison'

  return null
}

/* ------------------------------------------------------------------ *
 * Approach changes
 * ------------------------------------------------------------------ */

/**
 * Areas whose evidence is *about a particular approach*. Explaining how a hash
 * map avoids rescanning says nothing about how a sort-and-two-pointer scan
 * works, so this evidence cannot follow the learner to a new approach.
 */
const APPROACH_DEPENDENT: ReasoningAreaId[] = [
  'approach',
  'justification',
  'correctness',
  'complexity',
  'comparison',
]

/**
 * `requirements` is about the problem, not the solution — what must be
 * returned, what may not be reused. That transfers across any approach.
 */
export function isApproachDependent(area: ReasoningAreaId): boolean {
  return APPROACH_DEPENDENT.includes(area)
}

/**
 * Did the learner actually change approach, or just rename the one they had?
 *
 * Resolved through the curated families first, so "dictionary", "hash map" and
 * "one pass with a map" are one approach, not three.
 */
/* ------------------------------------------------------------------ *
 * The decision
 * ------------------------------------------------------------------ */

/**
 * The bounded support ladder: one light hint, one stronger hint, then a guided
 * explanation. `assistance` is what has already been given for this area, so
 * the next rung is always one step up and never repeats or skips.
 */
export function supportRung(assistance: number): {
  action: TutorAction
  rung: number
} {
  const rung = Math.min(assistance + 1, 3)
  const action: TutorAction =
    rung === 1 ? 'light_hint' : rung === 2 ? 'stronger_hint' : 'guided_explanation'
  return { action, rung }
}

/**
 * What to do about an area that is still unresolved after an attempt.
 *
 * Questions come before help: an open question, then a narrower one, and only
 * then the support ladder. That ordering is why the tutor does not name a data
 * structure or hand over a complexity the moment a learner hesitates.
 */
export function ladderStep(
  attention: number,
  assistance: number,
): { action: TutorAction; rung: number | null } {
  if (attention <= 0) return { action: 'ask_open', rung: null }
  if (attention === 1) return { action: 'ask_focused', rung: null }
  const { action, rung } = supportRung(assistance)
  return { action, rung }
}

export function applyPolicy(
  state: SessionState,
  assessment: Assessment,
  _problem: CuratedProblem,
): PolicyDecision {
  const suggested = assessment.suggestedAction

  const base = (
    action: TutorAction,
    focusArea: ReasoningAreaId | null,
    reason: string,
    extra: Partial<PolicyDecision> = {},
  ): PolicyDecision => ({
    action,
    focusArea,
    evidenceUpdates: [],
    approachDescription: assessment.approach.description,
    approachName: assessment.approach.name,
    approachChangedFrom: assessment.approach.changedFrom,
    bumpAttention: true,
    assistanceRung: null,
    awaitCheck: false,
    deferArea: null,
    resetAttention: [],
    complete: false,
    paused: false,
    overrodeSuggestion: action !== suggested,
    reason,
    ...extra,
  })

  /* --- Evidence first: credit everything this response supports. -------
     One response can satisfy several areas at once, so this is never
     restricted to the area currently in focus. */
  const updates: EvidenceUpdate[] = []
  const credited = new Set<ReasoningAreaId>()

  for (const claim of assessment.demonstrated) {
    updates.push({
      area: claim.area,
      status: claim.adequate ? 'demonstrated' : 'partial',
      quote: claim.quote,
      gap: claim.adequate ? null : undefined,
    })
    if (claim.adequate) credited.add(claim.area)
  }

  for (const gap of assessment.missing) {
    // Never downgrade an area this same response demonstrated.
    if (credited.has(gap.area)) continue
    if (state.evidence[gap.area].status === 'demonstrated') continue
    updates.push({
      area: gap.area,
      status: state.evidence[gap.area].status === 'unaddressed' ? 'unaddressed' : 'partial',
      gap: gap.gap,
    })
  }

  /* --- An approach change invalidates evidence about the old approach. -
     Done before completion is considered or a focus is chosen, so a learner
     cannot finish on reasoning that described a different algorithm. */
  const resetAttention: ReasoningAreaId[] = []
  const changedApproach = Boolean(state.selectedApproach && assessment.approach.changedFrom)

  if (changedApproach) {
    for (const area of AREA_IDS) {
      if (!isApproachDependent(area)) continue // requirements genuinely transfer
      if (credited.has(area)) continue // re-established in this very response
      const record = state.evidence[area]
      if (record.status === 'unaddressed') continue

      updates.push({
        area,
        status: 'revisit',
        gap: `recorded for ${state.selectedApproach?.name ?? 'the previous approach'}; needs re-explaining for ${assessment.approach.name}`,
      })
      // The question ladder restarts for the new approach; the record of help
      // already given does not, so support levels stay honest.
      resetAttention.push(area)
    }
  }

  /* --- A contradiction reopens an area, whatever else was said. -------- */
  if (assessment.contradictions.length > 0) {
    const first = assessment.contradictions[0]
    updates.push({
      area: first.area,
      status: 'revisit',
      gap: first.detail,
    })
    credited.delete(first.area)
  }

  /* --- Apply the evidence, then look at what is left. ------------------ */
  const provisional: SessionState = {
    ...state,
    evidence: { ...state.evidence },
  }
  for (const update of updates) {
    provisional.evidence[update.area] = {
      ...provisional.evidence[update.area],
      status: update.status,
    }
  }

  const relevant = new Set<ReasoningAreaId>([
    ...assessment.missing.map((m) => m.area),
    ...(assessment.suggestedFocus ? [assessment.suggestedFocus] : []),
  ])

  /* --- A guided explanation is outstanding: invite them to apply it. ---
     The learner explaining it back is the only thing that counts. The tutor
     having explained it is not evidence of anything. */
  if (state.awaitingCheck) {
    const area = state.awaitingCheck
    if (credited.has(area))
      return finish(state, provisional, updates, relevant, assessment, resetAttention, base)

    // They still cannot apply it. Set the area aside — unresolved, not
    // understood — and take the conversation somewhere useful. Deferring is
    // what stops the tutor re-asking the question it just answered.
    updates.push({
      area,
      status: 'partial',
      gap: 'explained by the tutor; not yet applied back',
    })
    provisional.evidence[area] = { ...provisional.evidence[area], status: 'partial' }

    const deferred = [...state.deferredAreas, area]
    const next = selectFocus(provisional, relevant, deferred)

    if (next)
      return base(
        'ask_open',
        next,
        `Guided explanation on ${area} was not applied back — deferred, moved to ${next}.`,
        { evidenceUpdates: updates, deferArea: area, resetAttention },
      )

    // Nothing useful left to ask. This is NOT completion: the core reasoning
    // has gaps, and saying otherwise would misreport what happened.
    return base(
      'offer_review',
      null,
      `Guided explanation on ${area} was not applied back and no other area is open — offering review or a pause.`,
      {
        evidenceUpdates: updates,
        deferArea: area,
        resetAttention,
        paused: true,
        bumpAttention: false,
      },
    )
  }

  /* --- Already finished: the core activity is done. --------------------
     The remaining moves are the reference implementation and any optional
     comparison — not another pass over reasoning already demonstrated.
     This must run before the progress branch below: a post-completion "yes"
     reads as progress and would otherwise re-summarise.

     Unless something was just invalidated: a learner who finishes on a hash
     map and then switches to sorting is not finished any more, and must not be
     handed the old approach's code. */
  const invalidated = updates.some((u) => u.status === 'revisit')

  if (state.phase === 'complete' && !invalidated) {
    return base(
      'offer_reference',
      null,
      'Generate an implementation of the learner approach after completion.',
      {
        evidenceUpdates: updates,
        resetAttention,
        complete: true,
        bumpAttention: false,
      },
    )
  }

  // Misconceptions must climb the same support ladder as other gaps.
  // Handle the post-explanation check above first, even if it is still wrong.
  const issue = assessment.contradictions[0]
  const needsClarification = assessment.needsClarification || assessment.intent === 'unclear'
  const asksForHelp = assessment.intent === 'request_help' || assessment.intent === 'request_answer'
  const repairFocus = issue?.area ?? state.focusArea ?? 'approach'
  // Progress means new evidence in an area not already settled: adequate
  // evidence, or a first partial attempt. The model's own label is not enough:
  // it calls a re-trace of a finished area, or a second weak guess, "progress",
  // and trusting that reset the question ladder every turn, so a learner
  // circling one area was never offered a hint.
  const newClaims = assessment.progress === 'stuck' ? [] : assessment.demonstrated.filter((claim) => {
    const record = state.evidence[claim.area]
    return record.status !== 'demonstrated' &&
      !record.quotes.includes(claim.quote) &&
      (claim.adequate || record.status === 'unaddressed')
  })
  const makingProgress = newClaims.length > 0
  // A first partial attempt earns one more question, but it does not erase the
  // questions already asked: holding the count, rather than resetting it, is
  // what lets the next stall reach a hint.
  const partialOnly = makingProgress && !newClaims.some((claim) => claim.adequate)
  if (!issue && !asksForHelp && makingProgress) {
    if (state.focusArea && !partialOnly) resetAttention.push(state.focusArea)
    const hold = partialOnly ? { bumpAttention: false } : {}
    if (needsClarification) return base('clarify', repairFocus, 'Useful answer: clarify only the remaining detail without giving a hint.', {
      evidenceUpdates: updates, resetAttention, ...hold,
    })
    if (partialOnly && state.focusArea && selectFocus(provisional, relevant, state.deferredAreas) === state.focusArea)
      return base('ask_focused', state.focusArea, 'First partial attempt: one more question, question count held.', {
        evidenceUpdates: updates, resetAttention, ...hold,
      })
    return finish(state, provisional, updates, relevant, assessment, resetAttention, base)
  }

  if (issue || (needsClarification && !asksForHelp)) {
    const alreadyAsked = state.attention[repairFocus] >= 2 || state.assistance[repairFocus] > 0
    if (alreadyAsked || asksForHelp) {
      const { action, rung } = supportRung(state.assistance[repairFocus])
      return base(action, repairFocus, 'Unresolved confusion: escalate support instead of repeating questions.', {
        evidenceUpdates: updates, resetAttention, assistanceRung: rung,
        awaitCheck: action === 'guided_explanation',
      })
    }
    return base(issue ? 'repair' : 'clarify', repairFocus, 'Ask one concrete clarification before escalating support.', {
      evidenceUpdates: updates, resetAttention,
    })
  }

  /* --- Asking for help, or for the answer. -----------------------------
     Repeated answer requests must not become an endless refusal loop: they
     climb the same bounded ladder any other stuck learner gets. */
  if (
    assessment.intent === 'request_help' ||
    assessment.intent === 'request_answer'
  ) {
    const focus =
      (state.focusArea && !state.deferredAreas.includes(state.focusArea)
        ? state.focusArea
        : null) ?? selectFocus(provisional, relevant, state.deferredAreas)
    if (!focus)
      return base(
        isCoreComplete(provisional) ? 'summarise' : 'offer_review',
        null,
        'Nothing left to ask about.',
        {
          evidenceUpdates: updates,
          resetAttention,
          complete: isCoreComplete(provisional),
          paused: !isCoreComplete(provisional),
        },
      )
    const { action, rung } = supportRung(state.assistance[focus])
    return base(
      action,
      focus,
      `Asked for help on ${focus}; bounded support rung ${rung} (${action}).`,
      {
        evidenceUpdates: updates,
        assistanceRung: rung,
        resetAttention,
        awaitCheck: action === 'guided_explanation',
      },
    )
  }

  return finish(state, provisional, updates, relevant, assessment, resetAttention, base)
}

/**
 * Pick the next move once evidence is settled: complete, change focus, or
 * climb the ladder on the area still in focus.
 */
function finish(
  state: SessionState,
  provisional: SessionState,
  updates: EvidenceUpdate[],
  relevant: Set<ReasoningAreaId>,
  assessment: Assessment,
  resetAttention: ReasoningAreaId[],
  base: (
    action: TutorAction,
    focusArea: ReasoningAreaId | null,
    reason: string,
    extra?: Partial<PolicyDecision>,
  ) => PolicyDecision,
): PolicyDecision {
  /* Completion is judged from the record AFTER any invalidation above, so a
     switch of approach cannot finish the session on stale evidence. */
  const complete = isCoreComplete(provisional)
  const next = selectFocus(provisional, relevant, state.deferredAreas)

  /* --- Core activity complete. ---------------------------------------- */
  if (complete)
    return base('summarise', null, 'Core reasoning areas are all demonstrated.', {
      evidenceUpdates: updates,
      resetAttention,
      complete: true,
    })

  /* --- Gaps remain, but nothing useful left to ask. -------------------- */
  if (!next)
    return base(
      'offer_review',
      null,
      'Unresolved areas remain but all of them are deferred — offering review or a pause.',
      { evidenceUpdates: updates, resetAttention, paused: true, bumpAttention: false },
    )

  /* --- Focus moved: open question, fresh ladder. ----------------------- */
  if (next !== state.focusArea)
    return base('ask_open', next, `Focus moved to ${next}.`, {
      evidenceUpdates: updates,
      resetAttention,
    })

  /* --- Same area, still unresolved: climb the bounded ladder. ---------- */
  if (
    assessment.suggestedAction === 'compare' &&
    relevant.has('comparison') &&
    state.assistance[next] === 0
  )
    // The optional comparison is allowed where the model asked for it and the
    // learner has not been struggling. It is never forced.
    return base('compare', next, "Comparison invited by the learner's reasoning.", {
      evidenceUpdates: updates,
      resetAttention,
    })

  const { action, rung } = resetAttention.includes(next)
    ? { action: 'ask_focused' as TutorAction, rung: null }
    : ladderStep(state.attention[next], state.assistance[next])
  return base(action, next, `Still unresolved on ${getArea(next).label}.`, {
    evidenceUpdates: updates,
    assistanceRung: rung,
    resetAttention,
    awaitCheck: action === 'guided_explanation',
  })
}

/** Recovery decision for an unusable model response. Costs the learner nothing. */
export function recoveryDecision(state: SessionState): PolicyDecision {
  return {
    action: 'recover',
    focusArea: state.focusArea,
    evidenceUpdates: [],
    approachName: null,
    approachChangedFrom: null,
    bumpAttention: false,
    assistanceRung: null,
    awaitCheck: false,
    deferArea: null,
    resetAttention: [],
    complete: false,
    paused: false,
    overrodeSuggestion: false,
    reason: 'Model response was unusable; session preserved, nothing recorded.',
  }
}

/** Message kind for the transcript, so hints and walkthroughs stay marked. */
export function actionMessageKind(
  action: TutorAction,
): 'question' | 'hint' | 'repair' | 'feedback' | 'summary' | 'reveal' | 'notice' {
  switch (action) {
    case 'light_hint':
    case 'stronger_hint':
      return 'hint'
    case 'guided_explanation':
      return 'reveal'
    case 'repair':
      return 'repair'
    case 'summarise':
      return 'summary'
    case 'offer_review':
      return 'feedback'
    case 'offer_reference':
      return 'reveal'
    case 'recover':
      return 'notice'
    case 'clarify':
      return 'question'
    default:
      return 'question'
  }
}

export { CORE_AREAS }
