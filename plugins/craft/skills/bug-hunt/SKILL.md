---
name: bug-hunt
description: Hunts bugs in rounds and only counts the ones that survive a challenge. Finder agents attack the code and the running app, a second agent tries to disprove each claim, confirmed bugs are fixed at the root, and each fix is proven by a test seen failing before and passing after. Repeats until a full round finds nothing new, then reports honestly what was and was not covered. Use when the user says "find the bugs", "bug hunt", "make this bulletproof", "find and fix everything", "hunt until it is clean", "loop until no more bugs" or "find bugs but do not fix them". Not for running the tests only, or for style review (clean-code).
---

# bug-hunt

A bug hunt in rounds, with a principled stop. Each round: hunt one target from fresh angles, have
a second agent try to disprove every claim, fix what survives, prove each fix with a test, then
hunt again on the new code. It stops when a hard round finds nothing new. That result means "no
new confirmed bug in the areas hunted", never "no bugs exist", and the report says so.

A hunt costs many agent runs. Each round starts two to four finders and one skeptic per claim, so
the worst case is six rounds times (four finders plus one skeptic per claim). Before a hunt on a
large target, or a thorough one, tell the user the expected number of agent runs and ask before
starting.

## When to use

- A feature or area must be trusted before release: "make this bulletproof", "find and fix
  everything".
- **Find-only mode:** "find the bugs, we fix later". Run steps 1 to 4 and 7 to 9. Nothing in the
  product code is edited, and `git status` must show an untouched tree after every round. In
  this mode the ledger is kept outside the repository, in a temp or scratch folder, and the
  report says where it is.

## When not to use

- "Run the tests" or "is it done": use `guardrails:done-check`. If the guardrails plugin is not
  installed, run the project's own checks and report each command with its output.
- Readability or structure: use `clean-code`. Speed: use `performance`. Looks: use `ux-review`.
- A half-built area. Finish it first, or every round "finds" the unfinished work.
- A check on a timer. This skill loops on findings, not on a clock.

## Steps

1. **Set the target and the tree.** One target per run, named from the user's words or from the
   changed files. In fix mode, work in a worktree (`worktree-first`). If the tree has changes you
   did not make, stop and ask, because they may be someone's work in progress.
2. **Open the ledger.** Create or reopen one file from `references/ledger.md`: the target split
   into sub-areas (rows) against the attack angles (columns), plus the confirmed, dismissed and
   still-owed lists. The ledger is what stops a later round, or a later session, from repeating an
   earlier one. If it already exists, resume from it and do not restart at round 1.
3. **Hunt.** Pick two to four uncovered cells and give each to a finder agent with the brief in
   `references/finder-brief.md`. A finder that only reads code uses the read-only agent
   `craft:readonly-reviewer` (tools: Read, Grep, Glob). That agent cannot run anything. A finder
   that must attack the running app needs an agent that can run commands, and its brief says "run
   and observe, edit nothing". Finders attack the code and, when the app can run locally, the
   running app: double submits, empty and huge inputs, wrong roles, a dropped connection. Each
   finder returns claims as cards (severity, location, what breaks, how to reproduce, evidence)
   and an honest note for every cell where it found nothing.
4. **Disprove.** Give every claim to a second agent whose only job is to refute it. This skeptic
   must not be the finder that raised the claim and must not see the finder's reasoning beyond
   the card. It returns, per claim, "refuted" with the code or run that shows why, or "stands"
   with what it tried. A plausible claim that is wrong costs more than a missed nit, and no later
   step will catch it. Reread the cited code yourself for each claim that stands. Refuted claims
   go to the ledger's dismissed list with a one-line reason. They are never silently dropped.
5. **Fix what is confirmed.** One batch per round, worst first, at the root cause and not the
   symptom. For each fix:
   - Write a test that reproduces the bug and watch it fail on the old code.
   - Apply the fix and watch the same test pass.
   - Sweep the class: search for every other place with the same shape and fix those too. When a
     write path was wrong, check the matching read path, and the reverse.
   If two attempts at one bug both fail, stop patching. The design may be wrong. Move it to the
   needs-a-human list with what you learned.
6. **Prove the round.** Run the project's own checks, found in its files (for example
   `package.json` scripts, a `Makefile`, `pyproject.toml`, the CI configuration): type check or
   compile, lint, the full test suite. Any failure goes back to step 5.
7. **Record.** Mark the cells covered this round. Add fixes, dismissals and still-owed items to
   the ledger. If a new bug sits in a cell an earlier round marked covered, note why that pass was
   too shallow, so the next one is sharper.
8. **Decide whether to go again.** A round is "dry" only if it attacked its cells for real and
   found no new confirmed bug. A skim is not a dry round.
   - New confirmed bug this round: go again. The next round hunts the fresh fixes and new cells.
   - Dry round: stop (or require two dry rounds in a row if the user asked for a thorough hunt).
   - No valuable cell left: stop, and name the cells left blank.
   - Six rounds and still finding: stop. That is not converged. It is a question for a human
     about the design, not a reason for a seventh round.
9. **Report** in the format below. For a root cause that taught something, run `bug-retro`. Park
   out-of-scope discoveries with `later`.

Keep later rounds lighter than the first: fewer cells, and only the angles that produced a finding
last round plus the fresh fixes. Hunting unchanged code a second time mostly repeats the first
read. Fresh hunting goes to the strongest model you have. Refutation and reruns can use a cheaper,
faster model. The stop decision and the verdict stay with the main session. No helper declares the
hunt finished.

## Output format

```
Target: <area> | Mode: fix | find-only | Branch and commit: <ref>
Verdict: converged, <N> rounds, last <K> dry | blocked | not converged | stopped by the user
What that means: no new confirmed bug in the cells hunted. It is not proof of zero bugs.

Needs a human (first, never buried)
  <item> : <what is needed and why>

Fixed
  [round] <severity> <bug> | <path:line> | root cause | test: <name>, failed before, passes after | class swept: yes/no

Confirmed, not fixed (find-only mode)
  <full card per bug, worst first>

Dismissed
  [round] <claim> : <why it is fine, with the evidence>

Checks run: <each command and its result, pasted>
Coverage: <cells hunted> of <cells total>. Left blank: <list>
Find rate per round: r1 <n>, r2 <n>, ...
Ledger: <path>
```

## Hard rules

- Nothing counts as a bug until a second agent has tried and failed to disprove it.
- Nothing counts as fixed without a test seen failing before the fix and passing after. If no
  test can be written, say why and show the before and after behaviour another way.
- Never change a test so that a bug passes it.
- The skeptic is never the finder. The fixer's work is never the only check on itself.
- Hunt and fix on local or development systems only. Probes against a live system are read-only,
  slow, and agreed with the user first.
- Never report "zero bugs" or "all found". Use the verdicts above.
- A problem that needs a product decision, a secret or live data is not half-fixed. It goes on
  the needs-a-human list.
- Commit only if the user asked. Never push from this skill. Use `guardrails:push-review` first.
  If the guardrails plugin is not installed, run the checks on the exact commit and have
  `craft:readonly-reviewer` read the diff before any push.

## Common mistakes

- Reading code and calling it a hunt, without ever running the app or sending a hostile input.
- Accepting a finder's claim because it sounds right.
- Fixing the one reported instance and leaving its twins.
- Writing the test after the fix, so it was never seen failing.
- Deleting dismissed claims to tidy the ledger, so the next round raises them again.
- Treating a surprising "nothing found" as clean when the search itself was wrong (wrong path,
  wrong pattern, wrong port).
