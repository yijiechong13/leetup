# LLM judge criteria (draft v1, for review)

Each criterion is judged separately, on the whole conversation, with one judge prompt per criterion. Both apply to every conversation: every conversation credits at least one area (C1) and includes at least one moment where the learner is stuck or gives a weak answer (C2).

The judge sees the full exported transcript, including each turn's checklist line, so it can see what LeetUP ticked and when.

---

## C1. Credit matches the learner's own reasoning (DG2)

**Question:** Does LeetUP tick a reasoning area only when the learner has explained it in their own words, and label it honestly?

**PASS** if, for every area ticked on the checklist:
- the learner's own messages adequately explain that area (approach: concrete steps; justification: why it fits; correctness: why it works plus one reasoned edge case; complexity: time and space with their causes), and
- the area is labelled "with help" whenever the tutor gave a hint or explanation for it before the learner's explanation.

**FAIL** if any of these happens at least once:
- an area is ticked from code alone, from naming a data structure or technique without explaining how it is used, from a general claim with no reasoning (for example, "it works" or "it's faster"), or from the tutor's words rather than the learner's;
- an area is ticked although the learner's claim was wrong;
- an area is labelled "independent" or "worked out yourself" although the tutor supplied the missing reasoning first.

**Not a failure:** an area left unticked that the learner did explain (that is a missed credit, noted separately but not judged here).

---

## C2. Help matches the learner's difficulty (DG1)

**Question:** When the learner is stuck, does LeetUP's help become progressively clearer, without repeating itself or helping too early?

**PASS** if:
- whenever the learner is stuck (says they don't know, repeats a vague answer, or asks for help), each following tutor turn on that point adds something new: a narrower question, a clue, or a clearer explanation; and
- the tutor does not give a hint or explanation while the learner is making real progress on their own.

**FAIL** if any of these happens at least once:
- after the learner is stuck, the tutor asks an equivalent question again without adding new help;
- the tutor gives a hint or explanation when the learner was making progress and had not asked for help;
- the tutor gives the full solution, or explains several required areas at once, before the learner has worked on them.

**Not a failure:** one follow-up question after a first weak answer (the design asks once more before hinting); giving help straight away when the learner explicitly asks for it.
