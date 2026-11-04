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
| **Evidence**<br>(one per reasoning area) | `status` | Whether the learner has explained this area:<br>i. unaddressed: no evidence yet<br>ii. partial: incomplete explanation<br>iii. demonstrated: adequate explanation<br>iv. revisit: reasoning requires reassessment after a contradiction or approach change | The session completes only when all four required areas are demonstrated (DG2) |
| | `support` | How the learner got there:<br>i. independent (no help)<br>ii. after hints<br>iii. after guidance (the tutor explained it) | Preserves the help received when reporting progress (DG1, DG2) |
| | `quotes` | Learner quotations recorded for the area, including partial evidence | Grounds the assessment in the learner's actual contributions (DG2) |
| | `creditedQuotes` | Quotations used when the area was marked demonstrated | Allows the summary to cite the evidence that earned credit, rather than a later incomplete reply (DG2) |
| | `gap` | Missing reasoning or a misconception that remains unresolved | Provides a specific target for the next question or hint (DG3) |
| **SupportLadder**<br>(one per reasoning area) | `attention` | A questioning counter used to track unresolved reasoning. Adequate progress can reset it; a first partial attempt can hold it without resetting it | Helps the policy recognise when further questioning should give way to support. Explicit help requests can advance support sooner (DG1) |
| | `assistance` | Strongest help already given:<br>i. 0 none<br>ii. 1 light hint<br>iii. 2 stronger hint<br>iv. 3 guided explanation | Selects the next support level and preserves assistance history even after progress (DG1) |
| **Navigation** | `focusArea` | The reasoning area currently being addressed | Keeps the response focused on a particular gap (DG3) |
| | `phase` | i. opening<br>ii. exploring<br>iii. paused<br>iv. complete | Distinguishes completion from a pause with unresolved reasoning |
| | `awaitingCheck` | An area explained through guidance that the learner has not yet applied | Prevents a tutor-provided explanation from automatically becoming learner credit (DG2) |
| | `deferredAreas` | Unresolved areas set aside after the learner could not apply a guided explanation | Avoids repeatedly questioning the same unresolved point. The learner can still demonstrate it later (DG1) |
| **Approach** | `selectedApproach.name`, `description` | A label and concrete description of the learner's proposed algorithm | Keeps assessment and support aligned with the learner's own steps (DG3) |
| | `selectedApproach.changedFrom` | The preceding approach when the learner changes algorithms | Identifies reasoning that may need reassessment for the new algorithm |
| **Conversation** | `messages` | Learner and tutor messages, including labels such as question, hint, repair, and summary | Supplies conversational context and helps determine whether subsequent evidence followed assistance |
| | `turn` | The current learner-turn number | Supports ordering and exported test records |

Reasoning areas: approach, justification, correctness and complexity are required; requirements and comparison are optional. Edge cases are part of correctness.

Run `npm run build`, `npm run lint`, and `npm run simulate` to check the implementation.

Useful partial answers receive ordinary follow-up questions. Hint escalation depends on confusion or lack of progress, rather than total conversation length. Earlier assistance remains recorded even after the learner starts making progress. Known solutions in `scripts/fixtures/approaches.ts` are offline evaluation material, not part of the live tutoring flow.
