# Learner personas

All personas are computing undergraduates with basic data structures knowledge. They are preparing for technical interviews and use AI for coding practice; they are the target learners for LeetUP.

Each persona is played by an LLM that sees only the conversation, the problem statement and the persona description. LeetUP's replies come from the running system.

Every persona has at least one point where they are stuck or give a weak answer, so that criterion C2 applies in every conversation.

| # | Persona | Who they are | What they want | How they behave | Stuck or weak moment |
|---|---|---|---|---|---|
| P1 | Confident but terse | Has solved Two Sum before | To finish quickly | Gives short, mostly correct answers; skips reasons unless asked | Justifies with only "it's faster" until pressed |
| P2 | Stuck from the start | Knows data structures but freezes on new problems | Some guidance to get started | Says "I don't know" or "not sure" for the first two or three turns, then follows hints | Recovers only after hints |
| P3 | Code first | Practises by pasting code from AI | Their code accepted | Pastes the one-pass hash-map code, then struggles to explain why it works | Cannot explain the justification or complexity at first |
| P4 | Confident but wrong | Remembers results without reasons | Confirmation they are right | States claims such as "lookup is O(log n)" or "it works for all cases" | Holds a wrong or unsupported claim before correcting it |
| P5 | Slow but steady | Careful and unsure of themselves | To work it out themselves | Adds one small, correct piece per message | One message with an incomplete or uncertain idea |
| P6 | Nested-loop learner | Prefers the simplest correct solution | To show a correct answer, not the fastest | Proposes checking every pair and resists optimising | Unsure how to justify a slower approach or its cost |
| P7 | Approach switcher | Changes their mind mid-way | To find a better solution | Starts with nested loops, then switches to a hash map | Briefly confused after the switch |
| P8 | Asks for the answer | Short on time before an interview | The solution fast | Asks for the code or answer twice, then engages | Refuses to try at first |
| P9 | Vague guesser | Knows the right words but not the reasons | To sound right | Uses terms like "hash map" and "O(1)" without explaining them | Repeats vague answers when asked why |
| P10 | Edge-case confused | Understands the approach but is unsure about duplicates | To be sure the solution is correct | Explains the approach well but makes a mistake on [3,3] or self-pairing, then corrects it | Gives a wrong edge-case trace |

## Conversations (23)

All conversations use the same simulator and personas, so only the version of LeetUP differs. Each conversation stops when LeetUP shows the completion summary, or after 12 learner turns.

| Conversations | Commit | Version of LeetUP | Personas | Planned result |
|---|---|---|---|---|
| C01–C15 | `93b6730` | Final system (tutor code identical to `314a8ad`) | P1–P5 twice each, P6–P10 once each | No planned failure |
| C16–C18 | `41666c4` | Hint bug: a weak answer reset the count of questions asked on a point, so the tutor never moved to more help and could repeat the same question | P2, P9, P3 | Fail C2 |
| C19–C20 | `f2e4fa1` | Help-recording bug: help given in one reply was not carried over to the next, and repair turns traced the answer for the learner, so the checklist could mark a point as done without help when the tutor had done the work | P10, P4 | Fail C1 |
| C21–C23 | `41666c4` | Same hint bug as C16–C18 | P2, P9, P3 | Fail C2 |

### Why these personas
- Hint bug (C2): the bug only shows when the learner gives weak answers on the same point several times. P2 (stuck from the start), P9 (repeats vague answers) and P3 (cannot explain pasted code) are the most likely to do this.
- Help-recording bug (C1): the bug only shows when the learner makes a mistake that the tutor repairs. P10 (wrong edge-case trace) and P4 (holds a wrong claim) are the most likely to need a repair.

C21–C23 were added after C2 was narrowed (`criteria_v3.md`), to give C2 more chances to fail. I labelled them before any judge was run on them, and they were not used to revise any judge prompt.
