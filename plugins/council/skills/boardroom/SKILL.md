---
name: boardroom
description: >-
  Runs a scored council on ONE business or product decision. A neutral Chair writes a short brief,
  then opposed seats (the buyer, the daily user, the money seat, the bet seat and others) take
  independent positions, cross-examine each other and score every option. Returns one
  recommendation with conditions, the dissent kept, and every number traced to the brief or marked
  assumed. Use when the user says "boardroom", "take it to the board", "debate this decision",
  "A or B", "argue both sides", "stress-test this choice", or faces a pricing, pivot, hiring or
  big-spend call that is hard to undo. Not for clear answers, and not for code-level forks (use
  senior-council).
---

# boardroom: a scored council on one decision

One decision goes in. Several opposed seats argue it over two or three rounds. One recommendation
comes out, with the scores, the conditions and the dissent kept.

Stated honestly: this is one model wearing several hats, not a room of independent minds. It
widens the framing and breaks the pull of the first idea. It does not produce truth. The value is
the disagreement and the fact that would settle it, never a blended average.

You are the **Chair**. You write the brief, seat the board, run the rounds, check what can be
checked, compute the scores and write the verdict. You never argue a side and you never vote.

## When to use it, and when not

Use it for one decision that is weighty, debatable and hard to undo: a price change, a pivot, a big
spend, a hire, a partnership, dropping a product line, a launch date.

Do not use it when:
- The answer is clear. Give it in one line and say no council is needed.
- The call is cheap and easy to undo. Try it and watch one number.
- It is a quick "should we" question (use `strategy`), a technical fork (use `senior-council`), or
  a chosen plan that needs attacking (use `red-team`).
- The decision was already made and written down. Re-open it only for a new fact.

## Steps

### 1. Write the brief

Under 300 words, saved as `brief.md` in the session folder. The folder is
`council/<YYYY-MM-DD>-<slug>/` under the project's docs folder, or at the project root. Say the path
before the first write. It will hold money figures, so it stays out of any public repository.

- The decision in one line, and the options A, B, C. Always include "do nothing" or "keep what we
  do now". If the user brought one idea, add its smaller version as an option.
- The situation (customers, revenue, pipeline, team, stage) and the resources (cash or runway,
  hours, deadline). Only what is known.
- What success looks like, and by when. Hard constraints, three at most.
- Which way the user leans, and why. The council tests the lean. It never echoes it.

Tag every claim `(checked: <file>)`, `(user)` or `(assumed)`. Look in the project files before you
ask. Ask the user only what the files cannot answer, once, in one batch of four questions at most.
"Just run it" means: fill the gaps with `(assumed)` and go.
Why: seats argue from the brief. A wrong premise wastes every run, and an untagged number turns
into a "fact" by Round 2.

### 2. Seat the board and pick the mode

Read `references/seats.md`. Seat every seat whose question the decision lives in, one downside
guard (`money` or `bet`), and the seat most likely to disagree. Leave out seats the decision barely
touches. Give each seat a weight from 1 to 3 with a one-line reason.

- **Quick** (default for a call that can be undone): 4 seats, Rounds 1 and 2. About 8 seat runs.
- **Full** (a call that is hard to undo, or that touches price, cash or a signed contract): 5 to 7
  seats, 3 rounds. About 15 to 21 seat runs.

Show the seats, weights, mode and number of seat runs in one short list and ask once. Skip the
question if the user named the seats or said "just run it". Never push the full mode.
Why: a seat with no stake adds noise, and a board with no natural opponent agrees too fast.

### 3. Round 1: independent first positions

Spawn every seat in ONE message so they run in parallel and cannot see each other. Use the Agent
tool with `subagent_type: council:council-seat`, one agent per seat, on the strongest model you
have. Each prompt is the Round 1 prompt from `references/rounds.md`, with the seat's block, the
list from `references/principles.md`, the seat's weight and the path to `brief.md`.

Each seat returns one card: position, a score for every option, its own-lens score, confidence,
ruin risk, how hard the option is to undo, its reasons with sources, the biggest risk, what would
change its mind, a first step, and one question for the founder.

Save the cards word for word in `round-1.md`, one `## <seat>` heading each. Add `## Chair notes`:
- **Cruxes:** one to three disagreements that explain the split (a fact, a number, or a value such
  as speed against safety), with the seats on each side.
- **Agreement check:** if every seat picked the same option with scores within one point, that is a
  warning, not a result. Round 2 then runs in self-attack mode.
- **Evidence audit:** strike any figure, customer, quote or market fact that is not in the brief,
  not in a file the seat named, and not marked `(assumed)`. Note what you struck. A card that broke
  the shape goes back once.

Why: blind positions stop the first loud opinion from setting the frame for everyone else.

### 4. Check facts, then Round 2: cross-examination

First settle every crux that a file, a count or one question to the user can settle. Put each
answer and its source at the top of the Round 2 prompt. Then spawn every seat again. Each seat
answers its strongest opponent, concedes a real point, answers every crux, re-scores, and says
whether it moved and why. In self-attack mode it also attacks the weakest part of its own case.

Save to `round-2.md` with `## Chair notes`: who moved and which argument or fact moved them, which
cruxes are settled, which numbers are still open. If no crux survives Round 2, spawn one
`contrarian` seat. A real hit becomes the dissent. A miss is written down as a miss.
Why: a debate must never replace a lookup, and a position that moves without a named reason is
social pressure, not reasoning.

### 5. Full mode only: resolution and Round 3

Write `resolution.md`: the named option, the seats' conditions merged into checkable ones (a
number, a date, a test result), next steps, the cheapest test, the stop signal. Weigh arguments,
not headcount. Spawn every seat with the Round 3 prompt to endorse, amend or dissent. Adopt an
amendment when no seat objects or the argument went unanswered. There is no fourth round.
Why: seats sign off on the actual wording, so the Chair cannot slip in a plan nobody argued for.

### 6. Score, check the numbers, write the verdict

The Chair wrote the text, so a script checks the Chair. That is the reason for item 3.

1. Compute the scores from the last round's cards, exactly as `references/scoring.md` says, and
   apply its overrides. You compute. You never adjust.
2. Write `verdict.md` by copying the template in `references/verdict.md`.
3. Run `node "${CLAUDE_PLUGIN_ROOT}/skills/boardroom/scripts/check-numbers.mjs" <session folder>`.
   Exit code 1 means a figure in the verdict is in no source file: remove it or trace it.

## Output format

`verdict.md` copies the template in `references/verdict.md` line for line, in this order: one
label (GO, GO WITH CONDITIONS, REWORK, WAIT or DO NOT DO IT), the decision, the deciding fact, the
option scores with their math, the seat table, what carried the room, where they fought, the
dissent, the conditions, the next steps with the cheapest test and the stop signal, and the footer
that says the seats are simulated.

In chat, under 200 words, in this shape, then stop:

```
Verdict: <label>. <the decision in one sentence>
Option scores: A x.x, B x.x, C x.x (confidence n/10, spread n)
What carried it: <three lines, each with the seat that made the argument>
Strongest objection: <one line, with the seat>
Next: <up to three steps>
Full verdict: <path to verdict.md>. Board: <seats>, <mode>, <n> seat runs.
```

## Hard rules

- The Chair summarises and does not vote. A point no seat raised becomes a crux for the closest
  seat in the next round. It never becomes the Chair's own argument.
- Every number comes from the brief, from a named file, or is marked `(assumed)`. Never invent a
  figure, a customer, a quote, a competitor or a market fact.
- Seats move only for a better argument or a new fact. If everyone agrees, each seat attacks the
  weakest part of its own case.
- Quote cards faithfully. Never rewrite a card. The dissent stays in the verdict.
- Seats are roles. Never name, quote or imitate a real person.
- One decision per session. Always say the mode and the number of seat runs. Seats run on the
  strongest model you have. Only file lookups may go to a cheaper, faster model.

## Common mistakes

- Running a council on a question with a clear answer. That is theatre.
- Treating a calm Round 1 as confidence instead of a warning.
- Averaging the seats into a mild middle and losing the one decisive fact.
- Writing the verdict from memory instead of from the saved cards.
