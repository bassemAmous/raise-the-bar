---
name: future-me-problem
description: Captures deferred work as a backlog entry that someone with no context can pick up cold, so "later" never means "forgotten". Adds an entry with the reason it was deferred and ordered pickup steps, lists what is open, and marks entries done or dropped while keeping the history. Use when the user says "do it later", "defer this", "park this", "note for later", "add it to the backlog", "not now but", "what's on the later list" or "mark that one done", and whenever an out-of-scope idea or a non-urgent problem turns up in the middle of other work. Not for a bug to fix now (most-wanted-bugs) or an idea to build now (idea-to-ta-da). Formerly named "later", and still answers to that name.
---

# future-me-problem

One durable place for work that is consciously put off: the right version is known, but now is
not the time. Each entry is written so that a newcomer, or a future session with no memory of
today, can start from the entry alone. A one-line "todo: fix this" fails that test, and a deferred
item nobody can restart is a lost item.

## When to use

- You or the user decide "good idea, not now": an improvement outside the current scope, a
  refactor you noticed, a follow-up on another branch, a non-urgent problem.
- The user asks what is parked, or wants an entry closed, dropped or started.
- Another skill finds something outside its scope (`idea-to-ta-da`, `most-wanted-bugs`, `spaghetti-meter`).

## When not to use

- A bug that must be fixed now: use `most-wanted-bugs`. An idea to build now: use `idea-to-ta-da`.
- A step that must happen for a release to work (a configuration change, a data migration). That
  belongs in the release checklist, where it cannot be skipped.
- A lesson from a bug. That goes to `bug-autopsy`.

## Where the backlog lives

Use the backlog the project already has, if there is one: look for a backlog or roadmap file, or
ask whether the team uses an issue tracker and wants entries there. If nothing exists, ask the
user before creating a file. The default is `docs/backlog/LATER.md`, with the template below at
the top. Keep one backlog. Notes scattered through the code as comments are not found again.

## Steps

### Add (the default)

1. **Read the backlog.** Find the highest id and take the next number. Check that the item is not
   already there. If it is, add the new detail to that entry.
2. **Fill every field of the template.** The two that matter most:
   - Why deferred: the honest reason (out of scope, blocked, wrong branch, no time). If it is
     blocked, name what blocks it.
   - Pickup steps: ordered steps a newcomer can follow. Name the branch, the files, the code to
     copy from, and the check that proves it is done.
3. **Use real detail from the current work.** Files touched, what already exists, related issues,
   pull requests or commits. Detail is cheap now and expensive to rediscover.
4. **Append the entry at the end.** Never renumber. Other notes may refer to the ids.
5. **Read it back as a stranger.** Could you start from this entry alone? If not, add what is
   missing.
6. **Tell the user in one line, then resume** the task you were on. Capturing an item must not
   derail the current work.

### Review

1. Read the backlog and list the entries that are open or in progress, each as id, title and the
   one-line reason it was deferred.
2. Point out entries that look stale: open for a long time, or overtaken by later work. Suggest
   dropping them with a reason rather than letting the list rot.
3. Offer to show one in full or to start it with `idea-to-ta-da`.

### Close or update

1. Set the status to done, dropped or in progress. Keep the entry: the history is the point.
2. On done, add the evidence: the commit or pull request, and the check that was run.
3. On dropped, add one line saying why.

## The entry template

```markdown
### LATER-<n>: <title that says what will exist when it is done>

- Status: open | in progress | done | dropped
- Added: <date>, during <the work that surfaced it>
- What: <the change, in two or three sentences, with the value it brings>
- Why deferred: <the honest reason, and the blocker if there is one>
- Where: <files, modules, branch>
- Already in place: <what exists that this builds on>
- Pickup steps:
  1. <first step, concrete>
  2. <next step>
  3. <how to prove it is done: the command, test or screen>
- Size: small | medium | large, <one line on why>
- Related: <issues, pull requests, commits, other entries>
```

## Output format

After adding:

```
Parked as LATER-<n>: <title>. Reason: <why deferred>. File: <path>
```

For a review:

```
Open: <count> | In progress: <count>
LATER-<n>  <title>  (deferred: <reason>)
...
Possibly stale: <ids, with why>
```

After closing:

```
LATER-<n> marked <done | dropped>: <evidence or reason>
```

## Hard rules

- Every entry can be started from the entry alone. If it cannot, it is not finished.
- Ids are permanent. Never renumber or delete an entry. Mark it instead.
- "Done" needs evidence: the commit or pull request and the check that was run.
- Deferring is not a way to reduce what was asked. If the item is part of the current request,
  ask the user before parking it.
- One backlog. Do not spread deferred work across comments, chat and several files.
- Do not commit the backlog file unless the user asked for commits.

## Common mistakes

- A title and nothing else, so the entry means nothing a month later.
- "Why deferred: later". Give the real reason.
- Stopping the current task to polish the entry, or starting the deferred work straight away.
- Adding a duplicate because the backlog was not read first.
- Using the backlog to hide a required release step or a bug that hurts users today.
- Letting entries stay open forever instead of dropping the ones that no longer matter.
