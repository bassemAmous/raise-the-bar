---
name: you-had-one-job
description: Checks that the work does exactly what was asked, all of it and only it. Splits the ask (a ticket, a request, a list of review comments) into numbered clauses, closes each clause with proof or a declared gap, maps every changed line back to a clause, and ends with a plain before-and-after of each change. Use when a ticket or a written ask is handed over, and when the user says "did we do everything in the ticket", "what is left of the ask", "is this in scope", "did you address all the review comments", "is this what I asked for" or "explain what you changed in easy words". Not for a general proof that a change works (done-done), a bug hunt (most-wanted-bugs) or the push review (you-shall-not-push).
---

# you-had-one-job

A change is not finished because it compiles. It is finished when four questions have an answer
with evidence: **all of it? only it? correct? shown?** This skill walks them in order. The ask
becomes a numbered list, and the list is what makes "did you do what I asked?" answerable by
something other than memory.

## When to use

- A ticket, a written request or a set of review comments is handed over to be done.
- The work already exists and someone asks whether it covers the ask: start at step 3.
- Review comments arrived: each unresolved comment is a clause, numbered after the ask's own.

## When not to use

- Proving that a change works, with no written ask to hold it against: use `done-done`.
- Hunting for bugs beyond the ask: use `most-wanted-bugs`, after this skill.
- Getting a commit through the push gate: use `you-shall-not-push`.

## Steps

1. **Quote the ask, then split it into clauses.** Keep the ask word for word. Each clause is one
   separately checkable thing. "Add a session check and scope the data" is two clauses. Watch for
   a clause hiding in a side phrase, and for the story line: if the ask says "make it look like
   the agreed design", each difference from that design is part of the ask.
2. **Fix the ground.** The branch, its base, the diff against the remote base (fetched, not a
   stale local ref). Work in a worktree (`main-is-lava`). Write a short start block that prints
   the tip commit and the baseline numbers (type check, lint, test count), run it, and keep its
   output. Run it again before the report.
3. **Coverage: all of it.** One row per clause: the code that satisfies it (`file:line`) and a
   verdict. A clause with no code stops the run: finish the work before proving it. A clause met
   in a different way than the ask describes is allowed, but it is named in the report so the
   reader is not surprised.

   | # | Clause | Satisfied by | Verdict |
   | --- | --- | --- | --- |
   | 1 | "Add a session check" | `orders.ts:14`, guard on the caller | done |
   | 2 | "Scope the data to the caller's team" | `orders.ts:31` | done |
   | 3 | "Show an error to other teams" | none: needs a second test account | declared gap |

4. **Scope: only it.** Walk the diff the other way. Every changed hunk maps to a clause. Anything
   unmapped is out of scope by default: revert it, split it into its own change, or keep it with a
   one-line reason in the report. Check two usual leaks by name: configuration files swept into a
   feature change, and long comments about problems the ask does not own. A leftover of the ask's
   own problem is in scope: fix it here, do not defer it.
5. **Correct: challenge the review.** Review the diff, or have `no-slop:readonly-reviewer` do it.
   For each finding ask what must be true for it to fire, whether a guard already exists
   elsewhere, and whether one command on the running code can settle it. Drop what does not
   survive. Then attack the riskiest clause the other way: "prove it is not broken".
6. **Shown: run it.** Each clause with a visible effect gets a check a person can repeat: a test
   seen failing then passing, or a real run with its output. For tests cited as proof, follow
   `show-me-red`. A review comment's rule covers the whole branch, not its one line: search for
   the same pattern and fix every hit.
7. **Close every clause.** Each clause ends as done with its evidence, or as a declared gap with
   the reason and what would close it. Nothing stays open without a word.
8. **Report**, gaps first, in the format below.
9. **Explain it in plain words**, for a reader who will not open the diff. First the ask, in a
   short paragraph: what was wrong, who it hurt, what happens now. Then one block per changed file:
   **How it was**, **How it is now**, **Why**, with the few lines that changed shown in both
   states. The "why" names the consequence ("a new caller cannot forget the filter"), not a
   principle. Deletions get explained too. End with **In short:** in one or two sentences.

## Output format

```
Not proven:
- <clause or check> : why it could not be shown, and what would show it

Clauses: <done> done · <gaps> declared gaps · <open> open (must be 0)
| # | Clause | Evidence | Verdict |

Scope: every hunk maps to a clause | kept out of scope: <hunk> : <reason>
Review: <findings raised> raised · <survived> survived · <fixed> fixed
Start block: ran at <time>, matches the baseline | differs: <what>
Left behind: <branches, worktrees, servers, uncommitted files>
```

Then the plain-words explanation from step 9.

## Hard rules

- The ask is quoted, not paraphrased. A paraphrase quietly drops clauses.
- No clause is closed from memory. Evidence, or a declared gap with its reason.
- Never widen the diff. A finding outside the ask is reported and parked with `future-me-problem`.
- Lead with what is not proven. The good news comes after.
- An unanswered question from the person who asked stays on the gaps list, in their words.
- Finishing this skill is not permission to commit or push. Ask, and wait for the answer.

## Common mistakes

- Reading "add X and scope Y" as one job and doing half.
- Writing a test of what the code happens to do instead of what the clause asks.
- Fixing a typo in an unrelated file "while here", so the reviewer can no longer trust the diff.
- Answering one review comment at its line and leaving the same pattern elsewhere.
- Leading the report with wins and burying the one clause that is not done.
