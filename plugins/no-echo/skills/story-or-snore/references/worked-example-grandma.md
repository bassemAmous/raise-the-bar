# Worked example: "Grandma's lentil soup"

A hackathon pitch for a tool that finds business rules hidden in code. The story and the lessons
are from a real run. The product name (Footnote), the rule, one of the options and every number
are invented or changed here. Use it to see the bar, not to copy the story. The finished talk file is `assets/example-talk.md`.

## The thing to explain

The tool does four jobs:
- finds business rules hidden in code (for example "refunds within 30 days")
- maps which projects use each rule
- warns when the ticket and the code disagree
- searches the logs for the moment a rule broke, and names the most likely cause

The pain: important knowledge lives only in people's heads, and it is lost when they retire.

The setting:
- a 3-minute pitch to a hackathon jury, later translated into a second language
- the person's rules: it must not look machine-made, say "retire" and never "left", no generated
  music

## Step 2: the five options as they were offered

1. **Restaurant kitchen.**
   - The order says "no nuts" = the ticket.
   - Only the old chef knows the sauce has nut oil = the rule in the code.
   - The sauce goes into four dishes = the projects that use the rule.
   - A guest gets sick, and the receipts show when = the logs.

   Best coverage, and it was recommended first. Breaks where: it blames a chef, and someone gets
   ill.
2. **Grandma's recipe.** Only Grandma knows the trick. The copies taste wrong once she has
   retired. Warm and fast to grasp, but at first it had no ticket and no log moment.
3. **The whisper game.** "Refunds within thirty days" arrives at the end of the row as "refunds
   within thirteen days" = the ticket against the code. A perfect 20-second opener played with
   the room, too thin to carry the whole talk.
4. **Kids sharing one cake.** The rule is "the one who cuts picks last". Cute, and it has nothing
   for finding the cause.
5. **The night-shift handover note.** The day shift acts on what the note says, not on what the
   night shift knew. Good coverage, but cold: nobody smiles at a handover note.

The mix offered: the whisper game as the opener, then the kitchen as the story.

**The person picked Grandma.** Warmth won over coverage, and the gaps were closed in step 3. That
was the right way round: a warm story with gaps that can be closed beats a complete story nobody
feels.

## Step 3: how the gaps were closed

| Real part | Story element |
|---|---|
| The teammate who knows the unwritten rules | Grandma |
| The ticket: what was written down | The recipe card: "one spoon of cumin" |
| The rule in the code: what really happens | The cumin goes in at the very end, never earlier |
| The projects that use the rule | Four kitchens |
| What the logs show | Four bitter soups |
| What the product does | A new line on the card, in a second hand |

- **The concrete detail:** "Cumin that cooks too long turns bitter. She never wrote that down. Why
  would she? She was always there."
- **The gentle loss:** "Then Grandma retired to the seaside." Nobody dies, and nobody is to blame.
- **The tagline:** "Grandma can retire. Her secrets stay."
- **The object:** a real handwritten recipe card, held up at the end, with the new line in a
  second hand: "Add the cumin at the end, or it turns bitter."

## What went wrong, and what the skill does about it

1. **A double meaning.** One slide said "the recipe card is the ticket". A slide added later made
   every card a repository. A spoken bridge patched it ("zoom out: our repositories are Grandma's
   recipe box"). The real fix is the locked ledger of step 3, and `check-story.mjs` fails on it.
2. **The story was confusing without words on the slide.** Speaker notes do not reach the
   audience. The fix was one visible line per slide, starting with who Grandma stands for.
3. **The time crept up.** Two added slides took the talk from just under three minutes to three
   and a half. The check now compares the beats with the limit after every change.
4. **A slide changed behind the author's back.** A co-editor changed one sticker in the browser
   and left two placeholders empty. The fix was to show the person both versions, recommend one
   and let them decide.
5. **Translation broke the fonts and the fit.** The handwriting face had no accented letters and
   was swapped. Its capital L read as an S, so those lines went lowercase. Longer words made five
   stamps wrap or touch a headline.
6. **The machine look.** The first drafts leaned towards cream paper, a serif face and terracotta.
   The fix was one plain sans face, ink-only text, a dark ink stamp and no faces.
7. **Collisions in the video,** found in the stills: an arrow crossed a line of code, handwriting
   touched the card's red line, one label showed twice, and a "1" read as a slash. The fix was to
   look at stills of the busiest seconds before the full render.
