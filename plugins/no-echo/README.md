# no-echo

Formerly the `council` plugin.

Five skills for Claude Code. Four put a decision in front of opposed viewpoints before you commit
to it. The seats argue, score the options and sign off on the wording. The disagreement stays in
the answer, and every number is traced to a source or marked as assumed. The fifth,
`story-or-snore`, turns what you decided into a talk people stay awake for.

```
/plugin marketplace add bassemAmous/raise-the-bar
/plugin install no-echo@raise-the-bar
```

| Skill | Use it for | What you get |
| --- | --- | --- |
| `/no-echo:but-should-we` | A quick "should we" question | At most three questions back, six ordered checks, one recommendation, the cheapest test and one next move |
| `/no-echo:let-them-fight` | One weighty business or product decision that is hard to undo | A neutral Chair, opposed seats (buyer, user, operator, money, offer, bet, delivery), two or three rounds, scored options, one verdict with conditions and the dissent kept |
| `/no-echo:rewrite-or-regret` | A costly technical fork: a rewrite, a datastore, a migration, a core dependency | Five engineering seats (maintainer, security, on-call, product, skeptic), a fixed decision rule, and the minority view written down |
| `/no-echo:what-could-go-wrong` | A plan you already chose | Objections from each person who must say yes, a failure pre-mortem, a ranked risk register, and what to fix first |
| `/no-echo:story-or-snore` | A pitch, demo or talk that has to be remembered | 4 to 6 stories from everyday worlds, each mapped part by part to the product, scored, with where it breaks. You pick. Then a locked ledger, a timed script, one visible line per slide, and a check that fails when the story stops fitting the facts |

## What keeps it honest

- **One model, several hats.** The skills say so in their output. The value is a wider framing
  and a named disagreement, not a vote.
- **Seats are roles.** No seat names, quotes or imitates a real person.
- **Seats cannot write.** They run as the `council-seat` agent, which has read, search and list
  tools only.
- **The Chair does not vote.** It computes the scores from the cards with a fixed rule and never
  adjusts them.
- **Numbers are checked by a script.** `check-numbers.mjs` fails the verdict when it contains a
  figure that is in no source file, or a score sum that does not add up. It compares values, not
  meaning, and says so in its header.
- **It tells you when not to use it.** A clear answer gets one line, not a council.

## story-or-snore: content or fun is a false choice

Some people say a talk should be all content. Others say it should be fun. A joke on top of the
content is decoration, and the room forgets both. `story-or-snore` makes the story carry the
content: every story part stands for one real part, and a part with no match is said plainly.

The example it ships with: a pitch for "a tool that finds business rules hidden in code" became
"Grandma's lentil soup". The recipe card is the ticket. Grandma adding the cumin at the very end
is the rule in the code. Four bitter soups are what the logs show after she retires.

- **It offers, you pick.** Each option shows its gaps as `(no match)` and the first place it
  breaks. It never develops a story you did not choose.
- **The talk is checked by a script.** `check-story.mjs` reads the talk file and fails on a story
  element with two meanings, an open gap, a stock image (iceberg, rocket, puzzle piece), a beat
  with more words than its seconds, a total over the limit, a word you asked to avoid, a product
  name in the first 15 seconds, and an ending that repeats nothing from the opening. It compares
  words, not meaning, and says so in its header. It has its own tests, run in CI.
- **No dependency.** The deck look and the optional explainer video are described, with no
  script. Rendering a video needs Playwright and ffmpeg, installed by you.
- **Music is licensed or yours.** Never a copyrighted track.
- **It says when not to use it.** Bad news is said straight, and a plan nobody attacked goes to
  `what-could-go-wrong` first.

## Cost

A council spawns agents. `let-them-fight` says the number of seat runs before it starts: about 8 in
quick mode and 15 to 21 in full mode. `rewrite-or-regret` does the same: 10 to 12 runs for a panel of
five. Both ask before the first run.

## Acknowledgements

The scored-council format in `let-them-fight` (one seat per question, weighted score cards, a
ratification round, caps for ruin risk and hard-to-undo choices) builds on ideas from
[nateherkai/roast-room](https://github.com/nateherkai/roast-room) (MIT). The seats, the rules, the
text and the number check here are written from scratch.
