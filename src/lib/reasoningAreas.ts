import type { Approach, CuratedProblem, ReasoningAreaId } from '../types'

/**
 * The reasoning areas, and the questions and bounded support attached to them.
 *
 * This replaces the old fixed stage script. The difference is not cosmetic:
 * areas are a *record of evidence*, not a queue of questions. Nothing here
 * says what order to ask in — `policy.ts` chooses a focus from whatever is
 * still unresolved and actually relevant to the learner's own approach.
 *
 * Support is generated per approach (see `supportFor`), so a learner who chose
 * nested loops is never hinted towards a hash map, and their complexity
 * feedback is about their approach's cost, not someone else's.
 */

export interface ReasoningArea {
  id: ReasoningAreaId
  /** Checklist label, right-hand panel. */
  label: string
  /** One line: what counts as evidence here. */
  goal: string
  /**
   * `core`        — needed to complete the core activity.
   * `situational` — asked only when a gap or contradiction makes it relevant.
   * `optional`    — never required; offered when it is useful.
   */
  necessity: 'core' | 'situational' | 'optional'
  /** Asked first. Open, learner-led, names nothing. */
  openQuestion: string
  /** Narrower follow-up when the open question did not land. */
  focusedQuestion: string
}

/**
 * The opening move. It asks for the learner's own approach rather than a
 * restatement of the problem: restatement and brute force are scaffolding,
 * introduced only if the learner needs them.
 */
export const OPENING_QUESTION =
  "What approach would you try, and why? If you're unsure, we can work through it together."

export const GREETING = [
  "Hi, I'm LeetUP. I'll help you think through the problem.",
]

export const REASONING_AREAS: ReasoningArea[] = [
  {
    id: 'requirements',
    label: 'Problem requirements',
    goal: 'The details of the problem that actually constrain a solution.',
    necessity: 'situational',
    openQuestion:
      'Which details of the problem actually constrain how you solve it?',
    focusedQuestion:
      'What exactly does the problem ask you to return, and what are you not allowed to do?',
  },
  {
    id: 'approach',
    label: 'Approach',
    goal: 'A concrete approach, explained step by step.',
    necessity: 'core',
    openQuestion: 'How would your approach work, step by step?',
    focusedQuestion:
      'Walk me through it on the example: nums = [2, 7, 11, 15], target = 9. What happens first?',
  },
  {
    id: 'justification',
    label: 'Justification',
    goal: 'Why that approach is a reasonable choice here.',
    /*
     * Asked whenever it is still open (it stays in the focus priority list),
     * but it does not gate completion: a learner who has explained a working
     * approach, tested it, and accounted for its cost has done the core
     * activity. Requiring a separate "and why is that good?" turn on top would
     * be the fixed-syllabus habit this design removes.
     */
    necessity: 'situational',
    openQuestion: 'What makes that a good choice for this problem?',
    focusedQuestion:
      'What does that approach buy you compared with the most obvious thing you could do?',
  },
  {
    id: 'correctness',
    label: 'Correctness & edge cases',
    goal: 'Where the approach could go wrong, and which inputs would show it.',
    necessity: 'core',
    openQuestion:
      'Where could your approach go wrong — which inputs would you want to test it on?',
    focusedQuestion:
      'Think about the values themselves, and about the smallest array the constraints allow. What would you check?',
  },
  {
    id: 'complexity',
    label: 'Time & space cost',
    goal: 'What the chosen approach costs, and why.',
    necessity: 'core',
    openQuestion: 'What does your approach cost — in time, and in extra space?',
    focusedQuestion:
      'Count it rather than recall it: for an array of n elements, how much work does your approach do, and how much extra memory does it hold?',
  },
  {
    id: 'comparison',
    label: 'Comparing approaches',
    goal: 'How the chosen approach compares with an alternative.',
    necessity: 'optional',
    openQuestion: 'How would that compare with a different way of doing it?',
    focusedQuestion:
      'What would you gain, and what would you give up, by switching?',
  },
]

export const AREA_IDS: ReasoningAreaId[] = REASONING_AREAS.map((a) => a.id)

/** Areas that must be demonstrated to complete the core activity. */
export const CORE_AREAS: ReasoningAreaId[] = REASONING_AREAS.filter(
  (a) => a.necessity === 'core',
).map((a) => a.id)

export const getArea = (id: ReasoningAreaId): ReasoningArea =>
  REASONING_AREAS.find((a) => a.id === id)!

/* ------------------------------------------------------------------ *
 * Approach resolution
 * ------------------------------------------------------------------ */

/**
 * Match a learner's words against the curated approach families.
 *
 * The families are reference examples, not a whitelist: an unmatched name is
 * not wrong, it is unrecognised, and the tutor asks the learner to explain it
 * rather than judging it.
 */
export function matchApproach(
  problem: CuratedProblem,
  name: string | null,
): Approach | null {
  if (!name) return null
  const text = name.toLowerCase()

  // An exact name always wins. Alias matching is substring-based, and the
  // families here differ by a qualifier ("sorting WITHOUT preserving…"), so
  // matching on a shared alias first would hand back the wrong approach —
  // and with it, the wrong reference implementation.
  const exact = problem.metadata.validApproaches.find(
    (a) => a.name.toLowerCase() === text,
  )
  if (exact) return exact

  // Otherwise the most specific alias match: longest alias wins.
  let best: Approach | null = null
  let bestLength = 0
  for (const approach of problem.metadata.validApproaches) {
    for (const alias of approach.aliases) {
      if (text.includes(alias) && alias.length > bestLength) {
        best = approach
        bestLength = alias.length
      }
    }
  }
  return best
}

export interface AreaSupport {
  light: string
  stronger: string
  guided: string
}

/**
 * The bounded support ladder for one area, written for one approach.
 *
 * When no approach has been chosen yet, the `approach` area's ladder is where
 * brute force enters the session — as scaffolding for a learner who is stuck,
 * never as a compulsory step for a learner who already has an approach.
 */
export function supportFor(
  area: ReasoningAreaId,
  problem: CuratedProblem,
  approach: Approach | null,
  approachName: string | null,
): AreaSupport {
  const named = approach?.name ?? approachName ?? 'your approach'

  switch (area) {
    case 'requirements':
      return {
        light:
          'Re-read the last line of the statement and the constraints block. There are promises in there, and one prohibition.',
        stronger: `Two of them shape the design: ${problem.metadata.keyRequirements
          .slice(0, 2)
          .join(', and ')}. What about the value ranges — what do they allow that you might have assumed away?`,
        guided: `The requirements that matter here: ${problem.metadata.keyRequirements.join(
          '; ',
        )}. Which of those does your approach have to handle?`,
      }

    case 'approach':
      if (!approach)
        return {
          light:
            'Forget efficiency for a moment. If you had this array written on paper, how would you find the pair by hand?',
          stronger:
            'One workable start: take each number in turn and check it against every number after it. Would that find the right answer, even if it does a lot of work?',
          guided:
            'Here is a correct starting point — the nested-loop approach. For each index i, look at every later index j, and return [i, j] the moment nums[i] + nums[j] equals the target. It is correct, and it does a lot of repeated work. Try it on nums = [2, 7, 11, 15], target = 9 and tell me what it does.',
        }
      return {
        light: `Take it one element at a time. In ${named}, what happens when you look at the first number?`,
        stronger: `Describe the loop: what do you do at each element, and what makes you stop? Use nums = [2, 7, 11, 15], target = 9 if it helps.`,
        guided: `Here is how ${named} runs: ${approach.howItWorks} Can you say back what it does on nums = [2, 7, 11, 15], target = 9?`,
      }

    case 'justification':
      if (!approach)
        return {
          light:
            'Compare it with the most obvious thing you could do. What is different?',
          stronger:
            'A justification answers two things: why it produces the right answer, and what it costs you to run it. Try the first one.',
          guided:
            'A justification has two halves: why the approach always finds the answer when one exists, and what it costs compared with the alternatives. Which half can you give me for your approach?',
        }
      return {
        light: `What does ${named} save you compared with checking every pair by hand?`,
        stronger: `Two halves: why does ${named} always find the pair when one exists, and what does it cost you to get that? Start with either.`,
        guided: `Why ${named} works: ${approach.whyItWorks} Does that match what you had in mind, or were you thinking of it differently?`,
      }

    case 'correctness':
      if (!approach)
        return {
          light: `What kind of input would make you nervous about your approach?`,
          stronger: `Think about repeated values, negative values, and the smallest array the constraints allow.`,
          guided: `The inputs worth testing on this problem: ${problem.metadata.edgeCases.join(
            '; ',
          )}. Which of those would be most awkward for your approach?`,
        }
      return {
        light: `Is there an input where ${named} would return the wrong thing, or nothing at all?`,
        stronger: `Two angles: the values themselves (repeats, negatives), and whether ${named} could ever pair an element with itself.`,
        guided: `For ${named} specifically: ${approach.correctnessNotes} The general ones to test: ${problem.metadata.edgeCases.join(
          '; ',
        )}.`,
      }

    case 'complexity':
      if (!approach)
        return {
          light:
            'Count rather than recall. For n elements, how many times does your approach look at an element?',
          stronger:
            'Time first: how many operations for an array of n elements? Then space: how much extra memory are you holding while it runs?',
          guided:
            'Cost has two halves: how the work grows with n, and how much extra memory you hold. I need to know which approach you settled on before I can give you the figures for it.',
        }
      return {
        light: `Count rather than recall. In ${named}, how many times do you look at each element?`,
        stronger: `You are after two figures for ${named}: how the work grows with n, and how much extra memory it holds while running.`,
        guided: `${named} is ${approach.timeComplexity} time and ${approach.spaceComplexity} extra space. ${approach.complexityRationale} Can you say why the time figure comes out that way?`,
      }

    case 'comparison':
      return {
        light: `What would a different approach give you that ${named} does not?`,
        stronger: `Compare on two axes: how fast it runs, and how much extra memory it needs.`,
        guided: `The families worth comparing here:\n${problem.metadata.validApproaches
          .filter((a) => a.correctness !== 'incorrect')
          .map(
            (a) =>
              `• ${a.name} — ${a.timeComplexity} time, ${a.spaceComplexity} space. ${a.tradeoff}`,
          )
          .join('\n')}`,
      }
  }
}
