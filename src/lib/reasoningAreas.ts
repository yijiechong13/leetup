import type { ReasoningAreaId } from '../types'

/** Shared reasoning rubric. The LLM creates guidance for the learner algorithm. */

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
  "What approach would you try, and why? You can explain it or share code, even an unfinished attempt."

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
    goal: 'A concrete approach expressed through steps, code, or both.',
    necessity: 'core',
    openQuestion: 'How would your approach work, step by step?',
    focusedQuestion:
      'Walk me through it on the example: nums = [2, 7, 11, 15], target = 9. What happens first?',
  },
  {
    id: 'justification',
    label: 'Justification',
    goal: 'Why that approach is a reasonable choice here.',
    necessity: 'core',
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
