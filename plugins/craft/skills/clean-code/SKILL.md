---
name: clean-code
description: Holds code to a senior readability bar, in two modes. Grade mode reads the code and reports a score out of 10, a scorecard per dimension and a ranked list of fixes, and edits nothing. Fix mode applies those fixes in a worktree with behaviour pinned by tests first. Use when the user says "is this clean", "grade this module" or "check code quality" (grade), or "clean this up", "refactor this" or "tidy this file" (fix). Not for finding bugs (bug-hunt), a bug review of a diff (Claude Code's /code-review), speed (performance) or screens (ux-review).
---

# clean-code

One bar, two modes. **Grade** answers "would a senior engineer sign this, and could a newcomer read
it?" with a score, a scorecard and a ranked fix list. It edits nothing. **Fix** brings existing
code up to the bar in small, proven steps, without changing what the code does. The rules both
modes cite live in `references/rules.md`.

## When to use

- Grade: before a commit or pull request, on a module people find hard to read, or to plan a
  cleanup.
- Fix: when the user asks for the cleanup itself. If it is unclear which mode is wanted, grade
  first and offer the fix.

## When not to use

- Looking for bugs: use `bug-hunt`. Slow code: use `performance`. How a screen looks: use
  `ux-review`.
- A diff that only changes documentation.
- Half-built code. Finish the feature first, or every finding is "not done yet".

## Grade mode (read-only)

1. **State the target in one line.** The working diff, a branch, a folder or the whole project.
   A vague target gives a vague grade.
2. **Measure before judging.** Run the project's own linter and type check if it has them (look in
   `package.json`, a `Makefile`, `pyproject.toml`, the CI configuration). Count the mechanical
   signals with search: debug prints, commented-out code, silenced errors, untyped escapes,
   functions over about 80 lines, files over about 500 lines. Numbers make two runs comparable.
3. **Read the code.** A count is a symptom. The grade comes from reading. For a large target read
   a sample and say so: the largest files, the most recently changed files, and a few at random.
4. **Apply the rules.** Read `references/rules.md` and check each group: names, functions,
   comments, duplication, errors, boundaries, security hygiene, tests.
5. **Run the newcomer test on each file read.** Could a new team member, with the file name and
   one minute, say what this does and where a bug would hide? If not, name the one thing that
   stops them. This is the dimension that predicts maintenance cost, so it counts twice.
6. **Score and rank.** Use the output format below. Every finding has a location, a rule id and an
   exact fix. A finding with no location is dropped.
7. **Confirm nothing changed.** Run `git status`. It must match the state before the run.

For a large target, helper agents can each read one area. Use a read-only agent such as
`craft:readonly-reviewer`. Each returns findings as `path:line`, rule id, fix, and a list of
what it read. The final score stays with the main session, on the strongest model you have. No
helper grades from counts alone.

## Fix mode (edits code)

1. **Work in a worktree.** Use `worktree-first`. A cleanup touches many files and must not mix
   with other work in the main checkout.
2. **Take a baseline.** Run the type check and the full test suite before the first edit, and save
   the counts from grade step 2. You need to know which failures you inherited.
3. **Pin behaviour first.** For anything you will split or move, make sure a test asserts today's
   output. If none exists, write one and see it pass before the change. Without it, "no behaviour
   change" is a hope.
4. **Mechanical pass.** Renames, dead comments, debug prints, unused code. These are safe to hand
   to helper agents on a cheaper, faster model: one agent per folder, never two on one file, each
   given the exact line list and the rule. Each returns its diff and the commands it ran. Read
   every diff yourself before keeping it.
5. **Judgment pass.** Splitting functions and files, moving responsibilities, fixing error
   handling and security findings. Keep these on the strongest model you have.
6. **Leave contracts alone.** Do not rename public URLs, API fields, stored field names,
   configuration keys or anything another system reads. A cleanup that breaks a client is a bug.
7. **Prove it.** Type check clean, the full test suite green, the counts lower than the baseline.
   Tests must pass on the base and on the result, so a failure can be traced to the cleanup or
   cleared of it.
8. **Keep each fix separate.** Commit only when the user asked for commits. Then make one small
   commit per fix on the worktree branch, the rule id in the message, so any one of them can be
   reverted alone. Otherwise leave the changes in the worktree and list them by rule id. Do not
   push or merge. That is the user's call, through `guardrails:push-review`. If the guardrails
   plugin is not installed, the checks run on the exact commit and `craft:readonly-reviewer`
   reads the diff before a push.

## Output format

Grade mode:

```
Target: <what was graded> (<full read | sampled: which files>)
Score: <n>/10
Why: <three lines>

Scorecard (1 to 10, with the count behind it)
  naming <n> | functions <n> | comments <n> | duplication <n> | errors <n>
  boundaries <n> | security hygiene <n> | tests <n> | newcomer test <n> (counted twice)

Findings, worst first
  Critical  <path:line>  <rule id>  <exact fix>
  Major     <path:line>  <rule id>  <exact fix>
  Minor     <path:line>  <rule id>  <exact fix>

Cleanup estimate: <files to change, grouped: rename / split / delete / move / add test>
Not read: <what was skipped>
Changed: nothing (git status matches the start)
```

Score formula, so two runs agree. Each dimension starts at 10. Each Critical finding in it takes
off 3, each Major 2 and each Minor 1. No dimension goes below 1. The score is the mean of the
scorecard with the newcomer test counted twice. A critical security finding caps the score at 5.

Fix mode:

```
Fixed: <count> findings in <count> files, by rule id
Baseline -> result: tests <a> passed -> <b> passed | counts <before> -> <after>
Commands run: <each command and its result>
Commits: <one per fix, listed | none, changes left in the worktree: <files>>
Left alone: <findings not fixed, with the reason>
Inherited failures: <tests that already failed on the base, or "none">
```

## Hard rules

- Grade mode never edits. If the user wants changes, switch to fix mode and say so.
- A fix changes structure, never behaviour. A behaviour change found on the way is reported, not
  slipped in.
- Never weaken or delete a test to get a green run.
- The agent that reviews a fix is never the agent that wrote it.
- Do not turn off a linter rule, a hook or a commit check to make a cleanup pass.
- Say what was not read. A sampled grade says "sampled".

## Common mistakes

- Grading from file names, line counts or linter output without reading the code.
- Reporting style preferences as findings. A finding needs a rule and a cost to the reader.
- Splitting a long function before a test pins what it does.
- Mixing a rename, a split and a bug fix in one commit, so nothing can be reverted alone.
- Renaming a field that a client or a stored record depends on.
