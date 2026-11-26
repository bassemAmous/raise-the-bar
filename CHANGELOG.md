# Changelog

A plugin's `version` changes whenever its files change. People who already installed a plugin get
the new copy only then.

## 0.2.0

After an outside review of 0.1.0. Every change below is covered by a test or is a change of text.

### guardrails

- **A second check, by git itself.** `guardrails install-hook` adds git's own `pre-push` hook. git
  runs it with the commit and the branch it is really sending, so a push is checked whatever the
  command line looked like. At your own terminal it only prints a note.
- **No test command is no longer a pass.** A push of code to a protected branch is refused until
  a test command is set, or until `"tests": { "required": false }` says the project has none.
  A folder named `test` is now found for Python projects, next to `tests`.
- **The secret scan reads more.** The commit message (`-m`, `-F`, a here-document), the message of
  a merge or a tag, the end of a rebase, merge, cherry-pick, revert or am (`--continue`),
  `git stage`, brace lists in `git add`, and shell aliases called from a subfolder.
- **Pushes written another way.** A backslash inside a word (`git pu\sh`), `bash -c -- "..."`,
  `git push -on`, a push rule in `remote.<name>.push`, a program named through a variable, and an
  alias or a push setting made on the same line as the push.
- **A guard that fails closes.** When the guard crashes or git does not answer in time, a line
  that can commit, push or deploy is refused, and one line on stderr says which check failed.
  All git calls of one command share one time budget, below the hook's own time limit.
- **Destructive commands.** Longer flag groups (`rm -rfvd ~`), `dropdb`, `mysqladmin drop`, and
  `TRUNCATE <table>` sent through a database client.
- The agent is asked before it changes git's hooks folder or `core.hooksPath`. `HUSKY=0` and
  git settings passed through the environment are refused on a line that commits or pushes.
- The README says plainly what the records are (plain files, not signatures) and what each of the
  two checks cannot see.

### craft

- The plugin brings its own read-only reviewer agent, so it works without `guardrails`. Every
  step that names a `guardrails` skill says what to do by hand without it.
- `worktree-first`: new branches no longer take the base branch as their upstream, cleanup never
  pushes, locked worktrees are skipped, and an update no longer overwrites an ignored file.
- `clean-code`: a written scoring rule, commits only when asked, a failing test is never removed
  without the user's word.
- `bug-hunt`: states the number of agent runs and asks first, and keeps its notes outside the
  repository in find-only mode.
- `performance`, `ux-review`, `later`, `build-it`, `bug-retro`: safer defaults (no `EXPLAIN
  ANALYZE` on a writing statement, no seed script without asking, no file created without asking).
- Every description says what the skill is not for, and no two skills share a trigger phrase.

### council

- `boardroom`: every seat now answers ruin risk, undo and its own-lens score for every option, so
  the caps and the scorecard read the answers about the recommended option. Round 3 cards carry
  the same fields.
- The number check recomputes every `Math` line, reads fenced blocks, fails a verdict it could
  read nothing from, and separates "a finding" (exit 1) from "did not run" (exit 2). It has tests.
- Working files with money figures go to a temp folder outside the project by default.
- `senior-council` and `red-team` state their cost and ask first. `red-team` names at most three
  threats critical.

### Repository

- CI runs on Node 20, 22 and 24, runs the council number-check tests, checks every skill
  description, and fails a pull request that changes a plugin without a new version.

## 0.1.0

First public version.
