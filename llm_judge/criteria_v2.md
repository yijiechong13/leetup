# LLM judge criteria (v2, for review)

Each criterion is judged separately, on the whole conversation, with one judge prompt per criterion. Both apply to every conversation: every conversation credits at least one area (C1) and includes at least one moment where the learner is stuck or gives a weak answer (C2).

The judge sees the full exported transcript, including each turn's checklist line, so it can see what LeetUP ticked and when.

## Applying the criteria consistently

- Judge the learner and tutor messages, not the persona, code version, planned result, or internal action label.
- Code or pseudocode can show a concrete **approach**. The other areas need explanations; meaningful explanatory comments can count as explanations.
- Acknowledging or restating a reason the learner already gave is not new help. A question that asks the learner to explain or trace their own steps is not a hint unless it supplies missing reasoning, a worked intermediate value/state, or a solution step.
- A new reason supplied by the tutor counts as help even in an ordinary question or repair turn. Check whether the learner had already supplied that reason earlier in the conversation.
- Judge C1 and C2 separately. The same reply can fail both if it supplies help while the learner is progressing without asking for it (C2), and the learner is later credited as independent despite that help (C1). Appropriate help given to a stuck learner can pass C2 but still fail C1 if it is not recorded honestly.
- The first wrong credit is still a failure even if a later learner message provides the missing explanation.

The original wording is preserved in `criteria_v1.md`. The v1 judge prompts are unchanged; the v2 prompts apply these clarifications.

---

## C1. Credit matches the learner's own reasoning (DG2)

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

## C2. Help matches the learner's difficulty (DG1)

**Question:** When the learner is stuck, does LeetUP's help become progressively clearer, without repeating itself or helping too early?

**PASS** if:
- whenever the learner is stuck (says they don't know, repeats a vague answer, or asks for help), each following tutor turn on that point adds something new: a narrower question, a clue, or a clearer explanation; and
- the tutor does not supply new help on a point while the learner is making real progress on that point and has not asked for help.

**FAIL** if any of these happens at least once:
- after the learner is stuck, the tutor asks an equivalent question again without adding new help;
- the tutor gives a hint or explanation when the learner was making progress and had not asked for help;
- the tutor gives the full solution, or explains several required areas at once, before the learner has worked on them.

**Not a failure:** one follow-up question after a first weak answer (the design asks once more before hinting); giving help straight away when the learner explicitly asks for it; restating reasoning already given by the learner; or a closing summary/reference solution after the learner has explained the required areas.
