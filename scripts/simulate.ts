/**
 * Offline test harness (not part of the app bundle).
 * Run: npx tsx scripts/simulate.ts   (or `npm run simulate`)
 *
 * Three halves, none of which needs an API key:
 *
 *   1. POLICY      — the controller driven with hand-written assessments
 *                    standing in for the model's reading. This is where the
 *                    pedagogy is actually asserted, because these rules must
 *                    hold whatever the model says.
 *   2. EVIDENCE    — the quote-checking that decides what counts as evidence.
 *   3. SCENARIOS   — all three scripted demos replayed end to end through the
 *                    real provider, checking the record they produce.
 */
import type { ReasoningAreaId, SessionState } from '../src/types'
import { getProblem } from '../src/data/problemBank'
import {
  createSession,
  getChecklist,
  isCoreComplete,
  startSession,
} from '../src/lib/session'
import {
  applyPolicy,
  quoteSupports,
  validateAssessment,
  type Assessment,
  type TutorAction,
} from '../src/lib/policy'
import { applyDecision } from '../src/lib/applyDecision'
import { scriptedProvider } from '../src/lib/scriptedProvider'
import { SCENARIOS } from '../src/lib/scenarios'
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
    check('asks for a worked example', decision.action, 'clarify')
    check('and does not cost the learner a rung', decision.bumpAttention, false)
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

/* ------------------------------------------------------------------ *
 * 3. Scripted scenarios, replayed end to end
 * ------------------------------------------------------------------ */

async function scenarioChecks() {
  section('SCRIPTED SCENARIOS')

  for (const scenario of SCENARIOS) {
    console.log(`\n${scenario.label}`)
    let state = startSession(createSession('two-sum', scenario.id)).updatedState

    for (const beat of scenario.beats) {
      const result = await scriptedProvider.getNextResponse(state, beat.input)
      state = result.updatedState
      const offScript = result.assistantMessages.some((m) => m.kind === 'notice')
      if (offScript) {
        failures++
        checks++
        console.log(`  FAIL  beat went off script: "${beat.input.slice(0, 50)}…"`)
      }
    }

    check(`${scenario.id}: core reasoning complete`, isCoreComplete(state), true)
    check(`${scenario.id}: session marked complete`, state.phase, 'complete')

    const summary = buildSummaryText(state, problem)
    const approach = state.selectedApproach?.name ?? ''
    truthy(`${scenario.id}: an approach was recorded`, approach.length > 0)
    truthy(`${scenario.id}: the summary names that approach`, summary.includes(approach))

    /* Scenario-specific expectations. */
    if (scenario.id === 'A') {
      check('A: approach is the hash map', approach, 'Hash map lookup')
      check(
        'A: everything was independent',
        getChecklist(state)
          .filter((i) => i.status === 'supported')
          .map((i) => i.id),
        [],
      )
      truthy(
        'A: no brute-force detour was imposed',
        !state.messages.some(
          (m) => m.role === 'assistant' && /brute|every pair/i.test(m.text),
        ),
      )
    }

    if (scenario.id === 'B') {
      check('B: approach is nested loops', approach, 'Nested loops')
      truthy(
        'B: complexity feedback is quadratic, not O(n)',
        summary.includes('O(n^2)') && !summary.includes('O(n) time'),
      )
      check(
        'B: correctness is recorded as reached with guidance',
        state.evidence.correctness.support,
        'after-guidance',
      )
      truthy(
        'B: the summary says which areas needed help',
        /checklist records where you needed help/.test(summary),
      )
      truthy(
        'B: a guided explanation was actually delivered',
        state.messages.some((m) => m.kind === 'reveal'),
      )
    }

    if (scenario.id === 'C') {
      check('C: sorting with index tracking is accepted', approach, 'Sorting with original-index tracking')
      truthy(
        'C: complexity feedback is O(n log n), not the hash map figure',
        summary.includes('O(n log n)'),
      )
      truthy(
        'C: the learner was never pushed to switch approach',
        !state.messages.some(
          (m) =>
            m.role === 'assistant' &&
            /you should use a hash map|use a hash map instead/i.test(m.text),
        ),
      )
      truthy(
        'C: the reference implementation is the sorting one',
        state.messages.some((m) => m.text.includes('pairs = sorted')),
      )
    }
  }

  console.log('\nOff-script input is not scored:')
  {
    let state = startSession(createSession('two-sum', 'A')).updatedState
    const before = JSON.stringify(state.evidence)
    const result = await scriptedProvider.getNextResponse(
      state,
      'what is the weather like today',
    )
    state = result.updatedState
    truthy(
      'the reply is labelled as demo mode',
      result.assistantMessages.some((m) => m.kind === 'notice'),
    )
    check('no evidence was recorded', JSON.stringify(state.evidence), before)
    check('the scenario did not advance', state.scenarioStep, 0)
  }

  console.log('\nA reference implementation is never substituted:')
  {
    const state = {
      ...startSession(createSession('two-sum', 'A')).updatedState,
      selectedApproach: {
        name: 'Sorting without preserving original indices',
        recognised: true,
        changedFrom: null,
        selectedAtTurn: 0,
      },
    }
    const { referenceFor, referenceUnavailableMessage } = await import(
      '../src/lib/summary'
    )
    check('no code offered for an incorrect approach', referenceFor(state, problem), null)
    truthy(
      'and the tutor says so plainly',
      /do not have a reference implementation/.test(
        referenceUnavailableMessage(state, problem),
      ),
    )
  }
}

/* ------------------------------------------------------------------ *
 * 4. Regressions — each of these reproduced a real observed failure
 * ------------------------------------------------------------------ */

async function regressionChecks() {
  section('REGRESSIONS')

  /* --- 1. Scripted matching was permissive enough to accept nonsense ---- */
  console.log('\n[1] Scripted mode accepts only the scripted line:')
  {
    const fresh = () => startSession(createSession('two-sum', 'A')).updatedState
    const first = SCENARIOS[0].beats[0].input

    const run = async (message: string) => {
      const r = await scriptedProvider.getNextResponse(fresh(), message)
      return {
        step: r.updatedState.scenarioStep,
        approach: r.updatedState.evidence.approach.status,
        justification: r.updatedState.evidence.justification.status,
        notice: r.assistantMessages.some((m) => m.kind === 'notice'),
        quote: r.updatedState.evidence.approach.quotes[0],
      }
    }

    const exact = await run(first)
    check('exact line is accepted', exact.step, 1)

    const formatting = await run(
      `  ${first.replace(/'/g, '\u2019').toUpperCase()}  `,
    )
    check('case, spacing and curly apostrophes are accepted', formatting.step, 1)

    const bare = await run('map')
    check('bare "map" does not advance', bare.step, 0)
    check('bare "map" credits no approach', bare.approach, 'unaddressed')
    check('bare "map" credits no justification', bare.justification, 'unaddressed')
    truthy('bare "map" gets a demo-mode notice', bare.notice)

    const unrelated = await run('what is the weather like today')
    check('unrelated input does not advance', unrelated.step, 0)
    truthy('unrelated input gets a notice', unrelated.notice)

    const contradictory = await run(
      "I would not walk the array and I do not keep a map from each value I've seen to its index",
    )
    check('a negated sentence full of script words is rejected', contradictory.step, 0)
    check('and credits nothing', contradictory.approach, 'unaddressed')

    /* Quotes must come from the submitted message, not the canonical script. */
    const variantBeat = SCENARIOS[1].beats[0]
    let bState = startSession(createSession('two-sum', 'B')).updatedState
    const variant = (variantBeat.accepts ?? [])[1]
    const rv = await scriptedProvider.getNextResponse(bState, variant)
    check('an authored variant is accepted', rv.updatedState.scenarioStep, 1)

    /* Scenario C beat 3 carries quotes; submit it via its canonical line and
       confirm the recorded quote is text the learner actually sent. */
    let cState = startSession(createSession('two-sum', 'C')).updatedState
    for (const beat of SCENARIOS[2].beats.slice(0, 3)) {
      const r = await scriptedProvider.getNextResponse(cState, beat.input)
      cState = r.updatedState
    }
    const recorded = cState.evidence.correctness.quotes[0]
    truthy(
      'recorded quotes appear in the learner message that produced them',
      SCENARIOS[2].beats[2].input.toLowerCase().includes(recorded.toLowerCase()),
    )
  }

  /* --- 2. Changing approach kept evidence for the old one -------------- */
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
      check('an alias resolves to the same approach', after.selectedApproach?.name, 'Hash map lookup')
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

  /* --- 5. Scenario C credited a question as understanding -------------- */
  console.log('\n[5] Asking a question is not demonstrating the answer:')
  {
    const scenarioC = SCENARIOS[2]
    let state = startSession(createSession('two-sum', 'C')).updatedState
    const askIndex = scenarioC.beats.findIndex((b) =>
      b.input.startsWith('would a hash map'),
    )
    for (const beat of scenarioC.beats.slice(0, askIndex + 1)) {
      const r = await scriptedProvider.getNextResponse(state, beat.input)
      state = r.updatedState
    }
    check(
      'the question itself credits nothing',
      state.evidence.comparison.status,
      'unaddressed',
    )

    const follow = await scriptedProvider.getNextResponse(
      state,
      scenarioC.beats[askIndex + 1].input,
    )
    state = follow.updatedState
    check(
      'the follow-up explanation is credited',
      state.evidence.comparison.status,
      'demonstrated',
    )
    check(
      'as supported, since the tutor supplied it',
      state.evidence.comparison.support,
      'after-guidance',
    )

    const tutorText = state.messages.map((m) => m.text).join('\n')
    truthy(
      'the O(1)-space claim is scoped to an already-sorted input',
      /already.{0,3} sorted/i.test(tutorText) && /O\(1\) extra space/.test(tutorText),
    )
    truthy(
      'and the pairs array is named as the O(n) cost',
      /pairs you build|pairs array/i.test(tutorText),
    )
  }
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

async function main() {
  policyChecks()
  evidenceChecks()
  await scenarioChecks()
  await regressionChecks()

  console.log(
    failures === 0
      ? `\nAll ${checks} checks passed.`
      : `\n${failures} of ${checks} checks FAILED.`,
  )
  if (failures > 0) process.exitCode = 1
}

main()
