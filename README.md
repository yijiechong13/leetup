# LeetUP

LeetUP helps computing students practise explaining algorithmic decisions. In a guided conversation about a coding problem, learners propose an approach, justify it, consider correctness and edge cases, and explain its time and space costs. LeetUP asks follow-up questions and offers progressively stronger hints when needed. The current problem is [Two Sum](https://leetcode.com/problems/two-sum/); correct slower approaches are accepted when learners can explain them.

## Set up and run

1. Install Node.js 22 or newer and run `npm install`.
2. Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY` to your Anthropic API key.
3. Run `npm run dev` and open the local URL printed in the terminal.

LeetUP uses Anthropic's Messages API and Claude Sonnet 5.5 (`claude-sonnet-5-5`) by default. If you need a different Claude model, set `ANTHROPIC_MODEL` in `.env`. The local API server keeps the key out of browser code. `.env` is excluded from Git. To check a production build locally, run `npm run build` followed by `npm run preview`.

## Sharing an attempt

Learners can send explanations, code, or both. Code mode preserves indentation and displays the attempt as a code block. In code mode, Enter inserts a newline and Cmd/Ctrl+Enter sends; in text mode, Shift+Enter inserts a newline. Markdown code fences also work in text mode.

Code can demonstrate a concrete approach, but learners still need to explain their choices, correctness, edge cases, and complexity. LeetUP can discuss and manually trace code; it does not execute it. Learners may run their attempts in their own editor.

## How it works

The learner is the person typing in the chat. For each learner message, LeetUP calls Claude once to assess the learner's reasoning. Its policy code checks the evidence and decides which area to address and how much help to give. A second Claude call writes LeetUP's next reply. The policy controls checklist completion and reference-code release. Once the required reasoning is demonstrated, LeetUP can generate reference code matching the learner’s recorded algorithm. Approaches are not selected from a fixed list. The model assesses correctness against the problem and reasoning rubric; its judgments and generated code still require evaluation.

- `src/data/problemBank.ts`: Two Sum statement, examples, constraints, and problem context.
- `src/lib/llmProvider.ts`: rubric assessment, learner-specific hints, and gated reference-code generation.
- `src/lib/policy.ts`: evidence validation, hint sequence, and tutoring decisions.
- `src/lib/session.ts` and `src/lib/applyDecision.ts`: checklist and session state.
- `src/lib/summary.ts`: feedback derived from the evidence and support record.
- `src/lib/llmClient.ts`: browser requests to the local API.
- `server/api.mjs`: local API that calls Anthropic.

Run `npm run build`, `npm run lint`, and `npm run simulate` to check the implementation.

Useful partial answers receive ordinary follow-up questions. Hint escalation depends on confusion or lack of progress, rather than total conversation length. Earlier assistance remains recorded even after the learner starts making progress. Known solutions in `scripts/fixtures/approaches.ts` are offline evaluation material, not part of the live tutoring flow.
