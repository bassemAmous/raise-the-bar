---
name: homework-for-humans
description: Writes test cards that a person ticks off by hand. Each card is one check with numbered steps, the exact address to open, what to type, and one box per result to tick PASS or FAIL. Writes every card from the code that runs, not from memory. Every FAIL is tried again twice, then sorted as a bug in the app, a wrong card, or a broken test setup. Ships as one printable HTML page. Use when the user says "write me the manual test", "test cards for the tester", "a checklist I can tick", "QA plan for a person", "user acceptance test" or "test it myself", and before a person checks a change by hand. Not for automated tests (show-me-red), a handoff note to another session (message-in-a-bottle) or a pull request text (not-another-wip).
---

# homework-for-humans

Some checks need a person: a screen on a real phone, a flow across two accounts, a word a
customer will read. That person was not in this session. They need cards they can follow cold,
one step at a time, with a box to tick for each result. A card that says "check the cart works"
gets ticked without a test. A card that says "type 3 in the Quantity box, the total shows
Total: 36.00" gets a real answer.

## When to use

- A change needs a person to check it by hand: a phone, a printer, a second account, real copy.
- Someone asks for a test plan, a checklist or acceptance cards to tick off.

## When not to use

- The check can be automated: write the test and prove it with `show-me-red`.
- The reader is another agent session: use `message-in-a-bottle`.
- The reader reviews a pull request: use `not-another-wip`.

## Steps

1. **Read what runs, not what was planned.** Open the code of each screen being tested. Copy the
   real button labels, field names, messages and addresses from the source, in the language the
   tester will see. A label from memory is the most common wrong card.
2. **One card per behaviour.** A card has: a title saying what is checked, who does it (a role,
   never a name), where (the device, the browser, the test account by role), what must be true
   before it starts, numbered steps, and the expected result.
3. **Make every step a single action.** One click, one typed value, one page opened. Give the exact
   address (`https://APP-ADDRESS/cart`), the exact text to type, and the exact text to look for.
   No "etc.", no "as usual", no "check it works".
4. **Give every result its own box.** Each thing the tester must see is one line with PASS and
   FAIL boxes, and a space to write what they saw instead. Results that can be wrong apart from
   each other are never one box.
5. **Order the cards** from the main path to the rare cases, and mark which cards depend on an
   earlier one. A tester who stops early has still checked what matters most.
6. **Build the page** from `assets/cards-template.html`. One printable HTML file, no outside
   scripts or fonts, boxes that can be ticked on screen or on paper. For a quick check of one
   change, `assets/quick-check-template.html` holds a single short list.
7. **Try one card yourself** if the app runs here, start to finish, as written. A step you had to
   guess is a step to rewrite.
8. **When results come back, redo each FAIL twice** before calling it, following the card exactly.
   Then sort it:
   - **APP:** the app is wrong. It is a bug: report it with the card and the tester's words.
   - **CARD:** the card is wrong (an old label, a missing step, a wrong expected value). Fix the
     card and say so.
   - **RIG:** the test setup is wrong (an expired test account, missing data, the wrong build
     deployed). Fix the setup and run the card again.
   A FAIL seen once and never again is reported as "not reproduced", never dropped.

## Output format

```
homework-for-humans: <N> cards, <M> results to tick, for <role> on <device>
Page: <path to the HTML file>
Tried here: <cards run by me, or "app not running here">
Labels copied from: <files>

After the run:
PASS <n> · FAIL <n> (APP <n> · CARD <n> · RIG <n>) · not reproduced <n> · not run <n>
| Card | Result | FAIL seen again (x/2) | Sorted as | What happens next |
```

## Hard rules

- No person's name on a card. Roles only: "the tester", "a guest", "a second admin".
- No password on a card. Name the test account by role and say where its login is kept.
- Every label, message and address comes from the code that runs, read this turn.
- A FAIL is never closed without its two retries and its sort.
- A test account, never a real customer's account.

## Common mistakes

- "Check the checkout works" as a step.
- Three results in one box, so one FAIL hides two PASSes.
- Copying a button label from the design file while the app says something else.
- Calling a FAIL a bug before the retries show the card itself was wrong.
- A card that starts in the middle of a flow, with no word on how to get there.
