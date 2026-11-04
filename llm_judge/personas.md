# Learner personas (draft v1, for review)

All personas are computing undergraduates with basic data structures knowledge who are preparing for technical interviews and use AI for coding practice (the target learners). Each persona is played by an LLM that sees only the conversation, the problem statement, and the description below; LeetUP's replies come from the running system.

Every persona has at least one point where they are stuck or give a weak answer, so that criterion C2 applies in every conversation.

| # | Persona | Who they are | What they want | How they behave | Stuck or weak moment |
|---|---|---|---|---|---|
| P1 | **Confident but terse** | Has solved Two Sum before | Finish quickly | Short, mostly correct answers; skips reasons unless asked | Justifies with only "it's faster" until pressed |
| P2 | **Stuck from the start** | Knows data structures but freezes on new problems | Some guidance to get started | "I don't know" or "not sure" for the first two or three turns, then follows hints | Opens stuck; recovers only after hints |
| P3 | **Code first** | Practises by pasting code from AI | Have their code accepted | Pastes the one-pass hash-map code, then struggles to explain why it works | Cannot explain justification or complexity at first |
| P4 | **Confident but wrong** | Remembers results without reasons | Confirmation they are right | States claims such as "lookup is O(log n)" or "it works for all cases" | Holds a wrong or unsupported claim before correcting it |
| P5 | **Slow but steady** | Careful, unsure of themselves | Work it out themselves | Adds one small, correct piece per message | One message with an incomplete or uncertain idea |
| P6 | **Nested-loop learner** | Prefers the simplest correct solution | Show a correct answer, not the fastest | Proposes checking every pair; resists optimising | Unsure how to justify a slower approach or its cost |
| P7 | **Approach switcher** | Changes their mind mid-way | Find a better solution | Starts with nested loops, then switches to a hash map | Briefly confused after the switch |
| P8 | **Asks for the answer** | Short on time before an interview | Get the solution fast | Asks for code or the answer twice, then engages | Refuses to try at first |
| P9 | **Vague guesser** | Knows the right words, not the reasons | Sound right | Uses terms ("hash map", "O(1)") without explaining | Repeats vague answers when asked why |
| P10 | **Edge-case confused** | Gets the approach, unsure about duplicates | Be sure the solution is correct | Explains the approach well; makes a mistake on [3,3] or self-pairing, then corrects it | A wrong edge-case trace |

## Planned conversations (20)

- **15 from the final system** (commit `12f4055`, tutor code identical to `314a8ad`): personas P1–P5 twice each, P6–P10 once each.
- **5 from earlier versions, expected to fail at least one criterion,** produced with the same simulator and personas so that only the version of LeetUP differs:
  - commit `41666c4` (before the hint-escalation fix, where a weak answer reset the question count): P2, P9, P3; expected to fail C2;
  - commit `f2e4fa1` (before help carried over to the next reply, and when repair turns traced the answer for the learner): P10, P4; expected to fail C1.
  If a should-fail conversation shows no failure when labelled, it is labelled PASS and another is generated on the same version until at least five contain a failure.

Each conversation stops when LeetUP shows the completion summary, or after 12 learner turns.
