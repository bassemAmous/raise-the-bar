---
name: senior-council
description: >-
  Convenes opposed senior engineering personas (the maintainer, the security reviewer, the
  operator on call, the product-minded engineer, the skeptic) to debate ONE weighty technical fork
  over two rounds, then returns one decision, the trade-off accepted and what would change the
  decision. Use when the user says "senior council", "debate this architecture", "which approach
  should we take", "argue both sides of this design", "is this migration worth it", "build or
  buy", or is about to commit to something costly to undo: a datastore, a rewrite, a migration, a
  core dependency. Not for clear answers, small reversible choices, bugs or style questions, and
  not for a business build-or-buy such as a company, a contract or a service (use boardroom).
---

# senior-council: opposed senior engineers on one technical fork

One technical fork goes in. Five senior personas who want different things argue it over two
rounds. One decision comes out, with the trade-off you accept by taking it and the fact that would
change it.

Stated honestly: this is one model wearing several hats, not five independent engineers. It widens
the framing and breaks the pull of the first design. It does not replace a measurement. If a
benchmark, a prototype or a read of the code can settle the question, do that instead.

You are the **Chair**. You write the brief, pick the panel, run the rounds, check what can be
checked and report the decision. You never argue a side and you never vote.

## When to use it

Only for a fork that is heavy on all three counts:

- **Costly to undo:** a datastore, a schema that will hold real data, a rewrite, a migration, a
  public API, a core dependency, an auth model.
- **Truly debatable:** two or more options that a good engineer could defend.
- **Not answerable by a quick check:** no half-day spike or doc lookup would settle it.

## When NOT to use it

- The answer is clear. Give it in one line and say no council is needed.
- The choice is small or easy to undo (a library for one screen, a naming scheme). Pick one, ship,
  change it later if it hurts.
- It is a bug (debug it) or a matter of taste (follow the project's convention).
- A measurement would settle it. Run the benchmark or the spike first, then decide.
- The decision was already made and written down. Re-open it only for a new fact.
- It is a business call (price, pivot, hire). Use `boardroom`.

A council costs 10 to 12 agent runs. If the fork does not deserve that, do not convene one.

## Steps

### 1. Frame the fork

Write one sharp question and the options A, B, C. Always include "keep what we have" and the
smallest version of the change.
Why: a vague question gets five answers to five different questions.

### 2. Write and verify the brief

Under 250 words: the question, the options, the current state (the code path, the data shape, the
load, what is live), the constraints (team size, deadline, uptime needs, rules that apply), and
up to five files a seat should read. Check every load-bearing claim against the real code, config
or data before the panel sits. Tag each claim `(checked: <file>)`, `(user)` or `(assumed)`. Mark
what is unknown as unknown. Ask the user only what the project cannot answer, in one batch of
three questions at most.
Why: five agents arguing from a false premise is expensive theatre.

### 3. Pick the panel

Read `references/personas.md`. The default panel is five: `maintainer`, `security`, `oncall`,
`product`, `skeptic`. Swap one for a standby persona (`data`, `cost`) when the fork is in its
lane. Offer a panel of three when cost matters.

Show the panel and the number of agent runs in one short list and ask once before you start. A
panel of five is 10 runs, a panel of three is 6, and a contrarian or an extra pass adds 1 each.
Skip the question if the user named the panel or said "just run it".
Why: the value comes from opposition. A panel of people who want the same thing agrees at once.

### 4. Round 1: independent positions

Spawn every persona in ONE message so they run in parallel and cannot see each other. Use the
Agent tool with `subagent_type: council:council-seat`, one agent per persona, on the strongest
model you have. Each prompt is the Round 1 prompt from `references/rounds.md` with the persona's
whole block and the brief pasted in.

Each persona returns: its pick, its reasons with the file or fact behind each one, its top risk,
what the pick costs, the one thing that would change its mind, and any assumption it had to make
because the brief was silent. An assumption a seat had to make is a gap in the brief, not a fact.

Then, as Chair, list the **cruxes**: one to three disagreements that explain the split, with the
personas on each side. Check every crux that the code, a config or a quick measurement can
settle, before Round 2.
Why: blind positions stop the first confident voice from framing the debate.

### 5. Round 2: cross-examination

Spawn every persona again with the Round 2 prompt, all Round 1 cards and the checked facts. Each
must attack the weakest argument it sees, defend or update its own position, answer the cruxes,
and give a final pick with a confidence from 1 to 5 and the options it could live with. A change
of position must name the argument or fact that caused it.

If every persona picked the same option in Round 1, Round 2 runs in self-attack mode: each one
attacks the weakest part of its own case.
Why: this round is where the signal is. Polite agreement here means the round failed.

### 6. If the room still agrees: one contrarian

If Round 2 ends with no surviving crux, spawn one `contrarian` with its prompt from
`references/rounds.md`. If it lands a real hit, that is the strongest dissent. If not, say so.
Why: a consensus that survived a dedicated attack is worth more than one never attacked.

### 7. Report the decision

Apply the decision rule below. Why: a fixed rule stops the Chair from deciding by its own taste.

1. **Blockers first.** An option is out if a persona raised a blocking objection (data loss, a
   security hole, a broken hard constraint) that was checked and that nobody answered.
2. **Then support.** For each option left, add up the confidence of the personas whose final pick
   it is. The highest total wins.
3. **Ties go to the option that is easier to undo.**
4. **If you think the room missed something,** you may not decide it yourself. Give the point to
   the closest persona as a crux and run that one persona once more. One extra pass at most.

## Output format

```
Decision: <the option, in one sentence>
Trade-off accepted: <what we give up by choosing it, in plain words>
What would change this decision: <the fact, number or event, and how to check it>

Why this over the runner-up: <one line>
How the room split: <persona: final pick (confidence n/5)>, one per persona
Rule applied: <blocker removed option X | highest support | tie, easier to undo>
Strongest dissent: <the persona, its argument in its own words, and what would have to be true
for it to be right>
Checked facts: <claim: source>, one per line
Still assumed: <every number or claim nobody could check>
First step: <one action, small enough to start today>
Stop signal: <what would tell us to turn back, and how we would turn back>

Simulated personas: one model with several hats, not independent engineers. Weigh it that way.
```

Keep it under 300 words in chat. Write nothing to disk unless the user asks for a decision record.

## Hard rules

- The Chair summarises and does not vote. The decision comes from the rule above.
- Every number (load, latency, cost, size) comes from the brief, from a named file, or is marked
  `(assumed)`. Never invent a benchmark, an incident or a figure.
- A claim that can be checked in the code is checked, not debated.
- Personas move only for a better argument or a new fact. The dissent stays in the output.
- Personas are roles. Never name, quote or imitate a real engineer or author.
- Personas only read. Nothing is built, changed or deployed by this skill.

## Common mistakes

- Convening a council for a choice that a one-day spike would settle.
- Sending the brief without checking it against the code.
- Picking a panel of five people who all value the same thing.
- Reporting a blend ("a bit of A and a bit of B") that no persona argued for.
- Dropping the dissent because the room was mostly agreed.
- Leaving out the trade-off. Every real fork costs something. Name it.
