# council

Four skills for Claude Code that put a decision in front of opposed viewpoints before you commit
to it. The seats argue, score the options and sign off on the wording. The disagreement stays in
the answer, and every number is traced to a source or marked as assumed.

```
/plugin marketplace add bassemAmous/raise-the-bar
/plugin install council@raise-the-bar
```

| Skill | Use it for | What you get |
| --- | --- | --- |
| `/council:strategy` | A quick "should we" question | At most three questions back, six ordered checks, one recommendation, the cheapest test and one next move |
| `/council:boardroom` | One weighty business or product decision that is hard to undo | A neutral Chair, opposed seats (buyer, user, operator, money, offer, bet, delivery), two or three rounds, scored options, one verdict with conditions and the dissent kept |
| `/council:senior-council` | A technical fork | Five engineering seats (maintainer, security, on-call, product, skeptic), a fixed decision rule, and the minority view written down |
| `/council:red-team` | A plan you already chose | Objections from each person who must say yes, a failure pre-mortem, a ranked risk register, and what to fix first |

## What keeps it honest

- **One model, several hats.** The skills say so in their output. The value is a wider framing
  and a named disagreement, not a vote.
- **Seats are roles.** No seat names, quotes or imitates a real person.
- **Seats cannot write.** They run as the `council-seat` agent, which has read, search and list
  tools only.
- **The Chair does not vote.** It computes the scores from the cards with a fixed rule and never
  adjusts them.
- **Numbers are checked by a script.** `check-numbers.mjs` fails the verdict when it contains a
  figure that is in no source file. It compares values, not meaning, and says so in its header.
- **It tells you when not to use it.** A clear answer gets one line, not a council.

## Cost

A council spawns agents. `boardroom` says the number of seat runs before it starts: about 8 in
quick mode and 15 to 21 in full mode.

## Acknowledgements

The scored-council format in `boardroom` (one seat per question, weighted score cards, a
ratification round, caps for ruin risk and hard-to-undo choices) builds on ideas from
[nateherkai/roast-room](https://github.com/nateherkai/roast-room) (MIT). The seats, the rules, the
text and the number check here are written from scratch.
