import type { CuratedProblem } from '../types'

/**
 * Curated problem bank.
 *
 * LeetUP deliberately does NOT integrate with LeetCode or fetch anything at
 * runtime. These are curated, LeetCode-style problems written for this
 * prototype.
 *
 * `validApproaches` carries the weight. Each entry is a *reference example* of
 * an approach family — not a whitelist of acceptable answers — and each one
 * carries its own prose for how it works, why it works, what to watch out for
 * and where its cost comes from. That is what lets hints, guided explanations,
 * summaries and reference code be generated for the learner's own approach
 * instead of steering everyone towards one target.
 */
export const problemBank: CuratedProblem[] = [
  {
    id: 'two-sum',
    title: 'Two Sum',
    difficulty: 'Easy',
    statement:
      'Given an array of integers nums and an integer target, return the indices of two numbers such that they add up to target. You may assume each input has exactly one solution, and you may not use the same element twice.',
    example: {
      input: 'nums = [2, 7, 11, 15], target = 9',
      output: '[0, 1]',
      explanation: 'nums[0] + nums[1] == 9, so the answer is [0, 1].',
    },
    constraints: [
      '2 <= nums.length <= 10^4',
      '-10^9 <= nums[i] <= 10^9',
      '-10^9 <= target <= 10^9',
      'Exactly one valid answer exists.',
    ],
    metadata: {
      validApproaches: [
        {
          name: 'Nested loops',
          role: 'baseline',
          correctness: 'correct',
          timeComplexity: 'O(n^2)',
          spaceComplexity: 'O(1)',
          tradeoff:
            'Simple and correct, and holds no extra memory — but it re-checks pairs it has already ruled out.',
          aliases: [
            'nested loop',
            'nested loops',
            'two loops',
            'double loop',
            'brute force',
            'bruteforce',
            'check every pair',
            'all pairs',
            'every pair',
            'quadratic',
          ],
          howItWorks:
            'for each index i, scan every later index j and return [i, j] as soon as nums[i] + nums[j] equals the target. Starting j after i is what stops an element pairing with itself.',
          whyItWorks:
            'it examines every pair exactly once, so if a pair summing to the target exists, it cannot be missed. It needs no extra memory because it never stores anything about the elements it has already seen.',
          correctnessNotes:
            'the j > i bound is what keeps an element from being used twice. Duplicate and negative values are handled without any special case, because values are only ever compared by addition.',
          complexityRationale:
            'the outer loop runs n times and the inner loop runs up to n times for each, which is about n(n-1)/2 pairs — quadratic in n. Nothing is stored between iterations, so extra space is constant.',
          referenceSolution: `def two_sum(nums, target):
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):   # j > i: never reuse an element
            if nums[i] + nums[j] == target:
                return [i, j]
    return []                                # unreachable: exactly one answer exists`,
        },
        {
          name: 'Hash map lookup',
          role: 'target-optimized',
          correctness: 'correct',
          timeComplexity: 'O(n) average',
          spaceComplexity: 'O(n)',
          tradeoff:
            'Trades extra memory for speed: it remembers what it has already seen so it never rescans.',
          aliases: [
            'hash map',
            'hashmap',
            'hash table',
            'hashtable',
            'dictionary',
            'dict',
            'map',
            'complement',
            'one pass',
            'single pass',
          ],
          howItWorks:
            'walk the array once, holding a map from value to the index it was seen at. At each element, look up target - value; if it is already in the map, the answer is that stored index and the current one. Otherwise store the current value and index and continue.',
          whyItWorks:
            'every pair has a later element, and by the time you reach that later element its partner is already in the map — so one pass is enough. Checking the map before inserting the current value is what stops an element pairing with itself.',
          correctnessNotes:
            'checking before inserting matters: insert first and an element can match itself. Storing value -> index (rather than a set of values) is what makes it possible to return indices at all. Duplicate values are fine — a later duplicate overwrites an earlier index, but the pair is found before that matters.',
          complexityRationale:
            'one pass of n elements, each doing an average O(1) map lookup and insert, gives O(n) time on average. The map holds up to n entries, so O(n) extra space. Hash lookups are constant on average, not in the worst case.',
          referenceSolution: `def two_sum(nums, target):
    seen = {}                      # value -> index
    for i, value in enumerate(nums):
        complement = target - value
        if complement in seen:     # complement came BEFORE i, so never reused
            return [seen[complement], i]
        seen[value] = i
    return []                      # unreachable: exactly one answer exists`,
        },
        {
          name: 'Sorting with original-index tracking',
          role: 'conditionally-correct',
          correctness: 'conditionally-correct',
          timeComplexity: 'O(n log n)',
          spaceComplexity: 'O(n)',
          tradeoff:
            'Slower than the hash map and needs the same extra memory, but it holds no hash assumptions and its worst case is not just an average.',
          aliases: [
            'sort',
            'sorting',
            'two pointer',
            'two pointers',
            'two-pointer',
            'sorted',
            'index tracking',
            'pair with index',
          ],
          condition:
            'the original index of each value must be preserved before sorting, or recovered afterwards',
          howItWorks:
            'pair each value with its original index, sort the pairs by value, then walk two pointers inwards from both ends: if the pair sums too high move the right pointer left, too low move the left pointer right. When they sum to the target, report the two stored original indices.',
          whyItWorks:
            'sorting makes the sum monotonic along the array, so each pointer move rules out a whole set of pairs without checking them. Carrying the original index alongside each value is what lets the answer be reported in the input\'s own coordinates.',
          correctnessNotes:
            'this is correct precisely as long as the original indices travel with the values. It fails only if you sort the raw values and then report positions in the sorted array — the values would be right and the indices wrong. Pairing value with index first, or sorting an array of indices by their values, both avoid that.',
          complexityRationale:
            'the sort dominates at O(n log n); the two-pointer scan afterwards is a single O(n) pass. The array of (value, index) pairs is O(n) extra space.',
          referenceSolution: `def two_sum(nums, target):
    pairs = sorted((value, i) for i, value in enumerate(nums))
    lo, hi = 0, len(pairs) - 1
    while lo < hi:
        total = pairs[lo][0] + pairs[hi][0]
        if total == target:
            return sorted([pairs[lo][1], pairs[hi][1]])   # ORIGINAL indices
        if total < target:
            lo += 1
        else:
            hi -= 1
    return []`,
        },
        {
          name: 'Sorting without preserving original indices',
          role: 'alternative',
          correctness: 'incorrect',
          timeComplexity: 'O(n log n)',
          spaceComplexity: 'O(1) or O(n)',
          tradeoff:
            'Finds the right pair of values, but cannot report where they came from.',
          aliases: ['sort the values', 'sort then two pointers on values'],
          howItWorks:
            'sort the raw values, then two-pointer inwards to find a pair summing to the target.',
          whyItWorks:
            'it does find the correct pair of values — the flaw is in the output, not the search.',
          correctnessNotes:
            'the positions reported belong to the sorted array, not the input, so the returned indices are generally wrong. This is a fixable flaw, not a dead end: preserve the index mapping and it becomes the conditionally-correct approach above.',
          complexityRationale:
            'the sort dominates at O(n log n), with the two-pointer scan a single O(n) pass afterwards.',
          notes:
            'The classic near-miss: right pair of values, wrong pair of indices.',
          // No referenceSolution on purpose: there is no correct implementation
          // of an approach that cannot produce the required output. The tutor
          // says so rather than quietly handing over a different approach.
        },
      ],
      keyRequirements: [
        'the answer is a pair of original indices, not the two values',
        'the same element may not be used twice',
        'exactly one valid answer is guaranteed to exist',
        'values may be negative or repeated, and the array holds at least two',
      ],
      commonMisconceptions: [
        'sorting the raw values and then reporting positions from the sorted array, which loses the mapping back to the original indices',
        'using a set of seen values rather than a value -> index map, which cannot report where the partner was',
        'inserting the current value before checking for its complement, which lets an element pair with itself',
        'assuming values are unique, or assuming they are all positive',
        'treating average O(1) hash lookup as a worst-case guarantee',
      ],
      edgeCases: [
        'duplicate values in the array',
        'a target formed by two equal values at different indices',
        'negative numbers',
        'the minimum array size, n = 2',
      ],
      targetConcepts: [
        'trading extra space for reduced time',
        'reading complexity off the structure of an algorithm rather than recalling it',
        'distinguishing correctness from efficiency',
        'preserving what the problem actually asks you to return',
      ],
    },
  },
]

export const getProblem = (id: string): CuratedProblem =>
  problemBank.find((p) => p.id === id) ?? problemBank[0]

export const defaultProblemId = problemBank[0].id
