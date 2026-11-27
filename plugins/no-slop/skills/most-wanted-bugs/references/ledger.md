# The hunt ledger

One file per target. It records what was attacked, what was found, and what was ruled out, so
that no round repeats another and a new session can resume without rereading everything.

## Where it lives

Use the project's notes or docs folder if it has one, for example `docs/hunts/<target>.md`. If the
folder is ignored by version control, the file exists on one machine only, and removing a worktree
deletes it. Copy it out before cleaning up, and say in the report where the durable copy is.

In find-only mode, keep the file outside the repository, in a temp or scratch folder. That mode
must leave the tree untouched, and a new file in the repository would break that. Say in the
report where the file is.

## Attack angles (the columns)

Pick the angles that fit the target. Each round takes fresh cells, so the same code is seen from
a new direction.

| Angle | The question |
| --- | --- |
| correct | Does the normal path compute the right thing? |
| concurrency | What happens on a double call, two tabs, overlapping jobs? |
| access | Can one user or role reach what belongs to another? |
| privacy | Is sensitive data protected at rest, in transit and in logs? |
| failure | What happens when the network, a dependency or a write fails? |
| lifecycle | Start, resume, expiry, upgrade, cleanup: does state survive each? |
| edge input | Empty, huge, multi-byte, malformed, hostile input? |
| text | Every supported language, long strings, direction, missing translations? |
| load | Query in a loop, unbounded result, heavy payload? |
| screens | What does the user see on empty, loading and error states? |

## Template

```markdown
# Hunt: <target> (opened <date>) | branch and commit | mode: fix | find-only

## Status
Rounds run: <n> | dry rounds in a row: <d> of <k> | round cap: <m> | verdict: <open | ...>
Find rate: r1 <n>, r2 <n>, ...

## Constraints (restate in every finder brief, word for word)
- <what the user said must not be touched, and in which round they said it>

## Coverage (rN = attacked in round N, blank = not hunted)
| Sub-area        | correct | concurrency | access | failure | edge input | ... |
| --------------- | ------- | ----------- | ------ | ------- | ---------- | --- |
| <route or file> | r1      | r1          | r2     |         |            |     |

## Fixed (fix mode)
- [r1] <bug> | <path:line> | root cause | test <name>: failed before, passes after | class swept: yes

## Confirmed, not yet fixed (find-only mode: full cards, worst first)

## Verified clean (each with the evidence that earned it)
- [r2] <claim that it holds> : <the test, run or code lines that show it>

## Dismissed (so it is never raised again)
- [r1] <claim> : <why it is fine, with the evidence>

## Needs a human
- [r1] <item> : <what is needed and why there is no way to settle it alone>

## Still owed
- <cell or check not done, with the exact command or step that would settle it>

## Round log
- r1 (<date>): cells = {<sub-area x angle>, ...} -> 2 fixed, 1 dismissed -> not dry
- r2 (<date>): cells = {...} -> 0 new confirmed -> dry 1 of 1
```

## Rules for keeping it

- Add, do not erase. A dismissed claim is never deleted to make a round look productive. If a
  dismissal turns out to be wrong, move the entry to the fixed or confirmed list with a note.
- Every "verified clean" and "dismissed" line cites what showed it: a test name, a command and
  its output, or the code lines. A sentence written from memory is a claim, not evidence.
- A cell is marked only when it was attacked for real. A dead or interrupted finder's cells go to
  "still owed".
- Write user constraints down the moment they are given. Helper agents see only their brief.
- Lead every round's message with one status line: `Round N | +X confirmed | dry D of K`.
- If the same class of bug was confirmed in two rounds, make the next round a class sweep: list
  every implementation of that concern in one table and compare their checks, instead of finding
  one sibling per round.
