# The verdict template

Written by the Chair as `verdict.md` in the session folder. Short sentences, everyday words. Seat
lines keep the seat's own voice. Under 900 words: the detail is in the round files.

Copy the block below and fill it in. Keep the line starts exactly as written (`Option scores:`,
`Math`, `Council confidence:`, `Seat runs:`). The number check relies on them.

```markdown
# Council: <the decision in a few words>

<YYYY-MM-DD> | Seats: <list> | Rounds: <n> | Mode: <quick or full>
Seat runs: <n>

## Verdict: <GO | GO WITH CONDITIONS | REWORK | WAIT | DO NOT DO IT>

**The decision:** <one or two sentences the user can act on, naming the option>
**Why this over the runner-up:** <one line>
**The deciding fact:** <the fact or test that would flip it. If it is cheap, get it first.>
**If this goes wrong:** <the most likely reason, in one line>

Option scores: A x.x, B x.x, C x.x
Math A: <the weighted sum, written out>
Math B: <the weighted sum, written out>
Council confidence: n/10. Spread: n. Resolution support: x.x/10 (full mode only).
Rule applied: <ruin cap | hard-to-undo cap | constraint veto | none>, and why in one line.

## Seat table

| Seat  | Weight | Final position | A   | B   | C   | Own-lens score | Moved?           | Its line for the founder |
| ----- | ------ | -------------- | --- | --- | --- | -------------- | ---------------- | ------------------------ |
| buyer | 3      | Yes if         | 2   | 7   | 6   | 8              | yes, from A to B | "<the seat's own line>"  |

## What carried the room

<3 to 5 bullets. Each one: the argument, the seat that made it, the fact it rests on and where
that fact comes from.>

## Where they fought

<One short block per crux: the question, who stood where, who moved and why, how it ended or why
it did not end.>

## The dissent

<The strongest disagreement, in the seat's own words, and what would have to be true for it to be
right. If nobody dissented, say so and name the least tested assumption. If the contrarian sat,
report its hit or its miss here.>

## Conditions

<Each one checkable: a number, a date, a test result. Mark the ones that must be met before any
step that cannot be undone.>

## Next

1. This week: <action> (who)
2. <next step, dated YYYY-MM-DD>
3. <date to review the decision, YYYY-MM-DD>

**Cheapest test:** <the smallest thing that checks the riskiest assumption before committing>
**Stop signal:** <what tells us to stop, and what happens then>
**Bring it back when:** <the new fact or number that would justify another council>

---

Simulated seats: one model with several hats, not real people and not independent opinions. Weigh
it that way. Figures marked (assumed) are guesses, not data.
```

## Reminders for the Chair

- Scores come from the cards of the last round, never from the Chair's own view.
- Every figure in the verdict must already be in the brief, a round file or the resolution. That
  is what `scripts/check-numbers.mjs` checks. A figure that is in none of them is removed, or it is
  traced in the Chair notes of a round file with its source.
- Write dates as `YYYY-MM-DD`. The check skips dates in that form and flags the others.
- A figure the seats marked `(assumed)` stays marked `(assumed)` in the verdict.
- Do not smooth the dissent. Quote it.
- The verdict is an internal working paper. Before any part of it goes to a customer, a funder or
  a partner, a person reviews it.
