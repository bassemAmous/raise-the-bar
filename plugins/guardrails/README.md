# guardrails

Hooks for Claude Code that check the agent's commands before they run. Secrets stay out of git,
protected branches only get code that was tested and reviewed, and production waits for a person.

```
/plugin marketplace add bassemAmous/raise-the-bar
/plugin install guardrails@raise-the-bar
```

It works with no setup. To fit it to your project, run `guardrails init` in the repository and
edit the file it writes. Then run `guardrails install-hook` once: git itself then checks every
push a second time, however the command was written.

## What happens on a push

The agent runs `git push origin main`. Before the command runs, the hook reads it and answers:

```
BLOCKED by guardrails: commit 75e9538d is not ready for "main".
  tests passed for this exact code: NO
  review passed for this exact code: NO
  approved by a human: NO
Do these in order, from ~/shop:
  1. Run the tests through the guard, so the pass is on record:
       guardrails test        (or: node "<plugin>/cli.mjs" test)
     Red: fix, commit, run it again. Tests run any other way leave no record.
  2. Run the skill guardrails:push-review. A read-only reviewer reads the diff,
     and the pass is recorded with:  guardrails review-stamp --report <file>
     Test before you review: a fix after the review means a second review.
  3. Production is locked until a human approves this commit. You cannot do this step.
     Stop, say what will ship, and ask the human to send this line as a message of its own:
       approve production 75e9538d
Then send this exact push again, as its own command.
```

The agent does steps 1 and 2. Step 3 is yours: you type the line, the agent pushes again, and the
push goes through. Print this on a throwaway repository with
`node plugins/guardrails/scripts/demo.mjs`.

## One command, one decision

The hook runs **before** the command, so it sees the repository as it is before the line starts.
It does not guess what a line will have done by the time it reaches the risky step. It asks for
that step alone:

| The agent sends | The guard answers |
| --- | --- |
| `git commit -am "fix" && git push origin main` | Refused. The records are for the commit that exists now, not the one this line creates. Push as its own command. |
| `git status && git push origin main` | Judged normally. Reading first changes nothing. |
| `git commit -am "wip" && git push origin HEAD:feature/x` | Allowed. Feature branches are free. |
| `git add . && git commit -m "x"` | The files are scanned as they are on disk now, including new ones. |
| `echo "KEY=..." > .env && git add . && git commit -m "x"` | Refused. The file does not exist yet, so it cannot be read. Commit as its own command. |
| `npm run build && git add -A && git commit -m "x"` | Refused, for the same reason: the guard cannot know what the build writes. Run the build, then add and commit. |
| `npm test && git commit -m "x"` | Allowed. This commit takes only what is already staged, and that was scanned. |
| `git pom` (an alias for `push origin main`), `try { git push origin main } catch {}`, `echo "git push origin main" \| bash` | Read as the push it is. |
| `cd "$SOMEWHERE" && git push origin main` | Refused. The guard cannot tell which repository this is. Write the folder. |
| `bash -c "git push origin main"`, `(git push origin main)`, `git push origin main > log 2>&1` | Read as the push it is. |
| `echo "then git push origin main"`, a commit message or a `gh pr create --body` that mentions a push | Text, not a command. Allowed. |

## Two checks on a push

1. **Before the command runs.** The hook reads the command line and refuses a push that is not
   ready. It reads text, so it has blind spots: a push started by another program, or a line
   written so that its words do not show a push.
2. **When git sends.** `guardrails install-hook` adds git's own `pre-push` hook to the
   repository. git runs it with the commit and the branch it is really sending, after the shell,
   the aliases and the git settings have done their work. The same checks run again there: tests
   on record, review on record, the approval for production, forward-only history.

The second check is for the agent, not for you. In an agent's shell there is no terminal, so a
push that is not ready is refused. At your own terminal it prints a one-line note and lets the
push go: it is your call.

The hook is one file in the repository's hooks folder. It is never committed, a fresh clone does
not have it, and deleting the file removes it. A `pre-push` hook from another tool is never
replaced: the command prints the one line to add to it. After a plugin update the guard writes
its hook again by itself.

## How the records work

- A record is a small file under `.git/guardrails/`. It is never committed and never pushed.
- Its name is the **tree id** of the commit: a fingerprint of the exact file contents. Change one
  byte and the fingerprint changes, so an old pass never covers new code.
- `guardrails test` refuses to run when the files on disk are not exactly the commit: changed
  files, and also new files git does not know (they can make the tests pass on this machine
  only). It runs your test command and writes the record only on a green run.
- `guardrails review-stamp` takes a review report. The report must name the commit and its last
  three lines must be, in this order:

  ```
  VERDICT: PASS
  OPEN-CRITICAL: 0
  OPEN-HIGH: 0
  ```

  The report is stored next to the record, so anyone can read what the pass was based on.
- A change that only touches paths in `ignorePaths` (docs by default) needs no tests and no
  review. The message then says `not required (docs only)`, never `yes`. Production still needs
  the approval.
- A check that cannot run has not passed. With no test command (none in the config, none found
  in the project), a push of code to a protected branch is refused, and the message says what to
  set. A project without tests says so on purpose: `"tests": { "required": false }`.

## How the approval works

Two ways, both need a person:

1. **In the chat.** Send `approve production <first 7 or more characters of the commit id>` as
   a message of its own: those words and nothing else. A sentence that holds the line ("do not
   approve production 75e9538d yet"), or a paste of the guard's own message, approves nothing.
   The hook reads the session log and counts only messages a person typed: not the agent's own
   text, not tool output, not messages from other agents, not a summary of an older
   conversation. The approval is for that one commit and expires after `maxAgeMinutes` (60 by
   default).
2. **In your own terminal.** Run `guardrails approve`. It needs a real terminal and asks you to
   type the commit id. An agent's shell is not a terminal, so the command refuses there.

A typed approval that lets a push through is also kept as a record, with the same end time, so
that git's own hook can read it.

The agent is also refused when it tries to run `guardrails approve`, to write under
`.git/guardrails/` or to the session log, and it must ask you before changing
`guardrails.config.json`, git's hooks folder or `core.hooksPath`. Reading any of them is always
allowed.

Commands listed under `productionCommands` (a deploy script, for example) use the same line. In
a repository the approval names the current commit and opens those commands until it expires.
Outside a repository there is no commit to name: the line is `approve production now` and it
counts for 10 minutes.

## Commands

| Command | What it does |
| --- | --- |
| `guardrails status` | What the current commit has on record, whether the pre-push hook is installed, and any problem in the config file |
| `guardrails test` | Runs the tests and records a pass for this exact code |
| `guardrails review-stamp --report <file>` | Records a passed review |
| `guardrails approve` | Human only, real terminal: approve this commit for production |
| `guardrails check "<command>"` | Shows what the guard would say, without running anything |
| `guardrails init` | Writes `guardrails.config.json` with the defaults |
| `guardrails install-hook` | Adds git's own `pre-push` hook, the second check on every push |

The `guardrails` command is on the agent's path while the plugin is enabled. In your own terminal
use `node <plugin folder>/cli.mjs`.

## Configuration

`guardrails.config.json` in the repository root. Every key is optional. See
[the example](guardrails.config.example.json).

| Key | Default | Meaning |
| --- | --- | --- |
| `protectedBranches` | `main`, `master`, `staging`, `production`, `prod`, `release/*` | Pushes here need tests and review on record |
| `productionBranches` | `main`, `master`, `production`, `prod` | Pushes here also need the human approval |
| `productionCommands` | none | Regular expressions for deploy commands that need the approval, for example `\bdeploy\b.*--prod\b` |
| `ignorePaths` | `**/*.md`, `docs/**`, `LICENSE`, `.gitignore` | Changes only here skip tests and review |
| `tests.command` | detected for npm, pnpm, yarn, bun, make, Go, Cargo, pytest, Gradle and Maven | The command that must pass |
| `tests.allowUntracked` | `false` | Let `guardrails test` run with new files git does not know |
| `tests.required`, `review.required` | `true` | Turn a check off. With `tests.required` on and no test command, a push of code to a protected branch is refused |
| `approval.phrase` | `approve production` | The words the human types |
| `approval.maxAgeMinutes` | `60` | How long a typed approval counts |
| `secretScan.allowPaths` | none | Paths the secret scan skips, for example test fixtures |
| `dangerGuard.enabled` | `true` | The destructive-command guard |
| `onGuardError` | `allow` | What to do when the guard itself fails on a line that cannot commit, push or deploy: `allow` or `deny`. A line that can is always refused |

For one line that looks like a secret and is not, add the comment `guardrails:allow-secret` on
that line. The agent can write that comment too, so it does not pass alone: the commit then
asks you to confirm, with the file and the line. Paths under `secretScan.allowPaths` are skipped
with no question, and changing the config file asks you first.

**A config file with a mistake closes the guard, it does not open it.** If the file is not valid
JSON, or a key has the wrong type, commits and pushes are refused with the reason until the file
is fixed, and `guardrails status` shows the problem.

## The skills and the agent

- `/guardrails:push-review` walks the agent through tests, an independent review and the stamp, in
  the order the guard checks them.
- `/guardrails:done-check` makes the agent prove a result before calling it done.
- `/guardrails:readonly-audit` is a security audit that changes nothing, with every finding
  attacked by a second agent before it counts.
- `readonly-reviewer` is the agent the skills use for review. Its tools are `Read`, `Grep` and
  `Glob` only. It has nothing to write or run with, so the rule holds without trusting a promise.

## Limits

- **Hooks are guardrails, not a sandbox.** They catch the push that was not tested, the secret
  that slipped in, the shortcut at 2 a.m. The obvious ways around are closed (the agent may not
  approve, write a record or write the session log), but an agent that sets out to cheat on a
  machine it controls can still find one. Keep branch protection and deploy permissions on the
  server side as the real lock.
- **A record is a plain file, not a signature.** The guard refuses the agent's commands and edits
  that name the record folder, but it reads text: a path put together from a variable is not
  seen. A record tells someone who trusts the machine that a step ran. It does not prove it to
  anyone else.
- **Reading a command line is best effort.** The first check reads Bash and PowerShell text. A
  push started by another program (an IDE button, a script the agent wrote and ran, `xargs`), or
  a line written so that its words hide the push, is not seen there. The second check is for
  that: run `guardrails install-hook`. A merge made on the server (`gh pr merge`, a merge button)
  passes through neither check. Branch protection on the server is the lock for those.
- **The second check is a local file.** The agent is asked before it changes git's hooks folder
  or `core.hooksPath`, and `--no-verify` is refused. A fresh clone, or a machine where nobody ran
  `guardrails install-hook`, does not have it. `guardrails status` shows whether it is installed.
  It tells a person from an agent by the terminal and by the `CLAUDECODE` variable of the agent's
  shell. A program that fakes both passes as a person.
- **The test record is strong, the review record is weaker.** A test pass is written by the tool
  that ran the tests. A review pass is written from a report the agent hands in: the guard checks
  that the report names the commit and ends with a pass, and keeps it for you to read. It cannot
  check that the review was good.
- **One approval is a window, not a single use.** Until it expires, it covers every push of that
  commit and every command in `productionCommands`. Set `maxAgeMinutes` low if that is too wide.
- A push whose target is a shell variable cannot be read, so it is refused. Write the branch
  name. The same goes for a program named through a variable on a line that talks about git, and
  for an alias or a push setting made on the same line as the push: send them in two parts.
- Only `git push` is read as a push. `git send-pack` and `git subtree push` are not, and a
  remote-tracking ref moved by hand (`git update-ref`) can make a commit look already pushed.
- A line is judged before it runs. A commit that takes files from disk after a step that can
  write files is refused, even when that step is harmless: send it in two parts. A line that
  nests commands deeper than 12 levels, or holds more than 20 commits and pushes, is refused too.
- The end of a merge, a rebase or a cherry-pick (`--continue`) is scanned for what is staged at
  that moment, and so is the text of a commit message. The commits git replays by itself in the
  middle of a rebase are not read again.
- When the guard itself fails (a crash, or a git that does not answer in time), a line that can
  commit, push or deploy is refused, and one line on stderr says which check failed. Any other
  line goes through, so a bug in the guard never blocks `ls`.
- The destructive-command guard names a few catastrophes: the disk, the home folder, a system
  folder, the repository you are in, a dropped database, a delete with no filter. It does not
  follow `find -delete`, `git clean`, a delete piped from a listing, or a path held in a variable.
- The typed approval is read from the session log. The reader is tested against the row shapes
  of the terminal app and the VS Code extension. If another client writes a shape it does not
  know, the typed line is not counted: use `guardrails approve` in your terminal.
- The secret scan knows common key formats and high-entropy strings next to words like
  `password`. Short or word-like passwords pass. It does not replace a scanner in CI.

## Tests

```
node --test plugins/guardrails/tests/guardrails.test.mjs
```

40 tests. Each one builds a real temporary git repository with a real remote and runs the guard
against it: the full path to production, the refusals, the forged approvals, the secret scan,
the command shapes that must and must not be read as a push, and real pushes through git's own
hook. They run on Linux, macOS and Windows, on Node 20, 22 and 24.

The guard was reviewed twice by an independent agent that was asked to break it, and a third
time by an outside reviewer. Every bypass they found is either closed and covered by a test, or
listed under Limits.
