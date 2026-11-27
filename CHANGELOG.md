# Changelog

A plugin's `version` changes whenever its files change. People who already installed a plugin get
the new copy only then.

## 0.2.1

`guardrails` only. `craft` and `council` stay at 0.2.0. After an independent review that checked
the 0.2.0 code against its README. Every change below is covered by a test or is a change of text.

### guardrails

- **The lines for another tool's hook keep the list of branches.** The single line 0.2.0 printed
  for a `pre-push` hook that already exists took git's list of branches away from the commands
  under it. With git-lfs the large files were then not uploaded. `install-hook` now prints a few
  lines that keep the list and hand it on. They hold no path of your machine, so they can be
  committed with a shared hook, and a plugin update does not break them. If you added the old
  line: run `guardrails install-hook` and replace it with the lines it prints. `guardrails
  status` reports the old line.
- **A person is told from the agent by a marker, not by the terminal.** The agent's shell carries
  `CLAUDECODE`, `AI_AGENT` or `CLAUDE_CODE_ENTRYPOINT`. A push without one is a person's, also
  from the push button of an editor, which 0.2.0 refused.
- **Long options cut short.** git takes `--delet` for `--delete` and `--no-verif` for
  `--no-verify`. The guard now reads them the same way, for `git push` and `git commit`.
  `--no-verify` is refused with the destructive-command guard switched off too, and a route,
  alias or hooks setting handed to git with `--config-env` is refused.
- **The secret scan no longer depends on your own git settings.** With `diff.mnemonicPrefix`,
  `diff.noprefix` or `diff.relative` set, 0.2.0 could refuse a path listed in `allowPaths` and
  miss a key in a UTF-16 file or outside the current folder.
- **`git am` is scanned.** The patch files named on the line are read like a commit, with the
  commit messages they carry.
- **Protected places are found where git really keeps them.** A git folder with another name
  (`--separate-git-dir`, a bare repository with worktrees), a hooks folder named by
  `core.hooksPath` (`.husky`), and `.git/config` now get the same refusal or question, from a
  command and from the file-editing tools. Removing the whole hooks folder is asked about too.
- **Everyday PowerShell lines pass.** `git add -A; if ($?) { git commit -m "x" }`,
  `$ErrorActionPreference = "Stop"` and a pipe into `Out-Null` are no longer taken for a step
  that writes files. The same for `[[ ... ]]` and a plain `find` in Bash.
- **Three more ways to write a push are read:** `cmd //c "git push ..."`, `bash <<< "git push
  ..."` and a backslash inside the branch name.
- `install-hook` does not write into a hooks folder shared by several repositories or committed
  with the project, and never over a hook you changed by hand. `guardrails check` writes nothing.
- When the remote branch holds commits your clone does not have, the second check says "fetch
  first" in place of "would rewrite or delete".
- `guardrails status` shows more states of the hook, and names a setting in the config file that
  the guard does not know.
- The README now says: the approval is for the exact code (not the commit id), reading the
  protected places is allowed with the usual reading tools (not "always"), and how the agent is
  told from a person.

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
