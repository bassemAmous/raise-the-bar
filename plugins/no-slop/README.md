# no-slop

Formerly the `craft` plugin.

Seventeen skills for Claude Code that hold everyday engineering work to a senior bar: a plan
reviewed before code exists, tests that are proven able to fail, reviews that read real screens
and real measurements, text a teammate can read, and nothing called done without evidence.

```
/plugin marketplace add bassemAmous/raise-the-bar
/plugin install no-slop@raise-the-bar
```

No setup. The skills find the project's own commands (tests, lint, build) from its files.

**Build and check**

| Skill | What it does |
| --- | --- |
| [`idea-to-ta-da`](skills/idea-to-ta-da) | Builds a feature from a rough idea: brief, plan reviewed before code, smallest version, proof it works |
| [`you-had-one-job`](skills/you-had-one-job) | Checks the work does all of the ticket and only the ticket, clause by clause, with proof |
| [`show-me-red`](skills/show-me-red) | Proves each test can fail: breaks what it checks, records that it goes red, and green on everything else |
| [`most-wanted-bugs`](skills/most-wanted-bugs) | Hunts bugs in rounds; a skeptic tries to disprove each one; fixes proven red then green |
| [`spaghetti-meter`](skills/spaghetti-meter) | Grades code readability out of 10 with a ranked fix list, or applies the fixes with behaviour pinned by tests |
| [`find-the-snail`](skills/find-the-snail) | Finds why something is slow by measuring first, then ranks fixes by expected gain. Read-only |
| [`pixel-police`](skills/pixel-police) | Reviews real screenshots at phone and desktop width, not just the code |
| [`lost-in-translation`](skills/lost-in-translation) | Finds text that is missing, stale or untranslated in any supported language |
| [`main-is-lava`](skills/main-is-lava) | Does every multi-file change in its own git worktree, so the main checkout stays clean |

**Write for people**

| Skill | What it does |
| --- | --- |
| [`not-another-wip`](skills/not-another-wip) | Writes commit messages and pull request text a teammate understands on first read |
| [`message-in-a-bottle`](skills/message-in-a-bottle) | Writes a handoff note another session can pick up cold, with a start check it runs first |
| [`homework-for-humans`](skills/homework-for-humans) | Writes tick-box test cards for a person who tests by hand, as one printable page |
| [`no-comment`](skills/no-comment) | Keeps code comments that say why, never what |
| [`no-great-question`](skills/no-great-question) | Makes replies plain: answer first, short sentences, no filler |

**Remember**

| Skill | What it does |
| --- | --- |
| [`bug-autopsy`](skills/bug-autopsy) | Saves the lesson of a fix, or of a mistake, where the next session will read it |
| [`future-me-problem`](skills/future-me-problem) | Writes deferred work down so someone with no context can pick it up |
| [`skill-issue`](skills/skill-issue) | Improves a skill from how it really ran, keeping its size flat or smaller |

## How they fit together

`idea-to-ta-da` is the front door. It calls on `main-is-lava` to keep the main checkout clean, and it
ends with evidence, not a claim. `most-wanted-bugs` and `spaghetti-meter` use the same rule for fixes: pin the
behaviour with a test, see it fail, fix, see it pass. `find-the-snail` and `pixel-police` only read and
report, so they are safe to run at any time. `show-me-red` is what makes a test count as proof, and
`you-had-one-job` holds the result against the ask. `bug-autopsy` and `future-me-problem` make sure that
what was learned, and what was put off, is written down.

`show-me-red` ships two small scripts with their own tests: `kill-matrix.mjs` reads Playwright JSON
reports and says which break turned which test red, and `make-mutants.mjs` builds broken copies of
an npm package to test against.

The plugin brings its own reviewer agent, `no-slop:readonly-reviewer`. Its only tools are Read, Grep
and Glob, so a review by it cannot change the code. Some skills also name skills from the
`no-yolo` plugin in the same marketplace (a push review, a done check). Each of those steps
says what to do by hand when `no-yolo` is not installed, so no-slop works without it.

## Limits

Skills are instructions a model follows. They raise the floor and make the work checkable. They
do not replace your own review of what ships.
