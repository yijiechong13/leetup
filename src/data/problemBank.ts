import type { CuratedProblem } from '../types'

/** Problem statements and rubric context. No prescribed solution paths. */
export const problemBank: CuratedProblem[] = [
  {
    id: 'two-sum',
    title: 'Two Sum',
    difficulty: 'Easy',
    statement:
      'You are given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target. You may assume that each input would have exactly one solution, and you may not use the same element twice. You can return the answer in any order.',
    examples: [
      {
        input: 'nums = [2,7,11,15], target = 9',
        output: '[0,1]',
        explanation: 'The sum of nums[0] and nums[1] is 2 + 7 = 9, which equals the target. Therefore, the indices [0, 1] are returned.',
      },
      {
        input: 'nums = [3,2,4], target = 6',
        output: '[1,2]',
        explanation: 'The sum of nums[1] and nums[2] is 2 + 4 = 6, which equals the target. Therefore, the indices [1, 2] are returned.',
      },
      {
        input: 'nums = [3,3], target = 6',
        output: '[0,1]',
        explanation: 'The sum of nums[0] and nums[1] is 3 + 3 = 6, which equals the target. Therefore, the indices [0, 1] are returned.',
      },
    ],
    constraints: [
      '2 <= nums.length <= 10^4',
      '-10^9 <= nums[i] <= 10^9',
      '-10^9 <= target <= 10^9',
      'Only one valid answer exists.',
    ],
    followUp: 'Can you come up with an algorithm that is less than O(n^2) time complexity?',
    metadata: {
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
