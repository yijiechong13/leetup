import type { ChatMessage, ReasoningAreaId } from '../types'
import type { EvidenceUpdate } from './session'

/**
 * Scripted demo scenarios.
 *
 * These exist so the adaptive behaviour can be shown without an API key. They
 * are *demonstrations*, not language understanding: each beat expects a
 * specific learner input, and anything else gets an honest off-script notice
 * rather than being scored. Nothing here is presented as live assessment.
 *
 * The evidence updates are authored per beat, including the support level, so
 * the checklist tells the truth about how each area was reached.
 */

export interface ScenarioBeat {
  /** The learner input this beat expects. Printed in the README and the UI. */
  input: string
  /**
   * Extra phrasings this beat also accepts, compared in canonical form.
   * Matching is exact against one of these — not fuzzy — so an incomplete or
   * contradictory message can never be mistaken for one of them.
   */
  accepts?: string[]
  /** Omitted when `summarise` or `reference` generates the turn instead. */
  replies?: { text: string; kind?: ChatMessage['kind'] }[]
  focus: ReasoningAreaId | null
  /** Approach to record on this beat. */
  approach?: string
  evidence?: EvidenceUpdate[]
  /** Absolute attention values, so support levels stay honest. */
  attention?: Partial<Record<ReasoningAreaId, number>>
  /** Absolute assistance values: 1 light hint, 2 stronger, 3 guided. */
  assistance?: Partial<Record<ReasoningAreaId, number>>
  /** Replace `replies` with the summary generated from the evidence record. */
  summarise?: boolean
  /** Replace `replies` with the reference implementation for the approach. */
  reference?: boolean
  complete?: boolean
}

export interface Scenario {
  id: string
  label: string
  blurb: string
  beats: ScenarioBeat[]
}

export const SCENARIOS: Scenario[] = [
  /* ---------------------------------------------------------------- *
   * A — a justified approach offered up front
   * ---------------------------------------------------------------- */
  {
    id: 'A',
    label: 'A — An existing approach',
    blurb:
      'The learner brings a hash-map approach and refines it through Socratic follow-ups. No brute-force detour is imposed, and questions are not counted as help.',
    beats: [
      {
        input:
          "I think I'd use a hash map. As I go through the array, I'd store each number and its index. Then I can check whether the number I need is already there.",
        approach: 'Hash map lookup',
        focus: 'approach',
        attention: { approach: 2 },
        evidence: [
          {
            area: 'approach',
            status: 'partial',
            support: 'independent',
            quote: "As I go through the array, I'd store each number and its index",
            gap: 'how you work out which number you are looking for',
          },
        ],
        replies: [{ text: 'How would you work out which number you need?' }],
      },
      {
        input:
          "Target minus the current number. So if the target is 9 and I'm looking at 7, I need 2. If I've already stored 2, I can return its index and the index of 7.",
        focus: 'correctness',
        attention: { correctness: 1 },
        evidence: [
          {
            area: 'approach',
            status: 'demonstrated',
            support: 'independent',
            quote: 'Target minus the current number',
            gap: null,
          },
        ],
        replies: [
          { text: 'That explains how you find the pair.', kind: 'feedback' },
          {
            text: 'What inputs would you test to check that your approach works correctly, and why?',
          },
        ],
      },
      {
        input: 'Maybe [3, 3] with a target of 6, since both numbers are the same.',
        focus: 'correctness',
        attention: { correctness: 2 },
        evidence: [
          {
            area: 'correctness',
            status: 'partial',
            support: 'independent',
            quote: '[3, 3] with a target of 6, since both numbers are the same',
            gap: 'what your map holds as those two values go through it',
          },
        ],
        replies: [
          {
            text: 'Walk me through what your map would contain as you process those two numbers.',
          },
        ],
      },
      {
        input:
          "At the first 3, the map is empty, so I store 3 with index 0. At the second 3, I look for another 3. It's in the map, so I return 0 and 1.",
        focus: 'correctness',
        attention: { correctness: 3 },
        evidence: [
          {
            area: 'correctness',
            status: 'partial',
            support: 'independent',
            quote: 'At the first 3, the map is empty, so I store 3 with index 0',
            gap: 'why the order of checking and inserting matters',
          },
        ],
        replies: [
          {
            text: 'What would happen if you inserted the current number before checking for its match?',
          },
        ],
      },
      {
        input:
          "Oh, then the first 3 could find itself. I might return 0 and 0. So I need to check first, then add the number if I haven't found a match.",
        focus: 'complexity',
        attention: { complexity: 1 },
        evidence: [
          {
            area: 'correctness',
            status: 'demonstrated',
            support: 'independent',
            quote:
              'then the first 3 could find itself. I might return 0 and 0. So I need to check first',
            gap: null,
          },
        ],
        replies: [
          {
            text: 'Right—that keeps you from using the same element twice.',
            kind: 'feedback',
          },
          {
            text: 'How much time would your approach take as the array gets larger?',
          },
        ],
      },
      {
        input: 'O(n), I think, because I only go through the array once.',
        focus: 'complexity',
        attention: { complexity: 2 },
        evidence: [
          {
            area: 'complexity',
            status: 'partial',
            support: 'independent',
            quote: 'O(n), I think, because I only go through the array once',
            gap: 'what each step inside that pass costs',
          },
        ],
        replies: [{ text: 'What work happens inside that pass?' }],
      },
      {
        input:
          "I check the map and add a number if there's no match. Those operations are O(1) on average, so doing them for n numbers gives O(n) average time.",
        focus: 'complexity',
        attention: { complexity: 3 },
        evidence: [
          {
            area: 'complexity',
            status: 'partial',
            support: 'independent',
            quote:
              'Those operations are O(1) on average, so doing them for n numbers gives O(n) average time',
            gap: 'the extra memory the map holds',
          },
        ],
        replies: [{ text: 'And how much extra memory would you need?' }],
      },
      {
        input:
          'The map could end up storing almost all the numbers and their indices. So that would be O(n) extra space.',
        focus: null,
        evidence: [
          {
            area: 'complexity',
            status: 'demonstrated',
            support: 'independent',
            quote:
              'The map could end up storing almost all the numbers and their indices. So that would be O(n) extra space',
            gap: null,
          },
        ],
        summarise: true,
        complete: true,
      },
      {
        input: 'show me the code',
        accepts: [
          'show me the code',
          'yes',
          'yes please',
          'show the code',
          'can I see the code',
        ],
        focus: null,
        reference: true,
        complete: true,
      },
    ],
  },

  /* ---------------------------------------------------------------- *
   * B — uncertain start, staged assistance
   * ---------------------------------------------------------------- */
  {
    id: 'B',
    label: 'B — An uncertain start',
    blurb:
      'The learner starts with no approach and asks to be told the answer. Help escalates light hint → stronger hint → guided explanation, and the record shows which areas needed it.',
    beats: [
      {
        input: "I'm not sure. I don't really know where to start.",
        accepts: [
          "I'm not sure. I don't really know where to start.",
          "I'm not sure, I don't really know where to start.",
          "I don't know where to start",
        ],
        focus: 'approach',
        attention: { approach: 2 },
        assistance: { approach: 1 },
        replies: [
          {
            text: "Let's start small. If you had `[2, 7, 11, 15]` written on paper, how would you find two numbers that add up to 9?",
            kind: 'hint',
          },
        ],
      },
      {
        input: 'I guess I could try adding two numbers at a time?',
        focus: 'approach',
        approach: 'Nested loops',
        attention: { approach: 3 },
        evidence: [
          {
            area: 'approach',
            status: 'partial',
            support: 'after-hints',
            quote: 'I could try adding two numbers at a time',
            gap: 'which pairs you check, and in what order',
          },
        ],
        replies: [
          { text: "That's a starting point. Which pair would you check first?" },
        ],
      },
      {
        input: "2 and 7. They add up to 9, so I'd return indices 0 and 1.",
        focus: 'approach',
        attention: { approach: 4 },
        replies: [
          { text: "Suppose the first pair didn't match. How would you continue?" },
        ],
      },
      {
        input:
          "I'd try 2 with 11, then 2 with 15. After that, I'd try 7 with 11 and 15, and keep going like that.",
        focus: 'justification',
        attention: { justification: 1 },
        evidence: [
          {
            area: 'approach',
            status: 'demonstrated',
            support: 'after-hints',
            quote: "I'd try 2 with 11, then 2 with 15. After that, I'd try 7 with 11 and 15",
            gap: null,
          },
        ],
        replies: [
          {
            text: "You've described a way to check the pairs.",
            kind: 'feedback',
          },
          { text: 'Why would that find the answer if one exists?' },
        ],
      },
      {
        input: "I'm not sure how to explain it. I'd just keep checking?",
        focus: 'justification',
        attention: { justification: 2 },
        assistance: { justification: 1 },
        replies: [
          {
            text: 'Think about the two numbers that make the target. Would your process eventually check that pair?',
            kind: 'hint',
          },
        ],
      },
      {
        input:
          "Yes, because I'm trying every pair. So I'd reach it eventually.",
        focus: 'correctness',
        attention: { correctness: 1 },
        evidence: [
          {
            area: 'justification',
            status: 'demonstrated',
            support: 'after-hints',
            quote: "because I'm trying every pair. So I'd reach it eventually",
          },
        ],
        replies: [
          { text: 'Exactly.', kind: 'feedback' },
          {
            text: 'What inputs would you test to check that your approach handles different cases?',
          },
        ],
      },
      {
        input: "I don't know. Can you just tell me?",
        focus: 'correctness',
        attention: { correctness: 2 },
        assistance: { correctness: 1 },
        replies: [
          {
            text: "Here's a small hint: the example has different, positive numbers. What might change if the numbers weren't all different?",
            kind: 'hint',
          },
        ],
      },
      {
        input: "You mean repeated numbers? I'm still not sure what to check.",
        focus: 'correctness',
        attention: { correctness: 3 },
        assistance: { correctness: 2 },
        replies: [
          {
            text: 'Try `[3, 3]` with target 6. There are two 3s at different indices. How could your loops avoid using the same index twice?',
            kind: 'hint',
          },
        ],
      },
      {
        input: "I'm still confused. Can you explain it?",
        focus: 'correctness',
        attention: { correctness: 4 },
        assistance: { correctness: 3 },
        replies: [
          {
            text: 'For an element at index `i`, start the second loop at `i + 1`. That checks only later elements. With `[3, 3]`, you check indices 0 and 1, rather than pairing index 0 with itself. What would happen if the second loop started at `i` instead?',
            kind: 'reveal',
          },
        ],
      },
      {
        input:
          'It could use the first 3 twice and return 0 and 0. Starting at the next index avoids that.',
        focus: 'complexity',
        attention: { complexity: 1 },
        evidence: [
          {
            area: 'correctness',
            status: 'demonstrated',
            support: 'after-guidance',
            quote:
              'It could use the first 3 twice and return 0 and 0. Starting at the next index avoids that',
          },
        ],
        replies: [
          {
            text: 'Right. That checks why the two indices must be different.',
            kind: 'feedback',
          },
          {
            text: "Now let's consider efficiency. If there are four numbers and no match is found until the last pair, how many pairs would you check?",
          },
        ],
      },
      {
        input: 'Is it four? Because there are four numbers?',
        focus: 'complexity',
        attention: { complexity: 2 },
        assistance: { complexity: 1 },
        replies: [
          {
            text: 'Count the pairs for each starting position. The first number has three later numbers to try. How many does the second have?',
            kind: 'hint',
          },
        ],
      },
      {
        input: "Two. Then the third has one. So that's 3 plus 2 plus 1—six pairs.",
        focus: 'complexity',
        attention: { complexity: 3 },
        assistance: { complexity: 2 },
        replies: [
          {
            text: 'Yes. For n numbers, the count becomes `(n − 1) + (n − 2) + … + 1`. That equals `n(n − 1)/2`. Which term grows fastest when you expand it?',
            kind: 'hint',
          },
        ],
      },
      {
        input: 'The n squared term. So is the time complexity O(n squared)?',
        focus: 'complexity',
        attention: { complexity: 4 },
        evidence: [
          {
            area: 'complexity',
            status: 'partial',
            support: 'after-hints',
            quote: 'The n squared term. So is the time complexity O(n squared)?',
            gap: 'the extra space the approach holds',
          },
        ],
        replies: [
          { text: 'Yes—O(n²) in the worst case.', kind: 'feedback' },
          {
            text: 'What extra information does your algorithm store while checking pairs?',
          },
        ],
      },
      {
        input: "Just the two indices and maybe the sum. I don't need another array.",
        focus: 'complexity',
        attention: { complexity: 5 },
        replies: [
          {
            text: 'Does the number of those variables grow when the input gets larger?',
          },
        ],
      },
      {
        input: 'No, it stays the same. So the extra space is O(1).',
        focus: null,
        evidence: [
          {
            area: 'complexity',
            status: 'demonstrated',
            support: 'after-hints',
            quote: 'No, it stays the same. So the extra space is O(1)',
            gap: null,
          },
        ],
        summarise: true,
        complete: true,
      },
      {
        input: 'show me the code',
        accepts: [
          'show me the code',
          'yes',
          'yes please',
          'show the code',
          'can I see the code',
        ],
        focus: null,
        reference: true,
        complete: true,
      },
    ],
  },

  /* ---------------------------------------------------------------- *
   * C — sorting with original-index tracking
   * ---------------------------------------------------------------- */
  {
    id: 'C',
    label: 'C — Repairing an approach',
    blurb:
      'The learner proposes sorting with two pointers, hits the lost-indices flaw on a counterexample, and repairs their own approach. The repair is recorded as reached with a prompt, not unaided.',
    beats: [
      {
        input:
          "I'd sort the array and use two pointers. When the numbers add up to the target, I'd return the two pointer positions.",
        approach: 'Sorting without preserving original indices',
        focus: 'approach',
        attention: { approach: 2 },
        assistance: { approach: 1 },
        evidence: [
          {
            area: 'approach',
            status: 'partial',
            support: 'after-hints',
            quote: "I'd sort the array and use two pointers",
            gap: 'whether the positions you return are positions in the original array',
          },
        ],
        replies: [
          {
            text: "Let's try that with `[3, 2, 4]` and target `6`. What would your sorted array look like, and which positions would you return?",
            kind: 'hint',
          },
        ],
      },
      {
        input: "It becomes `[2, 3, 4]`. Then 2 and 4 add up to 6, so I'd return 0 and 2.",
        accepts: [
          "It becomes `[2, 3, 4]`. Then 2 and 4 add up to 6, so I'd return 0 and 2.",
          "It becomes [2, 3, 4]. Then 2 and 4 add up to 6, so I'd return 0 and 2.",
        ],
        focus: 'approach',
        attention: { approach: 3 },
        replies: [
          {
            text: 'What numbers are at positions 0 and 2 in the original array?',
          },
        ],
      },
      {
        input:
          "3 and 4. Oh, those don't add up to 6. The positions changed when I sorted it.",
        focus: 'approach',
        attention: { approach: 4 },
        evidence: [
          {
            area: 'correctness',
            status: 'partial',
            support: 'after-hints',
            quote: 'The positions changed when I sorted it',
            gap: 'how to keep the sort and still report the original positions',
          },
          {
            area: 'requirements',
            status: 'demonstrated',
            support: 'after-hints',
            quote: "those don't add up to 6",
          },
        ],
        replies: [
          {
            text: 'How could you keep your sorting approach while still returning the original positions?',
          },
        ],
      },
      {
        input: 'Maybe store the original index with each number before sorting?',
        approach: 'Sorting with original-index tracking',
        focus: 'approach',
        attention: { approach: 5 },
        evidence: [
          {
            area: 'approach',
            status: 'partial',
            support: 'after-hints',
            quote: 'store the original index with each number before sorting',
            gap: 'how those pairs travel through the sort and back out',
          },
        ],
        replies: [{ text: 'Walk me through that using the same example.' }],
      },
      {
        input:
          "Before sorting, I'd have `(3, 0)`, `(2, 1)`, and `(4, 2)`. After sorting, I'd have `(2, 1)`, `(3, 0)`, and `(4, 2)`. When I find 2 and 4, I return their stored indices, 1 and 2.",
        focus: 'justification',
        attention: { justification: 1 },
        evidence: [
          {
            area: 'approach',
            status: 'demonstrated',
            support: 'after-hints',
            quote: 'When I find 2 and 4, I return their stored indices, 1 and 2',
            gap: null,
          },
        ],
        replies: [
          { text: 'That fixes the index problem.', kind: 'feedback' },
          {
            text: 'Why can you move the left pointer forward when the sum is too small?',
          },
        ],
      },
      {
        input:
          "The right pointer is already at the biggest number still available. If the sum is too small, a smaller right number won't help. I need a bigger left number.",
        focus: 'correctness',
        attention: { correctness: 1 },
        evidence: [
          {
            area: 'justification',
            status: 'demonstrated',
            support: 'independent',
            quote:
              "If the sum is too small, a smaller right number won't help. I need a bigger left number",
          },
        ],
        replies: [
          { text: 'And how would you avoid using the same element twice?' },
        ],
      },
      {
        input:
          "I'd only check while the left pointer is before the right pointer. Once they meet, I stop.",
        focus: 'complexity',
        attention: { complexity: 1 },
        evidence: [
          {
            area: 'correctness',
            status: 'demonstrated',
            support: 'after-hints',
            quote:
              "I'd only check while the left pointer is before the right pointer",
            gap: null,
          },
        ],
        replies: [
          {
            text: 'What are the time and extra-space costs of your revised approach?',
          },
        ],
      },
      {
        input:
          "Sorting takes O(n log n), then the pointer scan takes O(n). So overall it's O(n log n). Keeping the value-index pairs takes O(n) extra space.",
        focus: null,
        evidence: [
          {
            area: 'complexity',
            status: 'demonstrated',
            support: 'independent',
            quote:
              "Sorting takes O(n log n), then the pointer scan takes O(n). So overall it's O(n log n)",
          },
        ],
        summarise: true,
        complete: true,
      },
      {
        input: 'show me the code',
        accepts: [
          'show me the code',
          'yes',
          'yes please',
          'show the code',
          'can I see the code',
        ],
        focus: null,
        reference: true,
        complete: true,
      },
      {
        /* Optional tail beyond the walkthrough: asking a question is not
           demonstrating the answer, so this beat records NO understanding. */
        input: 'would a hash map have been better?',
        accepts: [
          'would a hash map have been better?',
          'is a hash map better?',
          'would a hash map be better?',
        ],
        focus: 'comparison',
        attention: { comparison: 1 },
        assistance: { comparison: 3 },
        complete: true,
        replies: [
          {
            text: 'Faster on average — O(n) rather than O(n log n) — for the same O(n) extra space. But "better" depends on what you want: yours makes no hash assumptions, so O(n log n) is a genuine worst case rather than an average that degrades on adversarial input.',
            kind: 'feedback',
          },
          {
            text: 'One caveat on space, since it is easy to over-claim: your O(n) is the array of (value, index) pairs you build, and that is unavoidable in your implementation. A two-pointer scan can run in O(1) extra space, but only on input that is *already* sorted and where the positions you must report are positions in that sorted array. Neither is true here.',
            kind: 'feedback',
          },
          { text: 'Given that, how would you decide between the two?' },
        ],
      },
      {
        /* The learner explains the trade-off back. Recorded as supported,
           because the tutor supplied the explanation. */
        input:
          'I would take the hash map if average speed is what matters, and mine if I wanted a guaranteed bound — but the O(n) space is the same either way, because I still have to build the pairs array.',
        focus: null,
        evidence: [
          {
            area: 'comparison',
            status: 'demonstrated',
            support: 'after-guidance',
            quote:
              'I would take the hash map if average speed is what matters, and mine if I wanted a guaranteed bound',
          },
        ],
        complete: true,
        replies: [
          {
            text: 'That is the trade-off stated properly, including the part people usually get wrong about the space.',
            kind: 'feedback',
          },
        ],
      },
    ],
  },
]

export const getScenario = (id: string | null): Scenario =>
  SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0]

export const DEFAULT_SCENARIO_ID = SCENARIOS[0].id
