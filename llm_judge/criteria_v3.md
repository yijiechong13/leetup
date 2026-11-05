# LLM judge criteria (v3)

Each criterion is judged separately, on the whole conversation, with one judge prompt per criterion. Both apply to every conversation: every conversation credits at least one area (C1) and includes at least one moment where the learner is stuck (C2).

Changes from v2: C1 is unchanged. C2 is narrowed to one behaviour, whether support adds a narrower question, clue or explanation when the learner remains stuck. The v2 C2 also failed help given while the learner was progressing; that overlapped C1, because the same reply could fail both. It also failed giving the full solution early, which red-team target T1 tests. The v2 wording is preserved in `criteria_v2.md`, and the v1 wording in `criteria_v1.md`.

## Applying the criteria consistently

- Judge the learner and tutor messages, not the persona, code version, planned result, or internal action label.
- Code or pseudocode can show a concrete **approach**. The other areas need explanations; meaningful explanatory comments can count as explanations.
- Acknowledging or restating a reason the learner already gave is not new help. A question that asks the learner to explain or trace their own steps is not a hint unless it supplies missing reasoning, a worked intermediate value or state, or a solution step.
- A new reason supplied by the tutor counts as help even in an ordinary question or repair turn. Check whether the learner had already supplied that reason earlier in the conversation.
- C1 and C2 check different things. C1 checks whether help was **recorded** honestly in the checklist. C2 checks whether help **became clearer** while the learner was stuck. C2 does not judge help given while the learner was progressing.
- The first wrong credit, or the first unhelpful repeat, is still a failure even if a later turn goes well.

---

## C1. Checklist completion and assistance labels match the learner's demonstrated reasoning (DG2)

**Question:** Does LeetUP tick each reasoning area only when the learner has shown enough evidence for it, and record the help received honestly?

**PASS** if, for every area ticked on the checklist:
- the learner's own messages provide adequate evidence for that area (approach: concrete steps in text, code, or pseudocode; justification: why it fits; correctness: why it works plus one reasoned edge case; complexity: time and space with their causes), and
- the area is labelled "with help" whenever the tutor gave a hint or explanation for it before the learner's explanation.

**FAIL** if any of these happens at least once:
- an area other than approach is ticked from code alone, without an explanation meeting that area's requirements;
- an area is ticked from naming a data structure or technique without showing how it is used, from a general claim with no reasoning (for example, "it works" or "it's faster"), or from the tutor's words rather than the learner's;
- an area is ticked although the learner's claim was wrong;
- an area is labelled "independent" or "worked out yourself" although the tutor supplied the missing reasoning first.

**Not a failure:** an area left unticked that the learner did explain (that is a missed credit, noted separately but not judged here); approach credit for concrete code; or a tutor restatement of reasoning already supplied by the learner.

---

## C2. Support adds a narrower question, clue or explanation when the learner remains stuck (DG1)

**Question:** When the learner is stuck on a point, does the tutor's next turn on that point give more support than before?

**FAIL** if, at least once: the learner is stuck on a point, and the tutor's next turn on that point repeats an equivalent question or earlier assistance without adding a narrower focus, a useful clue or a clearer explanation.

**PASS** otherwise.

**Definitions:**
- **Stuck:** the learner says they don't know or can't proceed, repeats a vague or wrong answer, or asks for help.
- **Equivalent:** asks for the same thing as an earlier turn, even in different words.

**Not a failure:** one follow-up question after a first weak answer, before any hint; moving to another area after a guided explanation. C2 does not judge whether help came too early; C1 checks whether that help was recorded.
