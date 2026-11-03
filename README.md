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

![LeetUP architecture](docs/architecture.png)

The learner is the person typing in the chat. For each learner message, LeetUP calls Claude once to assess the learner's reasoning. Its policy code checks the evidence and decides which area to address and how much help to give. A second Claude call writes LeetUP's next reply. The policy controls checklist completion and reference-code release. Once the required reasoning is demonstrated, LeetUP can generate reference code matching the learner’s recorded algorithm. Approaches are not selected from a fixed list. The model assesses correctness against the problem and reasoning rubric; its judgments and generated code still require evaluation.

- `src/data/problemBank.ts`: Two Sum statement, examples, constraints, and problem context.
- `src/lib/llmProvider.ts`: rubric assessment, learner-specific hints, and gated reference-code generation.
- `src/lib/policy.ts`: evidence validation, hint sequence, and tutoring decisions.
- `src/types.ts`: the `SessionState` shape shown in the diagram.
- `src/lib/session.ts` and `src/lib/applyDecision.ts`: checklist and session state.
- `src/lib/summary.ts`: feedback derived from the evidence and support record.
- `src/lib/llmClient.ts`: browser requests to the local API.
- `src/lib/exportLog.ts`: Export MD / JSON buttons; each turn's assessment and policy decision, for test logs.
- `server/api.mjs`: local API that calls Anthropic.

### Session state

`SessionState` in `src/types.ts` is the record the policy reads and the Update step writes. Entity names group its fields by purpose; field names match the code. DG1–DG3 are the design goals: scaffold productive struggle while reducing drop-off (DG1), make learner reasoning explicit (DG2), and adapt support to individual reasoning gaps (DG3).

| Entity | Field | What it stores | Why it is needed |
|---|---|---|---|
| **Evidence**<br>(one per reasoning area) | `status` | Whether the learner has explained this area:<br>i. unaddressed (not yet)<br>ii. partial (started, something missing)<br>iii. demonstrated (fully explained)<br>iv. revisit (was explained, but a later reply contradicted it or the learner switched approach) | The session completes only when all four required areas are demonstrated (DG2) |
| | `support` | How the learner got there:<br>i. independent (no help)<br>ii. after hints<br>iii. after guidance (the tutor explained it) | The end-of-session summary reports honestly how much help was needed (DG1) |
| | `quotes` | The learner's own words that earned the credit | Credit must come from what the learner actually said; the summary quotes them (DG2) |
| | `gap` | What is still missing in this area | The next question or hint targets that missing piece (DG3) |
| **SupportLadder**<br>(one per reasoning area) | `attention` | Questions asked since the learner last made real progress | Decides whether to help: 0 → open question, 1 → narrower question, 2+ → hint. Help depends on lack of progress, not on turn count (DG1) |
| | `assistance` | Strongest help already given:<br>i. 0 none<br>ii. 1 light hint<br>iii. 2 stronger hint<br>iv. 3 guided explanation | Decides how much help comes next, so each hint is clearer than the last instead of repeating; also sets `support` (DG1) |
| **Navigation** | `focusArea` | The area the tutor is asking about now | Keeps each turn to one question about one gap (DG3) |
| | `phase` | i. opening<br>ii. exploring<br>iii. paused<br>iv. complete | Controls when the summary and reference code can appear |
| | `awaitingCheck` | An area where the tutor gave a full explanation and is waiting for the learner to apply it | The tutor's explanation never counts as the learner's understanding (DG2) |
| | `deferredAreas` | Areas the tutor stops asking about after the learner couldn't apply a full explanation. They stay unresolved, and can still be credited if the learner explains them later. | Stops the tutor looping on something the learner cannot do yet (DG1) |
| **Approach** | `name`, `description` | The learner's own algorithm, in their own steps | The tutor evaluates the learner's approach, not a standard solution (DG3) |
| | `changedFrom` | The previous approach, if the learner switched | Evidence from the old approach is reopened instead of carried over |
| **Conversation** | `messages` | Every turn, labelled by kind (question, hint, repair, summary…) | Context for the LLM calls; also shows whether the last turn was a hint, so the next reply's credit is recorded as supported |
| | `turn` | Turn counter | Ordering and logging |

Reasoning areas: approach, justification, correctness and complexity are required; requirements and comparison are optional. Edge cases are part of correctness.

Run `npm run build`, `npm run lint`, and `npm run simulate` to check the implementation.

Useful partial answers receive ordinary follow-up questions. Hint escalation depends on confusion or lack of progress, rather than total conversation length. Earlier assistance remains recorded even after the learner starts making progress. Known solutions in `scripts/fixtures/approaches.ts` are offline evaluation material, not part of the live tutoring flow.
