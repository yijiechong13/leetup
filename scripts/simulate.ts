/** Offline checks of policy, evidence, and completion rules. */
import type { ReasoningAreaId, SessionState } from '../src/types'
import { getProblem } from '../src/data/problemBank'
import { createSession, isCoreComplete, startSession } from '../src/lib/session'
import { applyPolicy, quoteSupports, validateAssessment, type Assessment, type TutorAction } from '../src/lib/policy'
import { applyDecision } from '../src/lib/applyDecision'
import { CORE_AREAS } from '../src/lib/reasoningAreas'
import { buildAssessmentPrompt, buildGenerationPrompt, buildReferencePrompt } from '../src/lib/llmProvider'
import { buildSummaryText } from '../src/lib/summary'


const problem = getProblem('two-sum')

let failures = 0
let checks = 0

function check(name: string, actual: unknown, expected: unknown) {
  checks++
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${name}` +
      (ok
        ? ''
        : `\n          expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`),
  )
}

function truthy(name: string, actual: unknown) {
  check(name, Boolean(actual), true)
}

function section(title: string) {
  console.log(`\n================ ${title} ================`)
}

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

function assessment(partial: Partial<Assessment> = {}): Assessment {
  return {
    intent: 'explain_reasoning',
    approach: { name: null, changedFrom: null, unfamiliar: false },
    demonstrated: [],
    missing: [],
    contradictions: [],
    needsClarification: false,
    clarificationReason: null,
    suggestedFocus: null,
    suggestedAction: 'ask_open',
    ...partial,
  }
}

function sessionWith(partial: Partial<SessionState> = {}): SessionState {
  const base = startSession(createSession()).updatedState
  return { ...base, ...partial }
}

/** Demonstrate an area outright, so later checks start from a known record. */
function demonstrate(
  state: SessionState,
  areas: ReasoningAreaId[],
): SessionState {
  const evidence = { ...state.evidence }
  for (const area of areas)
    evidence[area] = {
      status: 'demonstrated',
      support: 'independent',
      quotes: ['(fixture)'],
      gap: null,
      updatedAtTurn: 0,
    }
  return { ...state, evidence }
}

/* ------------------------------------------------------------------ *
 * 1. Policy controller
 * ------------------------------------------------------------------ */

function policyChecks() {
  section('POLICY CONTROLLER')

  console.log('\nOne response can satisfy several areas at once:')
  {
    const state = sessionWith()
    const decision = applyPolicy(
      state,
      assessment({
        intent: 'propose_approach',
        approach: { name: 'Hash map lookup', changedFrom: null, unfamiliar: false },
        demonstrated: [
          { area: 'approach', quote: 'a', adequate: true, confidence: 0.9 },
          { area: 'justification', quote: 'b', adequate: true, confidence: 0.9 },
        ],
      }),
      problem,
    )
    const next = applyDecision(state, decision, problem)
    check('approach recorded', next.evidence.approach.status, 'demonstrated')
    check('justification recorded too', next.evidence.justification.status, 'demonstrated')
    check(
      'two areas credited from one turn',
      Object.values(next.evidence).filter((e) => e.status === 'demonstrated').length,
      2,
    )
    check('approach name stored', next.selectedApproach?.name, 'Hash map lookup')
  }

  console.log('\nA justified approach does NOT trigger a brute-force detour:')
  {
    const state = sessionWith()
    const decision = applyPolicy(
      state,
      assessment({
        demonstrated: [
          { area: 'approach', quote: 'a', adequate: true, confidence: 0.9 },
          { area: 'justification', quote: 'b', adequate: true, confidence: 0.9 },
        ],
      }),
      problem,
    )
    check('focus skips straight to correctness', decision.focusArea, 'correctness')
    check('and it is an open question', decision.action, 'ask_open')
  }

  console.log('\nRequirements are situational, never compulsory:')
  {
    const state = demonstrate(sessionWith(), ['approach', 'justification'])
    const withoutGap = applyPolicy(state, assessment(), problem)
    check('not asked when nothing made it relevant', withoutGap.focusArea, 'correctness')

    const withGap = applyPolicy(
      state,
      assessment({
        missing: [{ area: 'requirements', gap: 'has not noticed indices are required' }],
      }),
      problem,
    )
    check('asked when a gap makes it relevant', withGap.focusArea, 'requirements')
  }

  console.log('\nNothing already demonstrated is asked about again:')
  {
    const state = demonstrate(sessionWith(), ['approach', 'justification', 'correctness'])
    const decision = applyPolicy(state, assessment(), problem)
    check('moves to the only open core area', decision.focusArea, 'complexity')
  }

  console.log('\nBounded support ladder (learner asks for help):')
  {
    const rungs: [number, TutorAction][] = [
      [0, 'light_hint'],
      [1, 'stronger_hint'],
      [2, 'guided_explanation'],
      [3, 'guided_explanation'],
    ]
    for (const [assistance, expected] of rungs) {
      const state = sessionWith({
        focusArea: 'approach',
        assistance: { ...sessionWith().assistance, approach: assistance },
      })
      const decision = applyPolicy(
        state,
        assessment({ intent: 'request_help', suggestedAction: 'light_hint' }),
        problem,
      )
      check(`help already given ${assistance} -> ${expected}`, decision.action, expected)
    }
  }

  console.log('\nRepeated answer requests reach real help, not a refusal loop:')
  {
    let state = sessionWith({ focusArea: 'approach' })
    const seen: TutorAction[] = []
    for (let i = 0; i < 4; i++) {
      const decision = applyPolicy(
        state,
        assessment({ intent: 'request_answer', suggestedAction: 'clarify' }),
        problem,
      )
      seen.push(decision.action)
      state = applyDecision(state, decision, problem)
    }
    check('escalates to a guided explanation', seen.slice(0, 3), [
      'light_hint',
      'stronger_hint',
      'guided_explanation',
    ])
    // The ceiling is bounded in both directions: having explained the idea,
    // the tutor moves on rather than explaining it again forever.
    truthy(
      'and then moves on rather than looping',
      !['light_hint', 'stronger_hint', 'guided_explanation'].includes(seen[3]),
    )
    truthy('no refusal action is ever produced', !seen.includes('clarify' as TutorAction))
    check(
      'the walked-through area is not recorded as understood',
      state.evidence.approach.status,
      'partial',
    )
    check(
      'and it is marked after-guidance',
      state.evidence.approach.support,
      'after-guidance',
    )
  }

  console.log('\nGuided explanations are not recorded as independent reasoning:')
  {
    let state = sessionWith({ focusArea: 'correctness' })
    state = { ...state, assistance: { ...state.assistance, correctness: 2 } }
    const guided = applyPolicy(
      state,
      assessment({ intent: 'request_help' }),
      problem,
    )
    check('guided explanation given', guided.action, 'guided_explanation')
    state = applyDecision(state, guided, problem)
    check('and the tutor waits for it to be applied', state.awaitingCheck, 'correctness')

    const applied = applyPolicy(
      state,
      assessment({
        demonstrated: [
          { area: 'correctness', quote: 'x', adequate: true, confidence: 0.9 },
        ],
      }),
      problem,
    )
    state = applyDecision(state, applied, problem)
    check('recorded as demonstrated', state.evidence.correctness.status, 'demonstrated')
    check(
      'but marked after-guidance, not independent',
      state.evidence.correctness.support,
      'after-guidance',
    )
  }

  console.log('\nSupport level never silently improves:')
  {
    let state = sessionWith({ focusArea: 'complexity' })
    state = { ...state, assistance: { ...state.assistance, complexity: 3 } }
    state = applyDecision(
      state,
      applyPolicy(
        state,
        assessment({
          demonstrated: [
            { area: 'complexity', quote: 'x', adequate: true, confidence: 1 },
          ],
        }),
        problem,
      ),
      problem,
    )
    check('after-guidance recorded', state.evidence.complexity.support, 'after-guidance')

    // A later, fluent explanation of the same area must not rewrite history.
    state = applyDecision(
      { ...state, assistance: { ...state.assistance, complexity: 0 } },
      applyPolicy(
        { ...state, assistance: { ...state.assistance, complexity: 0 } },
        assessment({
          demonstrated: [
            { area: 'complexity', quote: 'y', adequate: true, confidence: 1 },
          ],
        }),
        problem,
      ),
      problem,
    )
    check('still after-guidance', state.evidence.complexity.support, 'after-guidance')
  }

  console.log('\nContradictions reopen an area:')
  {
    const state = demonstrate(sessionWith(), ['approach', 'justification'])
    const decision = applyPolicy(
      state,
      assessment({
        contradictions: [
          {
            area: 'approach',
            detail: 'now describes sorting, but earlier described one pass',
            quote: 'q',
          },
        ],
        suggestedAction: 'ask_open',
      }),
      problem,
    )
    check('repairs rather than advancing', decision.action, 'repair')
    const next = applyDecision(state, decision, problem)
    check('area reopened', next.evidence.approach.status, 'revisit')
    truthy('session is not complete with an open contradiction', !isCoreComplete(next))
  }

  console.log('\nAn unfamiliar approach is clarified, not judged:')
  {
    const state = sessionWith()
    const decision = applyPolicy(
      state,
      assessment({
        approach: { name: 'bitmask trick', changedFrom: null, unfamiliar: true },
        suggestedAction: 'repair',
      }),
      problem,
    )
    check('an unfamiliar label alone does not require clarification', decision.action, 'ask_focused')
    check('clarification is counted to prevent an endless loop', decision.bumpAttention, true)
    check('clarification does not yet give a hint', decision.assistanceRung, null)
  }

  console.log('\nOptional comparison is allowed but never forced:')
  {
    const state = demonstrate(sessionWith(), ['approach', 'justification', 'correctness'])
    const forced = applyPolicy(state, assessment({ suggestedAction: 'compare' }), problem)
    check('not substituted for an unresolved core area', forced.focusArea, 'complexity')

    const done = demonstrate(sessionWith(), [
      'approach',
      'justification',
      'correctness',
      'complexity',
    ])
    const afterCore = applyPolicy(done, assessment(), problem)
    check('core completion does not demand a comparison', afterCore.action, 'summarise')
  }

  console.log('\nCompletion:')
  {
    const done = demonstrate(sessionWith(), [
      'approach',
      'justification',
      'correctness',
      'complexity',
    ])
    const decision = applyPolicy(done, assessment(), problem)
    check('summarises once the core areas are explained', decision.action, 'summarise')
    check('without demanding a final recap', decision.complete, true)
    const next = applyDecision(done, decision, problem)
    check('phase is complete', next.phase, 'complete')
  }
}

/* ------------------------------------------------------------------ *
 * 2. What counts as evidence
 * ------------------------------------------------------------------ */

function evidenceChecks() {
  section('EVIDENCE VALIDATION')

  const learner =
    "I'd use a hash map. I walk the array once and store each value with its index, because then the complement lookup is instant."

  console.log('\nQuotes must come from the learner:')
  truthy(
    'a real quote is accepted',
    quoteSupports('complexity', 'walk the array once', learner),
  )
  check(
    'an invented quote is rejected',
    quoteSupports('complexity', 'I would sort the array first', learner),
    false,
  )
  truthy(
    'a straight-apostrophe quote of curly learner text is accepted',
    quoteSupports('complexity', "That's O(n) extra space, growing linearly with nums",
      'It holds n entries. That’s O(n) extra space, growing linearly with nums.'),
  )

  console.log('\nNaming a data structure is not a justification:')
  check(
    'bare naming rejected for justification',
    quoteSupports('justification', 'use a hash map', learner),
    false,
  )
  check(
    'bare naming rejected for approach',
    quoteSupports('approach', "I'd use a hash map", learner),
    false,
  )
  truthy(
    'causal reasoning accepted for justification',
    quoteSupports(
      'justification',
      'because then the complement lookup is instant',
      learner,
    ),
  )
  truthy(
    'a worked mechanism accepted for approach',
    quoteSupports(
      'approach',
      'I walk the array once and store each value with its index',
      learner,
    ),
  )

  console.log('\nInvalid model output does not advance or penalise:')
  {
    const broken = validateAssessment('not json at all', learner)
    check('non-object rejected', broken.ok, false)

    const hallucinated = validateAssessment(
      {
        intent: 'explain_reasoning',
        demonstrated: [
          { area: 'approach', quote: 'I would use a segment tree', adequate: true },
          { area: 'complexity', quote: 'walk the array once', adequate: true },
        ],
      },
      learner,
    )
    truthy('structurally valid report is accepted', hallucinated.ok)
    if (hallucinated.ok) {
      check(
        'the invented claim is dropped',
        hallucinated.assessment.demonstrated.map((d) => d.area),
        ['complexity'],
      )

      const state = sessionWith()
      const decision = applyPolicy(state, hallucinated.assessment, problem)
      const next = applyDecision(state, decision, problem)
      check(
        'so the invented area is not recorded',
        next.evidence.approach.status,
        'unaddressed',
      )
    }
  }

  console.log('\nComplexity is not evidence of correctness:')
  {
    const state = sessionWith()
    const next = applyDecision(
      state,
      applyPolicy(
        state,
        assessment({
          demonstrated: [
            { area: 'complexity', quote: 'x', adequate: true, confidence: 1 },
          ],
        }),
        problem,
      ),
      problem,
    )
    check('correctness untouched', next.evidence.correctness.status, 'unaddressed')
  }
}


function regressionChecks() {
  section('REGRESSIONS')
  console.log('\n[2] Changing approach invalidates approach-dependent evidence:')
  {
    const hashed = () => {
      let state = sessionWith()
      state = applyDecision(
        state,
        applyPolicy(
          state,
          assessment({
            intent: 'propose_approach',
            approach: { name: 'Hash map lookup', changedFrom: null, unfamiliar: false },
            demonstrated: [
              { area: 'approach', quote: 'a', adequate: true, confidence: 1 },
              { area: 'justification', quote: 'b', adequate: true, confidence: 1 },
              { area: 'correctness', quote: 'c', adequate: true, confidence: 1 },
              { area: 'complexity', quote: 'd', adequate: true, confidence: 1 },
              { area: 'requirements', quote: 'e', adequate: true, confidence: 1 },
            ],
          }),
          problem,
        ),
        problem,
      )
      return state
    }

    /* (a) switch with no explanation */
    {
      const before = hashed()
      check('hash-map session is complete first', before.phase, 'complete')
      const decision = applyPolicy(
        before,
        assessment({
          intent: 'propose_approach',
          approach: {
            name: 'Sorting with original-index tracking',
            changedFrom: 'Hash map lookup',
            unfamiliar: false,
          },
        }),
        problem,
      )
      const after = applyDecision(before, decision, problem)
      check('approach switched', after.selectedApproach?.name, 'Sorting with original-index tracking')
      check('justification needs re-explaining', after.evidence.justification.status, 'revisit')
      check('complexity needs re-explaining', after.evidence.complexity.status, 'revisit')
      check('correctness needs re-explaining', after.evidence.correctness.status, 'revisit')
      check('requirements transfer across approaches', after.evidence.requirements.status, 'demonstrated')
      check('session is no longer complete', isCoreComplete(after), false)
      check('and returns to an active phase', after.phase, 'exploring')
      truthy('previous quotes are kept as history', after.evidence.justification.quotes.length > 0)
    }

    /* (b) switch WITH a full explanation in the same response */
    {
      const before = hashed()
      const decision = applyPolicy(
        before,
        assessment({
          intent: 'propose_approach',
          approach: {
            name: 'Sorting with original-index tracking',
            changedFrom: 'Hash map lookup',
            unfamiliar: false,
          },
          demonstrated: [
            { area: 'approach', quote: 'p', adequate: true, confidence: 1 },
            { area: 'justification', quote: 'q', adequate: true, confidence: 1 },
            { area: 'complexity', quote: 'r', adequate: true, confidence: 1 },
          ],
        }),
        problem,
      )
      const after = applyDecision(before, decision, problem)
      check('re-explained areas are credited, not invalidated', after.evidence.complexity.status, 'demonstrated')
      check('un-re-explained areas still need review', after.evidence.correctness.status, 'revisit')
      check('so the session is not complete on stale evidence', isCoreComplete(after), false)
    }

    /* (c) rephrasing the same approach is not a change */
    {
      const before = hashed()
      const decision = applyPolicy(
        before,
        assessment({
          intent: 'explain_reasoning',
          approach: { name: 'a dictionary from value to index', changedFrom: null, unfamiliar: false },
        }),
        problem,
      )
      const after = applyDecision(before, decision, problem)
      check('learner wording is retained without canonical mapping', after.selectedApproach?.name, 'a dictionary from value to index')
      check('nothing is invalidated', after.evidence.justification.status, 'demonstrated')
      check('and the session stays complete', after.phase, 'complete')
    }

    /* (d) supported reasoning does not come back as independent */
    {
      let state = sessionWith()
      state = { ...state, assistance: { ...state.assistance, complexity: 3 } }
      state = applyDecision(
        state,
        applyPolicy(
          state,
          assessment({
            approach: { name: 'Hash map lookup', changedFrom: null, unfamiliar: false },
            demonstrated: [{ area: 'complexity', quote: 'x', adequate: true, confidence: 1 }],
          }),
          problem,
        ),
        problem,
      )
      check('recorded as after-guidance', state.evidence.complexity.support, 'after-guidance')

      const switched = applyDecision(
        state,
        applyPolicy(
          state,
          assessment({
            approach: {
              name: 'Sorting with original-index tracking',
              changedFrom: 'Hash map lookup',
              unfamiliar: false,
            },
            demonstrated: [{ area: 'complexity', quote: 'y', adequate: true, confidence: 1 }],
          }),
          problem,
        ),
        problem,
      )
      check(
        'assistance history survives the switch',
        switched.evidence.complexity.support,
        'after-guidance',
      )
      check('but the question ladder restarts', switched.attention.correctness, 0)
    }
  }

  /* --- 4. Failed understanding check could re-ask the same area -------- */
  console.log('\n[4] A failed understanding check does not loop:')
  {
    let state = sessionWith({ focusArea: 'correctness' })
    state = { ...state, assistance: { ...state.assistance, correctness: 2 } }

    // Guided explanation delivered.
    state = applyDecision(
      state,
      applyPolicy(state, assessment({ intent: 'request_help' }), problem),
      problem,
    )
    check('awaiting the learner to apply it', state.awaitingCheck, 'correctness')

    // They cannot apply it.
    const deferDecision = applyPolicy(
      state,
      assessment({ intent: 'explain_reasoning', missing: [{ area: 'correctness', gap: 'still unsure' }] }),
      problem,
    )
    state = applyDecision(state, deferDecision, problem)
    truthy('the area is set aside', state.deferredAreas.includes('correctness'))
    truthy('and is NOT re-asked', state.focusArea !== 'correctness')
    check('not marked understood just because it was explained', state.evidence.correctness.status, 'partial')

    // Keep failing everywhere. Four core areas at up to four turns each, so
    // this must terminate well inside the bound — the point is that it
    // terminates at all rather than re-asking one question forever.
    const seen: string[] = []
    for (let i = 0; i < 40; i++) {
      const d = applyPolicy(
        state,
        assessment({ intent: 'request_help' }),
        problem,
      )
      seen.push(d.action)
      state = applyDecision(state, d, problem)
      if (d.action === 'offer_review') break
    }
    truthy('it reaches a review-or-pause offer', seen.includes('offer_review'))
    check('the session is paused, not completed', state.phase, 'paused')
    check('and completion is not claimed', isCoreComplete(state), false)

    // A later explanation can still resolve the deferred area.
    const resolved = applyDecision(
      state,
      applyPolicy(
        state,
        assessment({
          demonstrated: [{ area: 'correctness', quote: 'z', adequate: true, confidence: 1 }],
        }),
        problem,
      ),
      problem,
    )
    check('a later explanation resolves it', resolved.evidence.correctness.status, 'demonstrated')
    check('recorded as after-guidance', resolved.evidence.correctness.support, 'after-guidance')
    check('and it leaves the deferred list', resolved.deferredAreas.includes('correctness'), false)
  }

}

function completionRuleChecks() {
  section('FOUR-AREA COMPLETION')
  check('required reasoning areas', CORE_AREAS, [
    'approach', 'justification', 'correctness', 'complexity',
  ])
  const withoutJustification = demonstrate(sessionWith(), [
    'approach', 'correctness', 'complexity',
  ])
  check('justification blocks completion', isCoreComplete(withoutJustification), false)
  check('justification is the next focus',
    applyPolicy(withoutJustification, assessment(), problem).focusArea,
    'justification')
  const bruteForce = {
    ...demonstrate(sessionWith(), CORE_AREAS),
    selectedApproach: {
      name: 'Nested loops', recognised: true, changedFrom: null, selectedAtTurn: 1,
    },
  }
  check('correct brute force is complete', isCoreComplete(bruteForce), true)
  truthy('completed approach can request generated code', buildReferencePrompt(bruteForce).includes('Nested loops'))
  // A typed "yes" after the summary reads as progress; it must not re-summarise.
  check('a "yes" after completion gets the reference code',
    applyPolicy({ ...bruteForce, phase: 'complete' }, assessment({ progress: 'progress' }), problem).action,
    'offer_reference')
}


function codeEvidenceChecks() {
  section('CODE EVIDENCE')
  const code = 'seen[value] = index'
  check('short code admitted as approach evidence', quoteSupports('approach', code, code), true)
  check('assignment alone is not justification', quoteSupports('justification', code, code), false)
  check('invented operator rejected', quoteSupports('approach', 'seen[value] == index', code), false)
  check('invented index rejected', quoteSupports('approach', 'seen[index] = value', code), false)
  const validated = validateAssessment(assessment({
    demonstrated: [{ area: 'approach', quote: code, adequate: false, confidence: 0.9 }],
  }), code)
  if (!validated.ok) throw new Error(validated.reason)
  const partial = applyDecision(sessionWith(), applyPolicy(sessionWith(), validated.assessment, problem), problem)
  check('unfinished attempt stays partial', partial.evidence.approach.status, 'partial')
  check('unfinished attempt cannot complete session', isCoreComplete(partial), false)

  const fullCode = 'for i in range(len(nums)):\n    for j in range(i + 1, len(nums)):\n        if nums[i] + nums[j] == target:\n            return [i, j]'
  const report = validateAssessment(assessment({
    approach: { name: 'Nested loops', changedFrom: null, unfamiliar: false },
    demonstrated: [{ area: 'approach', quote: fullCode, adequate: true, confidence: 0.9 }],
  }), fullCode)
  if (!report.ok) throw new Error(report.reason)
  const decision = applyPolicy(sessionWith(), report.assessment, problem)
  const state = applyDecision(sessionWith(), decision, problem)
  check('concrete code records the approach', state.evidence.approach.status, 'demonstrated')
  check('code alone leaves justification unresolved', state.evidence.justification.status, 'unaddressed')
  check('code alone leaves correctness reasoning unresolved', state.evidence.correctness.status, 'unaddressed')
  check('code alone leaves complexity unresolved', state.evidence.complexity.status, 'unaddressed')
  check('follow-up asks for missing justification', decision.focusArea, 'justification')
  check('code evidence preserves indentation', state.evidence.approach.quotes[0], fullCode)
}

codeEvidenceChecks()

function boundedConfusionChecks() {
  section('BOUNDED CONFUSION')
  for (const kind of ['contradiction', 'clarification'] as const) {
    let state = sessionWith()
    const report = assessment(kind === 'contradiction' ? {
      contradictions: [{ area: 'approach', detail: 'A single-index map does not append.', quote: 'it appends' }],
    } : { needsClarification: true, intent: 'unclear' })
    const actions: TutorAction[] = []
    for (let turn = 0; turn < 5; turn++) {
      const decision = applyPolicy(state, report, problem)
      actions.push(decision.action)
      state = applyDecision(state, decision, problem)
    }
    check(`${kind}: questions escalate to explanation then move on`, actions, [
      kind === 'contradiction' ? 'repair' : 'clarify',
      'light_hint', 'stronger_hint', 'guided_explanation', 'ask_open',
    ])
    check(`${kind}: failed check remains unresolved`, state.evidence.approach.status, 'partial')
    check(`${kind}: support is recorded`, state.evidence.approach.support, 'after-guidance')
    check(`${kind}: failed check is deferred`, state.deferredAreas.includes('approach'), true)
  }
  const help = applyPolicy(sessionWith(), assessment({ intent: 'request_help', needsClarification: true }), problem)
  check('asking for help bypasses clarification', help.action, 'light_hint')
}

boundedConfusionChecks()
section('LEARNER APPROACH AND CONCISE EVIDENCE')
check('short lookup explanation is admitted', quoteSupports('justification', 'single look up approach O(1)', 'single look up approach O(1)'), true)
check('bare map name still insufficient', quoteSupports('justification', 'use a hash map', 'use a hash map'), false)
section('RUBRIC TUTORING AND PROGRESS')
{
  const before = sessionWith()
  before.attention.approach = 8
  const quote = 'index as value, numbers as the key, look up the complement'
  const parsed = validateAssessment({
    ...assessment({
      needsClarification: true,
      approach: { name: 'My prefilled map', description: 'Build the whole map before a second scan. Check found index differs from current index.', changedFrom: null, unfamiliar: true },
      demonstrated: [{ area: 'approach', quote, adequate: false, confidence: 0.9 }],
    }),
    progress: 'progress',
  }, quote)
  if (!parsed.ok) throw new Error(parsed.reason)
  const decision = applyPolicy(before, parsed.assessment, problem)
  const after = applyDecision(before, decision, problem)
  check('useful partial answer receives ordinary clarification', decision.action, 'clarify')
  check('useful partial answer receives no support rung', decision.assistanceRung, null)
  check('answer stays independently demonstrated so far', after.evidence.approach.support, 'independent')
  check('first partial answer holds the question counter', after.attention.approach, 8)
  check('learner description is retained', after.selectedApproach?.description, parsed.assessment.approach.description)
  truthy('generation gets actual learner steps', buildGenerationPrompt(after, decision, parsed.assessment).includes('Build the whole map before a second scan'))
  check('assessment contains no curated solution list', buildAssessmentPrompt(after).includes('Reference approach families'), false)
  const active = { ...after, assistance: { ...after.assistance, approach: 2 } }
  const continued = applyPolicy(active, {
    ...parsed.assessment,
    needsClarification: false,
    demonstrated: [{ area: 'approach', quote: 'Fill the map first, then scan again and return only when the found index differs from i.', adequate: true, confidence: 0.9 }],
  }, problem)
  check('progress after a hint returns to ordinary follow-up', continued.action, 'ask_open')
  check('ordinary follow-up does not escalate assistance', continued.assistanceRung, null)
  const next = applyDecision(active, continued, problem)
  check('previous support remains honestly recorded', next.evidence.approach.support, 'after-hints')
  let gated = false
  try { buildReferencePrompt(after) } catch { gated = true }
  check('reference generation blocked before completion', gated, true)
  const complete = demonstrate(after, CORE_AREAS)
  truthy('completed unfamiliar algorithm can get reference code', buildReferencePrompt(complete).includes('Build the whole map before a second scan'))
}
section('CIRCLING ONE AREA ESCALATES')
{
  // Live run: two justification questions, then a re-trace of the finished
  // approach and a weak guess, each labelled "progress" by the model.
  const asked = {
    ...demonstrate(sessionWith({ focusArea: 'justification' }), ['approach']),
    attention: { ...sessionWith().attention, justification: 2 },
  }
  const retrace = applyPolicy(asked, assessment({
    progress: 'progress',
    demonstrated: [{ area: 'approach', quote: 'When x = 7, seen is {2: 0}, so it returns [0, 1].', adequate: true, confidence: 0.9 }],
  }), problem)
  check('re-tracing a settled area does not reset the ladder', retrace.action, 'light_hint')

  const partial = {
    ...asked,
    evidence: { ...asked.evidence, justification: { ...asked.evidence.justification, status: 'partial' as const, quotes: ['it is faster'] } },
  }
  const guess = applyPolicy(partial, assessment({
    progress: 'progress',
    demonstrated: [{ area: 'justification', quote: "it's one loop instead of two", adequate: false, confidence: 0.6 }],
  }), problem)
  check('a second weak guess on the same area escalates', guess.action, 'light_hint')

  // Live rerun: the first weak guess reset the count to zero, so the stall
  // after it got yet another question instead of a hint.
  const first = applyPolicy(asked, assessment({
    progress: 'progress',
    demonstrated: [{ area: 'justification', quote: "it's one loop instead of two", adequate: false, confidence: 0.6 }],
  }), problem)
  check('a first weak guess gets one more question', first.action, 'ask_focused')
  const held = applyDecision(asked, first, problem)
  check('and the question count is held, not reset', held.attention.justification, 2)
  const stall = applyPolicy(held, assessment({ progress: 'stuck' }), problem)
  check('the stall after it reaches a hint', stall.action, 'light_hint')
}

section('HELP CARRIES TO THE NEXT REPLY')
{
  // Live run: a stronger hint on correctness spelled out "look up before
  // storing"; the reply also earned requirements, which came out independent.
  const hinted = {
    ...sessionWith({ focusArea: 'correctness' }),
    assistance: { ...sessionWith().assistance, correctness: 2 },
  }
  hinted.messages = [...hinted.messages, { id: 'h', role: 'assistant' as const, text: 'hint', area: 'correctness' as const, kind: 'hint' as const }]
  const credit = applyPolicy(hinted, assessment({
    demonstrated: [
      { area: 'correctness', quote: 'At index 1 the map has 3 at 0, so it returns [0, 1].', adequate: true, confidence: 0.9 },
      { area: 'requirements', quote: 'Looking up before storing means an element can never match itself.', adequate: true, confidence: 0.9 },
    ],
  }), problem)
  const after = applyDecision(hinted, credit, problem)
  check('the hinted area is recorded as supported', after.evidence.correctness.support, 'after-hints')
  check('so is another area credited from the same reply', after.evidence.requirements.support, 'after-hints')

  const unhinted = { ...hinted, messages: hinted.messages.slice(0, -1) }
  const plain = applyDecision(unhinted, applyPolicy(unhinted, assessment({
    demonstrated: [{ area: 'requirements', quote: 'Looking up before storing means an element can never match itself.', adequate: true, confidence: 0.9 }],
  }), problem), problem)
  check('without a hint just before, it stays independent', plain.evidence.requirements.support, 'independent')
}

section('A SWITCH DROPS THE OLD APPROACH QUOTE')
{
  // Live run: after switching from nested loops to a map, the summary quoted
  // both algorithms as evidence for the approach.
  const oldQuote = 'for each i, check every j starting at i+1'
  const nested = applyDecision(sessionWith(), applyPolicy(sessionWith(), assessment({
    approach: { name: 'Nested loops', changedFrom: null, unfamiliar: false },
    demonstrated: [{ area: 'approach', quote: oldQuote, adequate: true, confidence: 0.9 }],
  }), problem), problem)
  const newQuote = 'check whether target - nums[i] is already in the map, otherwise store it'
  const switched = applyDecision(nested, applyPolicy(nested, assessment({
    approach: { name: 'One-pass hash map', changedFrom: 'Nested loops', unfamiliar: false },
    demonstrated: [{ area: 'approach', quote: newQuote, adequate: true, confidence: 0.9 }],
  }), problem), problem)
  check('approach evidence cites only the new algorithm', switched.evidence.approach.creditedQuotes, [newQuote])
}

section('ONE EDGE CASE AND HONEST SUMMARY')
{
  const weak = 'its correct already because they guarantee one solution'
  check('promise alone is not proof of correctness', quoteSupports('correctness', weak, weak), false)
  const invalid = validateAssessment(assessment({
    demonstrated: [{ area: 'correctness', quote: weak, adequate: true, confidence: 1 }],
  }), weak)
  if (!invalid.ok) throw new Error(invalid.reason)
  check('unsupported correctness credit is dropped', invalid.assessment.demonstrated.length, 0)

  const before = demonstrate(sessionWith({ focusArea: 'correctness' }), ['approach', 'justification'])
  const edgeCase = 'For [3,3], the map holds 3 at index 1; at index 0 the lookup finds 1, so the indices differ and I return [0,1].'
  const credited = validateAssessment(assessment({
    demonstrated: [{ area: 'correctness', quote: edgeCase, adequate: true, confidence: 0.95 }],
  }), edgeCase)
  if (!credited.ok) throw new Error(credited.reason)
  const decision = applyPolicy(before, credited.assessment, problem)
  const after = applyDecision(before, decision, problem)
  check('one reasoned edge case moves to complexity', decision.focusArea, 'complexity')
  check('correctness credited', after.evidence.correctness.status, 'demonstrated')
  check('credited quote saved separately', after.evidence.correctness.creditedQuotes, [edgeCase])
  const later = applyDecision(after, {
    ...decision,
    action: 'ask_open',
    focusArea: 'complexity',
    evidenceUpdates: [{ area: 'complexity', status: 'partial', quote: 'the map holds n values' }],
    approachName: null,
  }, problem)
  const complete = demonstrate(later, ['complexity'])
  const summary = buildSummaryText(complete, problem)
  truthy('summary cites the reasoned edge case', summary.includes(edgeCase.slice(0, 70)))
  check('summary omits invented algorithm narrative', summary.includes('Your approach:'), false)
}

policyChecks()
evidenceChecks()
regressionChecks()
completionRuleChecks()
console.log(failures === 0 ? `\nAll ${checks} checks passed.` :
  `\n${failures} of ${checks} checks FAILED.`)
if (failures > 0) process.exitCode = 1
