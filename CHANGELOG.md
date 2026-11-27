# Changelog

A plugin's `version` changes whenever its files change. People who already installed a plugin get
the new copy only then.

## 0.3.0

All three plugins. **Breaking: the plugins and skills have new names, so the old slash commands
stop working.** Eleven skills are new, and some existing skills gained a few rules (listed below).

- **New plugin names.** `guardrails` is now `no-yolo`, `craft` is now `no-slop` and `council` is
  now `no-echo`. Install them again under the new names:
  `/plugin install no-yolo@raise-the-bar`, `/plugin install no-slop@raise-the-bar`,
  `/plugin install no-echo@raise-the-bar`, and uninstall the old ones.
- **New skill names.** `done-check` is `done-done`, `push-review` is `you-shall-not-push`,
  `readonly-audit` is `who-let-you-in`, `build-it` is `idea-to-ta-da`, `clean-code` is `spaghetti-meter`,
  `performance` is `find-the-snail`, `bug-hunt` is `most-wanted-bugs`, `ux-review` is `pixel-police`,
  `worktree-first` is `main-is-lava`, `bug-retro` is `bug-autopsy`, `later` is `future-me-problem`,
  `strategy` is `but-should-we`, `boardroom` is `let-them-fight`, `senior-council` is `rewrite-or-regret` and
  `red-team` is `what-could-go-wrong`. Each skill still answers to its old name in plain words. The
  full table is in the README.
- **The guard keeps its name.** The no-yolo plugin installs the guardrails guard. The
  `guardrails` command, `guardrails.config.json`, the `BLOCKED by guardrails` messages, the
  `guardrails:allow-secret` mark and the mark inside installed git hooks are unchanged, so
  existing setups keep working. A refused push now names the skill `no-yolo:you-shall-not-push`.
- **The approval refusal knows the new folder name.** The agent running `approve` through the
  `cli.mjs` of another installed copy of the plugin was recognised by the word `guardrails` in
  its path. That copy now sits in a folder named `no-yolo`, so that word is recognised too.
  Covered by a test.

### Added

- `no-slop:show-me-red`: proves each test can fail, with a kill table. Ships `kill-matrix.mjs` and
  `make-mutants.mjs`, each covered by `scripts.test.mjs`, run in CI.
- `no-slop:you-had-one-job`: holds the work against the ask, clause by clause, all of it and only it.
- `no-slop:message-in-a-bottle`: a handoff note a fresh session can trust, with a start check.
- `no-slop:not-another-wip`: commit messages and pull request text written from the pushed branch.
- `no-slop:no-great-question`: plain replies, answer first.
- `no-slop:no-comment`: comments that say why, never what.
- `no-slop:homework-for-humans`: tick-box test cards for a person, with two HTML templates.
- `no-slop:lost-in-translation`: missing, stale or untranslated text in every supported language.
- `no-slop:skill-issue`: improves a skill from real runs, size flat or down.
- `no-yolo:mind-the-headers`: read-only check of the security headers a live site sends.
- `no-echo:story-or-snore`: turns a pitch or talk into a story that carries the content. Offers 4
  to 6 stories mapped part by part to the product, stops for the pick, then writes a timed talk
  file. Ships `check-story.mjs`, covered by `check-story.test.mjs`, run in CI: it fails on a story
  element with two meanings, an open gap, a stock image, words that do not fit the time, a word
  the person asked to avoid and an ending with no callback. The deck look and the optional
  explainer video are described with no script; the video needs Playwright and ffmpeg, installed
  by the person.

### Changed

- `done-done`: a real page, not a health check; the production build served once; the variant
  trap; a check not run counts as red; skipped tests searched for; a deploy is done when the live
  file matches the build.
- `you-shall-not-push`: what this push makes stale; a repeat push is a new gate; each commit
  green; environment variables exist before the code reads them; explicit staging, draft pull
  requests, never a merge.
- `who-let-you-in`: audits the deployed commit; never proposes rotating an encryption key while
  its data exists; names each question class not covered.
- `most-wanted-bugs`: a skeptic pass on a clean round, counts that balance, a sibling sweep before
  a round closes, behaviour measured and never inferred.
- `pixel-police`: says "UX pass not run" without a running app; back-office checklist.
- `idea-to-ta-da`: a replacement keeps every settled element or flags its removal.
- `spaghetti-meter`: a rule group for signs of machine-written code.
- `bug-autopsy`: also after a mistake the agent made; never adapt a test to the bug.
- `main-is-lava`: monorepo aliases resolved inside the worktree; a branch-stack reference.
- `rewrite-or-regret`: a pre-mortem line in the output.

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
  command and from the file-editing tools. Removing the whole hooks folder is asked about too. A
  path written through a link, or with a Windows short name, is the same place.
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
