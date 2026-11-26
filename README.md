# raise-the-bar

[![test](https://github.com/bassemAmous/raise-the-bar/actions/workflows/test.yml/badge.svg)](https://github.com/bassemAmous/raise-the-bar/actions/workflows/test.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Let the agent write the code. Keep the decision to ship.**

Three plugins for [Claude Code](https://claude.com/claude-code). They hold agent-written work to
the bar a senior engineer would: tested, reviewed by someone who did not write it, and never in
production without a person saying yes.

![The guard refuses a push to main and lists what is missing](assets/guardrails-demo.svg)

That is real output, and the picture is generated from it. Reproduce it with
`node plugins/guardrails/scripts/demo.mjs`.

## Install

```
/plugin marketplace add bassemAmous/raise-the-bar
/plugin install guardrails@raise-the-bar
/plugin install craft@raise-the-bar
/plugin install council@raise-the-bar
```

Each plugin works alone. Needs Node.js 20 or newer and git. No other dependency.

## The three plugins

### guardrails: the rules an agent cannot talk its way past

Hooks that run before the agent's commands. They do not ask the agent to behave; they check.

| Rule | What it stops |
| --- | --- |
| Secret scan | A commit that adds an API key, a private key, a password in a URL, or a `.env` file |
| Tests on record | A push to a protected branch when the tests did not pass on that exact code |
| Review on record | A push to a protected branch with no passed review of that exact code |
| Production lock | A push or deploy to production until a human approves that one commit |
| Forward-only history | Force-push to, or deletion of, a protected branch |
| Danger guard | `rm -rf` on root, home or `.git`, `--no-verify`, drop database, delete without a filter |
| Self-protection | The agent approving its own work, forging a record, or quietly editing the rules |

Also in the plugin: the skills `push-review`, `done-check` and `readonly-audit`, and a reviewer
agent that has no tools that write, so a review cannot change the code it reviews.

[Read more](plugins/guardrails/README.md)

### craft: how the work gets done

Eight skills for everyday engineering.

| Skill | What it does |
| --- | --- |
| `/craft:build-it` | Idea to proven code: short brief, plan, plan reviewed before code, smallest version, proof |
| `/craft:clean-code` | Grades code out of 10 with a ranked fix list, or applies the fixes with behaviour pinned by tests |
| `/craft:performance` | Measures first, finds where the time goes, ranks fixes by expected gain. Read-only |
| `/craft:bug-hunt` | Finders attack, a skeptic tries to disprove each claim, fixes are proven red then green |
| `/craft:ux-review` | Reviews real screenshots at phone and desktop width, not just the code |
| `/craft:worktree-first` | Every multi-file change in its own git worktree, promoted on purpose |
| `/craft:bug-retro` | One-minute lesson after a fix, saved where the next session will read it |
| `/craft:later` | Deferred work written so someone with no context can pick it up |

[Read more](plugins/craft/README.md)

### council: decisions with the disagreement left in

Four skills for decisions that are hard to undo. Each one puts opposed viewpoints in front of the
same question, makes them argue, and keeps the dissent in the answer instead of averaging it away.
The seats are roles (the buyer, the operator, the skeptic), not imitations of real people, and
every number is traced to a source or marked as assumed.

| Skill | What it does |
| --- | --- |
| `/council:strategy` | A quick "should we": three questions at most, six checks, one recommendation, the cheapest test |
| `/council:boardroom` | One weighty business or product decision, argued by opposed seats over rounds, scored, with a verdict |
| `/council:senior-council` | A technical fork argued by five engineering seats, with a fixed decision rule and the minority view kept |
| `/council:red-team` | One job: find how a chosen plan fails, rank the threats, say what to fix first |

[Read more](plugins/council/README.md)

## Why this exists

An agent that writes code is fast and confident. Both are a risk on the day it is wrong. Three
ideas run through everything here:

1. **Evidence, not claims.** "Done" needs something a person can look at. A test pass is recorded
   by the tool that ran it, for the exact content of the commit, and one more commit voids it.
2. **The author does not review.** Reviews are done by a separate agent whose write tools are
   removed, not by the session that wrote the code.
3. **A person decides production.** The approval names one commit, expires, and is read from what
   the human typed. The agent cannot produce it.

Generalised from the setup behind a production web and mobile app, rewritten to be driven by one
config file with no project-specific rules.

## Honest limits

- **Hooks are guardrails, not a sandbox.** They stop mistakes and shortcuts. An agent that sets
  out to defeat them on a machine it controls can find a way. Keep the server-side protections:
  branch protection, required reviews, deploy permissions.
- The hook judges a command before it runs. So a push to a protected branch has to be sent as
  its own command, not chained after the commit that creates the code, and a commit is not
  chained after a step that writes files. The guard says so, and says what to send instead.
- A test pass is recorded by the tool that ran the tests. A review pass is recorded from a report
  the agent hands in. The first is hard to fake; the second is kept for a person to read.
- The secret scan knows common key formats. It is not a replacement for a full scanner in CI.
- Skills are instructions a model follows. They raise the floor; they do not guarantee a result.

## Development

```
node --test plugins/guardrails/tests/guardrails.test.mjs   # 32 tests on real temporary git repositories
claude plugin validate .                                    # the marketplace file
claude plugin validate plugins/guardrails                   # each plugin
```

## Acknowledgements

The scored-council format in `council:boardroom` builds on ideas from
[nateherkai/roast-room](https://github.com/nateherkai/roast-room) (MIT). The text, the seats and
the code here are written from scratch.

## License

MIT
