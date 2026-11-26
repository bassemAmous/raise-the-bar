---
name: bug-retro
description: Runs a one-minute retrospective right after a bug fix and saves the lesson where the next session will read it. Captures the symptom, the root cause, the clue that was missed, the pattern to remember, and a short list of checks that leads straight to the cause next time. Keeps one entry per class of bug, not per bug. Use after any fix that took more than one attempt, or when the user says "save this bug", "learn from this", "don't repeat this", "post-mortem", "retro" or "why did we miss this". Skips trivial fixes and unproven theories.
---

# bug-retro

A short retrospective, run straight after a fix, while the detail is still fresh. It produces one
saved lesson that makes the next bug of the same class faster to diagnose. The lesson is not a
story of what happened. It is a pattern with a name and a list of checks someone can run. It is
saved in the place the next session reads at start, because a lesson nobody loads teaches nobody.

## When to use

- A fix took more than one attempt, or the first theory was wrong.
- The cause sat somewhere unexpected, or a clue was in plain sight and was skipped.
- The user says "save this", "learn from this", "retro" or "why did we miss this".
- After `bug-hunt` fixes a root cause that taught something.

## When not to use

- A typo or an obvious one-line fix with no missed clue. Say "No retro needed: trivial fix, no
  lesson to carry over" and stop. An entry with nothing to teach is noise for every later reader.
- The cause is still a theory. Only a cause that was reproduced and then shown fixed is saved.
  If the fix is unproven, say so and stop. A saved guess misleads the next session.
- A whole incident review with timeline and people. This skill covers the technical lesson only.

## Steps

1. **Find where lessons live.** Look in this order and use the first that exists:
   - the agent's own persistent memory for this project, if your tool has one and loads it at the
     start of a session,
   - a lessons file or folder that the project's agent instructions file already points to,
   - otherwise `docs/lessons/` in the repository, with one file per bug class and an index file.
   The reason for the order: the lesson must be read without anyone remembering to look for it.
2. **Look for an existing entry on this class.** Search the store for the key words of the
   pattern. If one covers it, update that entry: add this bug as a new example and sharpen the
   checks. One entry per class keeps the store short enough to be read.
3. **Collect the facts** from the conversation and the diff:
   - Symptom: what the user saw, in their terms.
   - First wrong theory: where the search started and why that was wrong.
   - Root cause: the real fault in data, logic or contract, in one sentence.
   - Missed clue: the comment, mismatch, log line or search result that pointed at it.
   - Cost: roughly how much longer it took than the direct path.
4. **Name the pattern.** A short class name that will match the next case, for example "contract
   and implementation disagree", "two sources produce the same key", "stale cache after a write",
   "filter applied at the wrong layer". A name tied to this one file will not be found again.
5. **Write the fast path.** Three to five checks, in order, that lead straight to the cause and
   skip the wrong theories. Each must be something a person can run or read: a search to make, a
   file to open, two values to compare. "Be careful with caching" is not a check. Rewrite it or
   remove it.
6. **Save the entry** with the template below. Leave out names of people, secrets and customer
   data. Use the date of the fix.
7. **Update the index in the same step.** Add or refresh the one-line pointer in the store's
   index. If the store is new and no instructions file points to it yet, ask the user before
   adding a pointer there, because that file steers every future session.
8. **Check the test.** If the fix shipped without a test that fails on the old code, say so in the
   output. A saved lesson helps the next reader. Only a test stops the bug from coming back.
9. **Report** in the output format below, then stop. This skill touches the lesson entry and the
   index line, nothing else.

## The entry template

```markdown
# <pattern name>

Trigger: <the symptom that should bring this entry to mind, one line>

Rule: <what to do differently next time, one or two sentences>

Why: <the root cause, one sentence>

Fast path:
1. <first check>
2. <second check>
3. <third check>

Examples:
- <date>: <the bug in one line, with the commit or pull request if there is one>

Applies when: <the situations where this check order is the right start>
```

## Output format

```
Bug class: <pattern name>
Symptom: <what the user saw>
Root cause: <one sentence>
Missed clue: <what was skipped>
Lesson saved: <path> (new | updated existing)
Index updated: <path> | pointer not added, waiting for the user's yes
Regression test: <path and test name> | missing, add one
Next time "<symptom trigger>" appears: start at <first check>.
```

## Hard rules

- Save only a proven cause: reproduced before the fix and shown gone after.
- One entry per class of bug. Update before you add.
- Every check in the fast path can be run or read. No advice-only lines.
- The entry and its index line are written together. An index that is out of date hides the
  lesson.
- No blame, no names, no secrets, no customer data in an entry.
- Do not edit code or tests here. If a test is missing, report it.

## Common mistakes

- Writing a diary of the debugging session instead of a pattern and its checks.
- Naming the pattern after the file or feature, so it never matches the next case.
- Saving the lesson in a folder that no session ever loads.
- Adding a fifth near-identical entry instead of improving the first.
- Recording the first theory as the cause because the retro ran before the fix was proven.
- Treating the saved lesson as a replacement for the regression test.
