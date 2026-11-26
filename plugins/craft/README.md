# craft

Eight skills for Claude Code that hold everyday engineering work to a senior bar: a plan reviewed
before code exists, fixes proven by a test seen failing first, reviews that read real screens and
real measurements, and nothing called done without evidence.

```
/plugin marketplace add bassemAmous/raise-the-bar
/plugin install craft@raise-the-bar
```

No setup. The skills find the project's own commands (tests, lint, build) from its files.

| Skill | Use it when | What you get |
| --- | --- | --- |
| `/craft:build-it` | You have an idea and want it built properly | A short brief, a plan reviewed before any code, the smallest version that delivers the value, and proof it works |
| `/craft:clean-code` | You want an honest read of code quality | A score out of 10, a scorecard per dimension and a ranked fix list. Fix mode applies them one commit at a time, with behaviour pinned by tests first |
| `/craft:performance` | Something is slow | The one slow operation pinned and measured, where the time really goes, and fixes ranked by expected gain. Read-only |
| `/craft:bug-hunt` | You want the bugs found before users find them | Rounds of finders, a skeptic that tries to disprove every claim, root-cause fixes proven red then green, and an honest list of what was not covered |
| `/craft:ux-review` | A screen needs a critical eye | Screenshots at phone and desktop width, findings ranked and tied to a spot on the screen, with the exact fix |
| `/craft:worktree-first` | Before any multi-file change | The work done in its own git worktree and branch, promoted on purpose after review, retired without losing anything |
| `/craft:bug-retro` | A bug took more than one try to fix | The symptom, the root cause, the clue that was missed and the pattern, saved where the next session will read it |
| `/craft:later` | Work is deferred | A backlog entry someone with no context can pick up, with the reason and the pickup steps |

## How they fit together

`build-it` is the front door. It calls on `worktree-first` to keep the main checkout clean, and it
ends with evidence, not a claim. `bug-hunt` and `clean-code` use the same rule for fixes: pin the
behaviour with a test, see it fail, fix, see it pass. `performance` and `ux-review` only read and
report, so they are safe to run at any time. `bug-retro` and `later` make sure that what was
learned, and what was put off, is written down.

Some skills mention the `guardrails` plugin from the same marketplace (an independent read-only
reviewer, a done check). They work without it.

## Limits

Skills are instructions a model follows. They raise the floor and make the work checkable. They
do not replace your own review of what ships.
