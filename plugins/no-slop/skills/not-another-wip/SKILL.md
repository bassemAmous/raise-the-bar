---
name: not-another-wip
description: Writes commit messages and pull request text that a teammate understands on first read, with no context from this session. Reads the pushed branch rather than the session, says the effect a person sees instead of the bookkeeping, keeps internal references out of the subject line, and checks every number and pointer against the branch before handing the text over. Use before a commit, and when the user says "write the commit message", "reword this commit", "these commits are unreadable", "write the PR description", "update the pull request text" or "reply to the review comments". Not for a handoff note to another session (message-in-a-bottle), test cards (homework-for-humans) or the push review itself (you-shall-not-push).
---

# not-another-wip

A commit message is read by a teammate scrolling the history. A pull request text is read by a
reviewer, once, before they act. Neither saw this session: not its notes, not its numbering, not
the words it invented along the way. Write for them. And write from the branch, not from memory:
the reader will open the branch, so every claim must already be true there.

## When to use

- Before any commit, including an amend or a fixup.
- When a pull request is opened, or a push changes what its text says.
- When review comments need replies.

## When not to use

- Notes for another session: use `message-in-a-bottle`.
- Cards for a person who tests by hand: use `homework-for-humans`.
- Deciding whether the code may be pushed: use `you-shall-not-push`.

## Step 1: read the branch, not the session

Before writing a word:

- `git fetch`, then compare local and remote: `git rev-list --left-right --count
  HEAD...origin/<branch>`. Unpushed commits change what the text may say. Push first, through the
  project's push review.
- Every file the text points at exists on the pushed branch: `git ls-tree -r --name-only
  origin/<branch> -- <path>`. A path the reviewer cannot open is not a pointer.
- Every number is measured again on the pushed tip: versions from the lock file, test counts from
  a run, never copied from an earlier draft.
- Every file the text says changed is in `git diff --stat origin/<base>...origin/<branch>`.
- Read the last twenty subjects with `git log --oneline -20` and follow the project's style: a
  ticket prefix, the verb form, a commit-message linter's rules if it has one.

## The commit subject

`<prefix if the project uses one>: <what changed, in words a reviewer uses>`

- **Say the effect, not the bookkeeping.** What does the code, the page or the tests do now that
  they did not before? "stop the order button working after checkout closes" beats "keep the
  order controls live until the server confirms".
- **One change.** A subject that needs "and" or a comma list is too detailed. Pick the main
  change. The body lists the rest.
- **No internal references in the subject:** no `#285`, no "(f)", no "card A1", no "round 3".
  They may go in the body's last line.
- **No session words.** Words that meant something only inside the session get translated:
  "pin a behaviour" is "add a test for", "probe" or "rig" is "test" or "test setup", "parity" is
  "behave like the old app".
- **72 characters at most**, prefix included.
- **A documentation commit says so:** "document why the export waits at most three minutes".

## The commit body

Optional for a trivial change. Otherwise three short parts: what was wrong (what someone saw),
what changes (in plain words), and how it was checked (one line). Then, last, one line of
references if any. Wrap at 72 characters. A term used for the first time gets five words of
meaning, or gets cut.

One commit per module (a library, a feature, the tests, the docs), each green on its own. A
follow-up folds into its module with `git commit --fixup=<sha>` and an autosquash rebase.

## The pull request text

About ten lines, unless the project's own pull requests use another shape:

```
Waits for <what>. Do not merge.      only when something blocks the merge
## Why
<one to three short sentences: the problem, or who asked; not the title again>
## What changed
- <one bullet per real change: what someone now sees or can do, in a full sentence>
<Who> see no change.                 only when true
Tested on <short sha>: <checks with counts>. <manual or live checks in one sentence>.
```

- A fixed bug says what was wrong, then what happens now.
- In an app, function names, file paths and test-setup words stay out of the bullets. A library
  names its new functions, because callers see them.
- Every "tested on" names a commit that is on the remote branch.
- The title is a paste unit too: what the user gets, never the first commit's subject.
- No follow-ups, open decisions or old bugs unless the user agreed to list them.

## Replies to review comments

One short reply per comment, in the order the host shows them:

| The comment's point is | Reply |
| --- | --- |
| fixed | "Done in `<sha>`." and at most one line on what changed |
| moved to a new ticket | "Moved to ABC-123." |
| dropped, as asked | "Dropped." |
| not agreed | one line on why, then the question |

Every sha in a reply is on the remote (`git branch -r --contains <sha>`). Every promise is already
true on the pushed branch: "I will remove this file" becomes "Removed in `<sha>`" once it is, and
is not sent before. A problem inside the change's own scope is fixed before the reply, not offered
as an option.

## Check before handing it over

The author's own reread misses things. Have a fresh agent, such as `no-slop:readonly-reviewer`,
read only the text and the branch, check each line with a command, and return the wrong ones:

1. Every number matches the pushed tip, and every "before" comes from the base, not from memory.
2. Every pointer opens: a commit on the remote, a ticket id, a tracked file.
3. No placeholder, no "above" without a referent, no promise not yet done.
4. Each line is one fact the reader can act on.

Fix what it finds, then hand over the text and say where each part is pasted.

## Hard rules

- The text describes the pushed branch. Push first, then write.
- No personal names. Attribution lines follow the project's own rules.
- Never route around a commit-message check. Fix the message.

## Common mistakes

- A subject full of the session's private words, unreadable to anyone else.
- Copying a test count from an earlier draft after the tests changed.
- Replying "done" to a comment before the fix is pushed.
- Listing every file touched instead of what a person now sees.
