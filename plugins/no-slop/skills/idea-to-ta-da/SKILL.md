---
name: idea-to-ta-da
description: Builds a feature from a rough idea to working, proven code. Sharpens the ask into a short brief, writes a plan, has the plan reviewed before any code exists, builds the smallest version that delivers the value, then proves it with tests and a real run. Use when the user says "build this", "add a feature", "I want a ...", "can you create", "make this idea real", "implement this", or drops a feature idea with no plan. Also use for "review my plan", which runs the planning half only and changes nothing. Not for a one-line or trivial edit (just make it, do not run this skill), bug hunting (most-wanted-bugs), code grading (spaghetti-meter) or slow code (find-the-snail). Formerly named "build-it", and still answers to that name.
---

# idea-to-ta-da

One front door for "I have an idea, make it real". The user gives a rough ask. This skill sharpens
it into a short brief, plans it, has the plan reviewed before any code exists, builds the smallest
version that delivers the value, and proves that it works. It ends at a proven local change and a
short report. It does not push, merge or deploy.

## When to use

- The user drops a feature idea or a change request with no plan: "build X", "add Y", "I want a ...".
- The user has a plan and wants it checked first: "review my plan", "check this plan before I build". Run
  steps 1 to 7 only. In that mode nothing is edited, and `git status` must be unchanged at the end.

## When not to use

- A bug to find and fix: use `most-wanted-bugs`. Code to grade or tidy: use `spaghetti-meter`. Slow code: use
  `find-the-snail`.
- "Should we build this at all?" is a product decision. Say so and ask the user before spending a
  build on it.
- A one-line edit. Just make it.

## Steps

1. **Check for work in progress.** Read recent commits, the current diff and any task list for
   this same ask. If it is partly built, continue from the first unproven step. A restated ask is
   often not a new one, and rebuilding wastes the earlier work.
2. **Restate the ask.** One line for the real intent, then the smallest version that delivers it,
   then what is out of scope. Fixing the scope now is what stops the build from growing later.
3. **Find what already exists.** Search the codebase for the concept, not only the name. Name the
   helper, route, component or pattern you will reuse. Rebuilding something that exists is the
   most common waste.
4. **Think wider than the words.** The literal request is the minimum. Check each of these and
   add what it surfaces to the cut:
   - Both sides: if one person enters data and another sees the result (an address that becomes a
     map link), the person entering it needs a way to preview the result.
   - Existing data: a feature that reads an old field in a new way inherits every old row, empty
     or wrong. Look at the real rows and decide: handle, migrate or flag them.
   - Every actor: list who touches this and what each needs to see, control and trust.
   - Bad input: empty, too long, wrong format, offline. Warn early and give a plain reason.
   - Every layer: a new value must pass the form, the API and the storage rules, not only the form.
   - A replacement: when new work replaces an existing screen or flow, list every settled element
     of the old one (fields, labels, shortcuts, states). The new one keeps each, or the brief
     flags its removal for the user to accept.
   - The obvious extra: what would an expert add that was not asked? Build it only if it is cheap
     and clearly belongs. Offer the rest as options.
5. **Show the brief** in the format below, then keep going. Showing it early makes a wrong
   reading cheap to correct.
6. **Write the plan.** Ordered steps, the files to touch, the test for each new path, and anything
   that will not ship by merging code (configuration, a schema change, a data backfill, a new
   dependency).
7. **Review the plan before code.** Follow `references/plan-review.md`. For a small change, review
   it yourself. For a weighty one (new module, authentication, payments, data migration, public
   API), use a reviewer that did not write the plan, for example the `no-slop:readonly-reviewer`
   agent. Give it the plan and the code paths, not your opinion of the plan. It returns a verdict
   (sound, fix first, or rethink), the gaps, and the evidence for each gap. Fold the fixes in.
8. **Build in a worktree.** Use `main-is-lava` so the main checkout stays clean. Match the
   conventions of the code around you and hold the `spaghetti-meter` bar while writing. If the work
   splits into independent parts, helper agents can build them in parallel. Split by slice of
   behaviour, not one agent per file: each agent gets one slice and every file that slice needs,
   and no file goes to two agents. Each works in its own worktree, from a brief with acceptance
   criteria. Each helper returns a summary of its diff and the exact commands it ran with their
   output. Read every diff and rerun the checks yourself, because a helper's "done" is a claim,
   not evidence.
9. **Prove it.** Find the project's own commands in its files (for example `package.json` scripts,
   a `Makefile`, `pyproject.toml`, the CI configuration). Run the type check or compile step, the
   linter, and the affected tests. Then run the feature in the real app and use it.
   - A screen changed: take a screenshot and run `pixel-police` on it.
   - Something writes (a button, a webhook, a payment): trigger it twice at the same moment, and
     once after a timeout and retry. One result must remain.
   - The ask named a breadth ("all four templates", "same as page X"): list the items and check
     each one. Passing tests on a thinner version is a silent scope cut.
10. **Report** in the format below. Park unrelated things you found with `future-me-problem`. If you fixed a
    real bug on the way and it taught something, run `bug-autopsy`.

## When to stop and ask

Keep going without checkpoints, except in these cases. Ask one short question with your
recommended option first.

- The ask has two or more real readings and the choice matters.
- You would deliver less than was asked.
- A step cannot be undone cheaply: live data, a schema change, anything that moves money.
- You are blocked on a secret, a product decision or data you cannot reach.

## Output format

The brief (step 5):

```
Intent: <one line>
Smallest version: <what will be built>
Out of scope: <what will not>
Reusing: <existing code, so it is not rebuilt>
Starting from: <the raw source: real rows, the live screen, the current code>
Proven by: <the outside check: a test that fails without the change, the real page>
Assumptions: <one to three, plainly>
```

The final report (step 10):

```
Built: <what now exists, in one or two lines>
Cut or deferred: <item, reason, where it was parked>
Evidence:
  <command> : <result, pasted, not paraphrased>
  <test name> : failed before the change, passes after
  <screenshot path> : <what it shows>
Not shipped by code: <configuration, schema, data or dependency steps still owed, or "none">
Needs a human: <decisions or access, or "none">
Not verified: <anything you could not run, said plainly, or "nothing">
```

## Hard rules

- No "done" without evidence. Every claim in the report points at a command output, a test seen
  failing then passing, or a screenshot. If something was not run, write that it was not run.
- Work on local or development data only. Do not write to shared or live systems.
- Do not shrink the scope silently. Either build what was asked or ask.
- The plan reviewer must not be the plan's author when the change is weighty.
- Stay inside the brief. New ideas found during the build go to `future-me-problem`, not into this change.
- Do not commit, push or merge unless the user asked for it in this request. Before a push, run
  `no-yolo:you-shall-not-push`. Before saying "done" on a large change, run `no-yolo:done-done`.
  If the no-yolo plugin is not installed, do both by hand: before a push, run the checks on the
  exact commit and have `no-slop:readonly-reviewer` read the diff, and before "done", rerun the
  checks and match each claim in the report to its output.

## Common mistakes

- Building the literal sentence instead of the intent behind it.
- Skipping the search and writing a second copy of a helper that already exists.
- Handling new input and forgetting the rows that were stored before the feature existed.
- Calling it done because the tests pass, without ever opening the feature in the running app.
- Accepting a helper agent's summary without reading its diff.
- Reusing an old permission to push for new work that was found later.
