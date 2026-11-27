---
name: done-done
description: Checks a piece of work against evidence before anyone says it is done. Sizes the checks to the change, runs them, and reports what is proven, what is not, and what was not checked. Use before reporting a multi-file or risky change as done, before a handover or a demo, or when the user asks "is it really done", "did it land", "prove it" or "are you sure". Not for a trivial edit or a pure question. Formerly named "done-check", and still answers to that name.
---

# done-done: the done check

"Done" is a claim, and a claim needs evidence someone else can look at. This skill runs just
before work is handed back. It does not add work: it finds out whether the work that was claimed
actually happened, and says so plainly either way.

## When to use

- Before you tell the user that a multi-file or risky change is finished, fixed or live.
- Before a handover or a demo.
- When the user doubts a result.

Skip it for a pure question or a plan: there is nothing to prove yet. Skip it for a trivial edit
too, unless the user asks for proof.

## Steps

1. **Write the claim in one line.** "The export button downloads a CSV with all rows." If you
   cannot write it in one line, the task is not clear enough to call done. Ask.

2. **Size the checks to the change.** More risk, more proof:

   | Change | Minimum evidence |
   | --- | --- |
   | Text, comment, docs | Read the result once, in the place it will be seen |
   | One function or file | The test for it, seen failing before and passing after |
   | A feature across files | Tests, type check, lint, and one real run of the feature |
   | Data, auth, payments, a migration | All of the above, a second reader, and a way back |
   | Anything "live" | Checked on the live thing itself, not on the build |

3. **Run the checks. Do not recall them.** Use the project's own commands (find them in its
   package file, Makefile or README). A check you ran an hour ago, before the last edit, does not
   count. Keep the output.

4. **Look at the real thing.** For anything a person will see or call: open it, click it, call
   the endpoint, read the file that was written. Compare what you see with the one-line claim.
   For a screen, look at it at phone width and desktop width. A real page, not a health check:
   a server that answers `/health` can still serve a broken page. Serve the production build
   once, not only the dev server. Check the variant you changed, not a sibling that shares its
   name (another locale, another tenant, another build flavour).

5. **Check what does not travel with the code.** New settings, secrets, database changes,
   scheduled jobs, flags, cache: are they in place where the code will run? If the change needs
   one and it is missing, the work is not done, however green the tests are.

6. **Check the edges you touched.** The empty case, the large case, the failing case, and the
   thing next door that shared the code you changed.

7. **Report.** Use the format below. Then stop: do not call it done in one line and list doubts
   in the next.

## Output format

One block per claim, each line with its proof:

```
Claim: <one line>

Proven:
- <what> : <evidence: command and result, test name, or what you saw and where>

Not proven:
- <what> : <why, and what would prove it>

Not checked:
- <what> : <why>

Verdict: DONE | NOT DONE | DONE EXCEPT <the listed items>
```

## Hard rules

- No evidence, no "done". Say "not proven" instead. It is a normal, useful answer.
- Evidence is something the user could look at: an output, a test name, a URL, a screenshot.
  "I checked" is not evidence.
- A test that has never been seen failing proves little. For a fix, show it red first.
- Never weaken or delete a test to get a green run. If a test is wrong, say why and fix the test
  on purpose, as its own change.
- "Works on my machine" and "live" are different claims. Use the right word.
- Report failures with the same care as successes: the command, the output, your reading of it.
- A check that did not run is red, not green. "NOT RUN" never counts as a pass.
- Search the tests for `.skip`, `.only` and disabled cases before quoting a green count.
- A deploy is done when the live file's hash equals the build's, and the deployed commit is the
  one you tested.

## Common mistakes

- Running the checks on files that are not committed, then pushing something else.
- Checking the happy path only, on the same data used while building.
- Calling something "deployed" because the push succeeded. A push is not a release.
- Burying "one thing is not working yet" under a long list of what is.
