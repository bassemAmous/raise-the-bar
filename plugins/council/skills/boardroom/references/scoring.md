# Scoring

Every number here comes from the seats' cards. The Chair computes and never adjusts. Use the last
round that ran: Round 3 if it ran, otherwise Round 2.

## Option scores (the main number)

Every card scores every option from 0 to 10. For each option:

`option score = sum(weight x the seat's score for that option) / sum(weights)`, to one decimal.

The **recommended option** is the one with the highest score, unless an override below removes it.
Show the math for each option on its own line in the verdict, starting with the word `Math`:

`Math B: (3x6 + 2x7 + 2x8 + 2x6) / 9 = 6.7`

Keep that exact shape: each term is weight x score, then the sum of the weights, then the result.
The number check recomputes every `Math` line and fails the verdict when one does not add up.

A tie within 0.2 is a tie. Say so, and recommend the option that is easier to undo.

## Labels (from the recommended option's score)

| Option score | Label              |
| ------------ | ------------------ |
| 7.5 to 10    | GO                 |
| 6.0 to 7.4   | GO WITH CONDITIONS |
| 4.5 to 5.9   | REWORK             |
| below 4.5    | DO NOT DO IT       |

Two cases replace the band, and the verdict says why:

- **WAIT:** the option is good but depends on something not yet in hand (an answer from a
  customer, cash, a test result). WAIT names the trigger that turns it into GO, the date by which
  the trigger is expected, and what happens if it does not arrive.
- **DO NOT DO IT** also applies when "do nothing" is itself the top option. In that case the
  verdict reads as "keep what you do now", and that is a real answer, not a failure.

Never round a score up to reach a better label.

## Overrides (applied after the label, and named in the verdict)

Every card gives `RUIN RISK` and `UNDO` for every option. For the first two caps, read the
recommended option's value on every card, including the cards of seats that back another option.

1. **Ruin cap.** If any seat marks the recommended option `likely` under `RUIN RISK`, the label
   cannot be higher than REWORK until the resolution names a mitigation that the same seat
   endorsed. One seat that sees ruin outweighs six keen seats.
2. **Hard-to-undo cap.** If most seats mark the recommended option `no` under `UNDO`, or the `bet`
   seat does, and the spread is 4 or more, the label cannot be higher than GO WITH CONDITIONS. The
   cheapest test becomes a condition that comes first.
3. **Constraint veto.** The brief may list up to three hard constraints. If a seat shows, with a
   source, that the recommended option breaks one, the option is out as written, whatever its
   score. The verdict names the variant that respects the constraint, if one exists, and the next
   best option becomes the recommendation.
4. **Agreement check.** If every seat's top option is the same in Round 1 and their scores for it
   sit within 1 point, Round 2 runs in self-attack mode: each seat attacks the weakest part of its
   own case, and the Chair names the strongest unargued alternative for the seats to score as if
   they had to defend it.

## Spread and council confidence

- `spread` = the highest minus the lowest seat score on the recommended option.
- `council confidence` = the average of the seats' confidence (each out of 5) times 2, rounded,
  minus 1 if the spread is 5 or more. The scale is 1 to 10.
- Report both. A 7.0 with a spread of 1 is a different answer from a 7.0 with a spread of 6.

The Chair does not add a confidence of its own. Confidence belongs to the seats.

## Resolution support (full mode)

In Round 3 each seat gives `SUPPORT: n/10` for the resolution as written. Report the weighted
average as "Resolution support". It measures how well the resolution captured the room. It does
not measure whether the idea is good.

## The scorecard

One row per seat in the verdict's seat table, with its final own-lens score: the seat's judgment
of the recommended option on its own dimension alone. Every card gives an own-lens score for
every option, so read the recommended option's value, also on the card of a seat that backs
another option. Any own-lens score of 4 or below gets a named fix under "Next", even when the
label is GO.

| Seat      | Dimension                            |
| --------- | ------------------------------------ |
| buyer     | Buyer value and renewal              |
| user      | User pull and completion             |
| operator  | Front-line effort and error-proofing |
| money     | Cash and unit economics              |
| offer     | Offer strength                       |
| bet       | Downside and reversibility           |
| delivery  | Delivery cost and risk               |
| attention | Reach and distribution               |
| systems   | Ability to run and scale             |
| rules     | Compliance cost                      |
| backer    | Fundability and coherence            |

The `contrarian` has no row. Its hit, if it lands, is the dissent.

## A worked example (invented numbers)

A B2B scheduling tool is deciding whether to add a yearly plan. Options: A, add the yearly plan
with two months free. B, keep monthly only. Quick mode, four seats.

| Seat     | Weight | A   | B   | Confidence |
| -------- | ------ | --- | --- | ---------- |
| money    | 3      | 8   | 4   | 4          |
| buyer    | 2      | 7   | 6   | 3          |
| offer    | 2      | 8   | 3   | 4          |
| delivery | 1      | 5   | 8   | 4          |

`Math A: (3x8 + 2x7 + 2x8 + 1x5) / 8 = 7.4`
`Math B: (3x4 + 2x6 + 2x3 + 1x8) / 8 = 4.8`

A is recommended at 7.4, so the label is GO WITH CONDITIONS. The spread on A is 8 minus 5, which
is 3. Council confidence is the average of 4, 3, 4 and 4, which is 3.75, times 2, rounded: 8 out
of 10. No seat marked A `likely` under `RUIN RISK`, so no override applies. Say the `delivery` seat
gave A an own-lens score of 5. That is above the line of 4, so it needs no named fix, but its
condition (billing changes tested on a copy first) still goes into the conditions.
