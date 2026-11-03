/**
 * Shared types for LeetUP.
 *
 * The session state below is the "backend" of the prototype: a single
 * serialisable object that a real server could persist per learner.
 *
 * The model is *evidence-based*, not sequential. There is no stage pointer that
 * marches forward. There is a record of what the learner has shown they
 * understand, how they showed it, and which gap the tutor is currently asking
 * about. Any one response may move several areas at once.
 */

/** The reasoning areas a learner accumulates evidence in. */
export type ReasoningAreaId =
  | 'requirements'
  | 'approach'
  | 'justification'
  | 'correctness'
  | 'complexity'
  | 'comparison'

/** Where a transcript message belongs. */
export type TranscriptArea = ReasoningAreaId | 'opening' | 'summary' | 'system'

export type EvidenceStatus =
  /** Nothing said about it yet. */
  | 'unaddressed'
  /** Touched on, but something required is still missing. */
  | 'partial'
  /** Adequately explained. */
  | 'demonstrated'
  /** Was demonstrated, but a later response contradicted it. */
  | 'revisit'

/**
 * How the learner got there. This is the difference between "can do this" and
 * "was walked through this", and it is never quietly upgraded: once an area
 * needed a walkthrough, the record says so even if the learner later explains
 * it well.
 */
export type SupportLevel = 'independent' | 'after-hints' | 'after-guidance'

export interface AreaEvidence {
  status: EvidenceStatus
  /** Null until the area is demonstrated or partial. */
  support: SupportLevel | null
  /** Verbatim learner text that supports this area, oldest first. */
  quotes: string[]
  /** Learner quotes used when this area was credited; excludes later partial replies. */
  creditedQuotes?: string[]
  /** What is still missing or what contradicted it. */
  gap: string | null
  /** Turn number of the last change, for the transcript and for debugging. */
  updatedAtTurn: number
}

export interface SelectedApproach {
  /** A short label for the learner's algorithm. */
  name: string
  /** Legacy field retained for older session fixtures; not used for decisions. */
  recognised?: boolean
  /** Learner-specific steps and unresolved details, not a reference family. */
  description?: string
  /** The approach this replaced, when the learner changed their mind. */
  changedFrom: string | null
  /** Turn the approach was selected or changed. */
  selectedAtTurn: number
}

/** Known solution used only by offline evaluation fixtures. */
export interface Approach {
  name: string
  role: 'baseline' | 'target-optimized' | 'alternative' | 'conditionally-correct'
  correctness: 'correct' | 'conditionally-correct' | 'incorrect'
  /** Average-case unless the string says otherwise. */
  timeComplexity: string
  spaceComplexity: string
  tradeoff: string
  /** Terms a learner might use for this approach, lowercase. */
  aliases: string[]
  /** How it works, mechanically — the guided explanation for the approach area. */
  howItWorks: string
  /** Why it produces the right answer / what it buys — the justification area. */
  whyItWorks: string
  /** What to watch out for with THIS approach — the correctness area. */
  correctnessNotes: string
  /** Where its cost comes from — the complexity area. */
  complexityRationale: string
  /** The condition it depends on, for conditionally-correct approaches. */
  condition?: string
  notes?: string
  /**
   * Reference implementation for this approach. Deliberately absent for some:
   * the tutor says so rather than substituting a different approach's code.
   */
  referenceSolution?: string
}

export interface CuratedProblem {
  id: string
  title: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  statement: string
  examples: { input: string; output: string; explanation?: string }[]
  constraints: string[]
  followUp?: string
  metadata: {
    /** Requirements that actually constrain a solution, for the requirements area. */
    keyRequirements: string[]
    commonMisconceptions: string[]
    edgeCases: string[]
    /** What this problem is meant to teach, independent of approach. */
    targetConcepts: string[]
  }
}

export interface ChatMessage {
  id: string
  role: 'assistant' | 'learner'
  text: string
  /** Reasoning area the message belongs to — used for transcript labels. */
  area: TranscriptArea
  kind?:
    | 'question'
    | 'hint'
    | 'repair'
    | 'feedback'
    | 'summary'
    | 'reveal'
    /** A labelled out-of-band notice for an LLM failure. */
    | 'notice'
}

export type SessionPhase =
  | 'opening'
  | 'exploring'
  /** Nothing useful left to ask, but the core reasoning is NOT complete. */
  | 'paused'
  | 'complete'

/**
 * Everything the tutor needs to decide what to say next.
 * Kept flat and JSON-safe so it could be moved to a server session store.
 */
export interface SessionState {
  problemId: string
  started: boolean
  phase: SessionPhase
  /** The area the tutor is currently asking about. */
  focusArea: ReasoningAreaId | null
  /** The evidence record — the heart of the model. */
  evidence: Record<ReasoningAreaId, AreaEvidence>
  /**
   * Question attempts since useful progress in each area. Progress resets
   * the counter; assistance history is preserved separately.
   */
  attention: Record<ReasoningAreaId, number>
  /**
   * Bounded support already given per area: 0 none, 1 light hint, 2 stronger
   * hint, 3 guided explanation. Per-area, so moving focus starts a fresh
   * ladder — and this record is never cleared, which is what keeps the support
   * level on the evidence honest.
   */
  assistance: Record<ReasoningAreaId, number>
  selectedApproach: SelectedApproach | null
  /** Area where a guided explanation was given and not yet applied back. */
  awaitingCheck: ReasoningAreaId | null
  /**
   * Areas set aside after the learner could not apply a guided explanation.
   * They stay unresolved and remain creditable if the learner later explains
   * them — they are just not asked about again, which is what stops the tutor
   * looping on one idea.
   */
  deferredAreas: ReasoningAreaId[]
  turn: number
  learnerResponses: { area: TranscriptArea; turn: number; text: string }[]
  messages: ChatMessage[]
}

/** What the tutor saw and decided on one turn, for exported test logs. */
export interface TurnTrace {
  intent: string | null
  progress: string | null
  suggestedAction: string | null
  action: string
  focusArea: ReasoningAreaId | null
  reason: string
  overrodeSuggestion: boolean
  /** Claims that survived validation, whether or not they were adequate. */
  claims: { area: ReasoningAreaId; quote: string; adequate: boolean }[]
  missing: { area: ReasoningAreaId; gap: string }[]
  contradictions: { area: ReasoningAreaId; detail: string }[]
  /** Claims the validator rejected: invented or too-thin quotes. */
  dropped: string[]
  /** Set when the model call failed and nothing was recorded. */
  recoveryReason?: string
}

export interface EngineResult {
  assistantMessages: ChatMessage[]
  updatedState: SessionState
  trace?: TurnTrace
}
