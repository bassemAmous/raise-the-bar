---
name: you-shall-not-push
description: Gets a commit ready for a protected branch, in the order the guard checks it. Runs the tests on the record, has a read-only reviewer who did not write the code review the diff, fixes what blocks, records the passed review, then stops for the human approval that production needs. Use before a push to a protected or production branch, when the user says "ship it", "merge to main", "send it to staging", "release this" or "is this ready to push", or when the guard refuses a push and lists what is missing. Not for a push to a feature branch. Formerly named "push-review", and still answers to that name.
---

# you-shall-not-push: the push review

A push to a protected branch needs three things on record for the exact code being pushed: the
tests passed, a review passed, and (for production) a human approved. This skill produces the
first two honestly and prepares the third. The records are tied to the content of the commit, so
any new commit starts again. That is the point: nobody ships code that differs from what was
tested and reviewed.

## When to use

- Before any push to a branch the project protects.
- When the guard answers a push with "BLOCKED by guardrails" and a list.

Not for a feature branch nobody deploys from: push those freely.

## Steps

1. **See where you stand.** Run `guardrails status`. It prints the commit, the test command, and
   which records exist. If the working tree has uncommitted changes, commit first: a record is
   for a commit, never for loose files.

2. **Name the range.** Fetch, then set `base` to the remote tip of the target branch and `head`
   to the commit you will push. Save the diff where the reviewer can read it, outside the
   repository:
   `git diff <base> <head> > <temp folder>/you-shall-not-push.diff`
   Also list the changed files. If the diff is only documentation, say so: the guard asks for no
   tests and no review then.

3. **Tests first.** Run `guardrails test`. It runs the project's own test command on the
   committed code and records the pass. Red means fix, commit, run again. Do the tests before the
   review: a fix after the review changes the code, and the review no longer covers it.

4. **Independent review.** Start the agent `no-yolo:readonly-reviewer` with the diff file, the
   list of changed files, the commit id, and one paragraph on what the change is meant to do. The
   reviewer has no tools that write, and it must not be the session that wrote the code: an
   author reads what they meant, a reviewer reads what is there. Ask for findings in this shape:

   `SEVERITY | file:line | what is wrong | evidence | smallest fix`

   Severity is Critical (data loss, security hole, production down), High (wrong behaviour users
   will hit, missing authorisation, a migration that cannot be undone), Medium, or Low.

5. **Check the findings, then fix what blocks.** Open each Critical and High finding yourself and
   confirm it is real before you act on it: reviewers are sometimes wrong. Fix the confirmed
   ones, add or adjust a test that would have caught each, and commit. Then go back to step 3:
   new code needs a new test run and a new review of the new diff. Medium and Low findings go in
   the report, and into the backlog if they will not be fixed now.

6. **Write the report and record it.** Write the report to a file outside the repository. It
   must name the commit (its first 8 characters) and its last three lines must be exactly
   these, in this order, with nothing after them:

   ```
   VERDICT: PASS
   OPEN-CRITICAL: 0
   OPEN-HIGH: 0
   ```

   Paste the finding lines of the last review into the report, above those three lines, as the
   reviewer wrote them. The two counts are counted from the reviewer's own finding lines. The
   author of the code does not type them from memory and does not lower them. A Critical or High
   finding stays open until it is fixed and reviewed again, or the reviewer withdraws it.

   Then run `guardrails review-stamp --report <file> --reviewer <who reviewed>`. The command
   refuses a report for another commit, a missing trailer, a FAIL, or open Critical or High
   findings. Never write PASS over open findings to get the stamp: the report is kept next to the
   record and anyone can read it later.

7. **Production: stop for the human.** If the target is a production branch, you cannot finish
   alone. Say in plain words what will ship (the commit, the changed areas, anything that does
   not ship with the code, such as a new environment variable or a data change), and ask the
   human to send the approval line the guard shows as a message of its own, with nothing else
   in it, for example `approve production 3f2a9c1e`.
   Do not look for another way. The approval is the one step that is not yours.

8. **Push.** Send the same push again, as its own command: not chained after a commit, a merge
   or a script. The guard judges a line before it runs, so it refuses a push that follows
   something that changes the code. If the guard still refuses, read its list: it names exactly
   what is missing.

## What the reviewer looks for

- Correctness: does the code do what the change says, including the empty, the huge and the
  failing case?
- Security: who is allowed to call this, is input checked, can a value reach a query, a shell, a
  file path or a URL fetch unchecked, is anything secret logged or returned?
- Data: migrations that lose data or cannot be rolled back, writes without a filter.
- Failure: what happens when the network, the database or a third party fails halfway?
- Tests: is the new behaviour covered by a test that would fail without the change?
- Outside the code: settings, secrets, indexes, scheduled jobs or flags that must change with
  this release and will not travel with the push. Every environment variable the code reads
  already exists where it will run, before the code that reads it ships.
- What goes stale: docs, records or screens this push makes wrong, named in the report.

## Hard rules

- Never mark a review passed that did not happen, and never review your own diff as the
  independent reviewer.
- Never edit files under the guard's record folder, and never run `guardrails approve`.
- Never change `guardrails.config.json` to make a push pass. If the config is wrong for this
  project, say so and let the human change it.
- A repeat push is a new gate: new commits mean a new test run and a new review.
- Each commit in the range is green on its own, so any of them can be reverted or bisected.
- Stage explicit paths, never `git add -A`. Open a pull request as a draft, and never merge it.
- If a step cannot be done, say which one and why. A refused push with an honest reason is a
  good outcome.

## Common mistakes

- Reviewing first and testing after, then fixing a test failure and pushing code nobody reviewed.
- Handing the reviewer a summary instead of the diff. It then reviews the summary.
- Treating every finding as true. Confirm before fixing.
- Asking the human for approval before the tests and the review are on record. Ask once, when
  everything else is done.
