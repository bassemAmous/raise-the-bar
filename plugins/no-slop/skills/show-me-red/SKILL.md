---
name: show-me-red
description: Proves that each test can fail, and fails for the right reason. Lists the behaviours a change touches, has each test assert one of them exactly, breaks exactly what each test pins, and records a kill table showing every test seen red on its own break and green on everyone else's. Also reviews someone else's spec for blind spots and checks a "nothing changed" claim. Use when an end-to-end or browser test is written, changed, de-flaked or cited as proof, and when the user says "would the tests catch it", "is this really covered", "review this spec", "fix this flaky test", "prove nothing changed" or "can this test fail". Not for running a finished suite as a gate (done-done), hunting bugs (most-wanted-bugs) or writing manual test cards (homework-for-humans).
---

# show-me-red

A test is evidence only if it can fail. One that passes whatever happens proves nothing. One that
goes red on every harmless refactor pins the code instead of the behaviour, and people learn to
ignore it. The proof is a **kill table**: each test seen red on a break of exactly what it pins,
and green on breaks of everything else. This skill builds that table.

The rules apply to any test that is cited as proof. They matter most for end-to-end and browser
tests, where a stub, a fallback or a cached build can keep a suite green while the real path is
never exercised.

## When to use

- A browser or end-to-end test is written, changed, de-flaked, reviewed or quoted as proof.
- A dependency upgrade, a refactor or a migration must be shown to change nothing a user sees.
- Someone asks whether the suite would notice a given break.

## When not to use

- Running an existing suite as a gate before "done": use `done-done`.
- Looking for bugs in the product: use `most-wanted-bugs`.
- A pure unit test of a pure function, with its red already seen: nothing more to prove.

## Steps

Each step ends with something written down. A skipped step is a row that says "not run, because".

1. **List the behaviours from the diff, not from the tests.** What a user or another system can
   observe: text, roles and states; requests (address, parameters, body, headers); stored state
   (cookies, storage, the address bar); order and timing; error and fallback paths. Every branch of
   a changed condition is a row. Anything stateful gets a round trip: create, reopen, edit, delete.
   Write the expected result per row (stays green, red on base and green on change, or changes as
   named) to a file before the first test, so the tests follow the list.
2. **Choose the layer.** Pure logic belongs in a unit test. An end-to-end test pins the seam: the
   real bundle, in a real browser, on the network. Note which rows a cheaper test should own.
3. **Assert the observable, exactly.** The whole text, the exact request fields, the exact cookie.
   Expected values are literals typed from the spec or a recording, never computed from the app's
   own code. Removed behaviour gets an absence check. Each test checks a marker only its state has,
   so a shared error page cannot pass it. No class names, no `toBeTruthy`, no "the page is
   visible". One behaviour per test, named for it.
4. **Stub at the network boundary, from recorded replies.** Never stub the code under change.
   Fail on any request no stub expected. No sleeps: wait on a real condition. Evidence runs use
   `--retries=0`, and a new test passes ten repeats on the base before it counts.
5. **Cover every failure kind the code tells apart.** An error status, a dropped connection, a
   body that is not JSON, empty values, a reply slower than the code's timeout. A kind the code
   merges with another gets one line naming where.
6. **Prove the rig before any run counts.** The installed build is the one you meant (compare its
   fingerprint), the server served that build (find its marker in the served file, after clearing
   the bundler's cache), test ports were free, and one planted control (a stubbed reply changed so
   the page must show it) was seen on the page. Without the control, "same on both sides" may mean
   "both fell back".
7. **Kill each test.** Break exactly what it pins, run it alone with `--retries=0`, and see it fail
   at the assertion that pins it. Cheapest break first: a planted reply, a flipped input, a
   one-line source change restored from a copy, a mutant build of a dependency
   (`references/kill-proof.md`). A timeout, a crash or a setup error is not a kill. Restore, and
   see it green again.
8. **Check specificity.** A break of something the test does not pin leaves it green. A test that
   every break turns red pins setup, not behaviour: split or fix it.
9. **Base against change.** The same spec runs on both. A difference counts only after it shows
   twice on each side, each run alone, with the order swapped. Reconcile every red with step 1.
10. **Hand back the table**, gaps first.

## Twin suites for a rewrite or migration

When a new system replaces an old one, write the suite on the old system first and keep it. Each
spec is green on the old system before the new one has the feature, then runs against both. A
spec that was red on the new system only proves it sees the feature missing, so each detail it
pins still gets its own break. A bug fixed on the way flips one expectation, on purpose and
written down, never silently.

## Reviewing a spec someone else wrote

Check it against steps 3 to 5 and `references/blind-specs.md`. A spec is blind when a break of the
behaviour it claims leaves it green. Show it: run it once against that break and quote the green.
Return one row per test: what it claims, why it is blind, the break that showed it, and the exact
assertion to write instead, kill-proven.

## "Prove this changes nothing"

A green suite proves "no change" only for the behaviours its tests pin and were seen red on. Run
steps 1, 3 and 7 on the diff's behaviours, then step 9. Try the edge inputs of every changed
condition: empty, missing, unknown, mixed case. For each existing suite that stays green, say why
it cannot see the change. The claim names the behaviours checked. Everything else is "not checked".

## Output format

```
show-me-red: <B> behaviours · <T> tests · <K>/<T> killed · <N> never killed (why)
Rig: fingerprint <ok|not run> · served build <ok|not run> · ports <ok|not run> · control <ok|not run>
Base vs change: same | <D> differ, each seen twice per side

Gaps: <rows with no test, steps not run, breaks not made>

| Behaviour | Layer | Test | Break -> red at | Stayed green on | Base x2 / change x2 | Verdict |
```

`scripts/kill-matrix.mjs` prints the kill and agreement columns from Playwright JSON reports.
`scripts/make-mutants.mjs` builds broken copies of an npm package for step 7. Quote each command
with its result line.

## Hard rules

- Never edit a test to make a red go away: no weaker assertion, no retry, no snapshot updated by a
  flag. A case that cannot be both meaningful and green is marked as a known gap, with the reason.
- Restore every break from a copy (never `git checkout` a file), then rerun it green.
- A test no break turned red is "equivalent" only after a real attempt to make the break show.
  Otherwise it is "unresolved". It never leaves the table.
- No live system inside a suite. A live check is its own named run, on a system you may use.
- One run at a time on shared ports and locks.

## Common mistakes

- Counting a timeout as a kill.
- Reading the expected value from the app's own fallback text, so the test moves with the app.
- Comparing two builds that both fell back to the default and calling them "the same".
- Trusting suite size: hundreds of green tests may never touch the changed path.
- Running the dev server on a build installed earlier, because the bundler kept its cache.
