# Beats, script and the talk file

## Contents
1. The talk file
2. The ledger
3. The beat sheet
4. Timing
5. The visible lines
6. Spoken text and stage directions
7. The object at the end
8. Honest lines

## 1. The talk file

Everything about the talk lives in one Markdown file, `talk.md`. `scripts/check-story.mjs` reads
it, and the deck is built from it. A full one is in `assets/example-talk.md`. The shape:

```
# Talk: <name of the story>

Product: Footnote
Limit: 3:00
Pace: 140
Avoid: left, gone
Keep: Grandma can retire. Her secrets stay.
Allow: bridge

## Ledger

| Real part | Story element | First beat |
| --- | --- | --- |
| The ticket | The recipe card | 2 |
| How it works inside | (plain) | 5 |

## Beats

### 1. Hook (10 s)
Line: Grandma = the teammate who knows the rules nobody wrote down.
Say: Raise your hand if your family has a recipe that never tastes the same when someone else
cooks it. (Raise your own hand. Wait two seconds.)

### 9. Backup: the video
```

The settings, one per row, nothing else on the row:
- `Limit:` the time the talk may take: `3:00`, `180 s` or `3 min`. Without it the check fails.
- `Product:` the product's name. Optional. It turns on the check for a name in the first 15 seconds.
- `Pace:` spoken words a minute. 140 when left out.
- `Avoid:` words the person does not want, comma separated.
- `Keep:` a phrase the person wrote, which must stay unchanged. One per row; repeat the row for more.
- `Allow:` a stock image the person asked for by name.

Rules of the format:
- A beat heading is `### <number>. <name> (<seconds> s)`. A heading with no seconds is not timed
  and not checked. Use that for a backup slide.
- `Line:` is the one sentence the audience sees on the slide. `Say:` is what the speaker says, and
  it may run over several rows. A blank row ends it.
- Text in (parentheses) inside `Say:` is a stage direction. It is not counted as spoken.
- In the ledger, `(plain)` means the talk says that part in plain words, with no story element.
  `(no match)` means the gap is still open, and the check fails on it.

## 2. The ledger

Write it before the first beat. One row per real part:

| Real part | Story element | First beat |
|---|---|---|
| The teammate who knows the unwritten rules | Grandma | 1 |
| The ticket: what was written down | The recipe card | 2 |
| The rule in the code: what really happens | The cumin goes in at the very end | 2 |
| The projects that use the rule | Four kitchens | 3 |
| What the logs show | Four bitter soups | 3 |
| What the product does | A new line on the card, in a second hand | 8 |

Check every line you write against it. If a story element needs a second meaning, choose a new
element. A story element nobody says out loud is removed from the ledger.

## 3. The beat sheet (a 3-minute pitch; scale it to the slot)

| # | Beat | Seconds | What happens |
|---|---|---|---|
| 1 | Hook | 10 | A show of hands on the everyday version. Pause two seconds and look at the hands. No product name. |
| 2 | The secret | 20 | The person who knows, and the one concrete detail. Why was it never written down? "Why would she? She was always there." |
| 3 | The loss | 20 | The gentle loss. The copies go wrong, and everyone blames the wrong thing. |
| 4 | The turn | 20 to 25 | "Our code has grandmas too." Say the ledger out loud. Then leave the story and speak plainly. |
| 5 | Why the obvious fixes fail (optional) | 15 to 30 | Why the usual tools do not solve it. One picture or one small table. |
| 6 | The answer | 20 | The product and its jobs, one plain line each. |
| 7 | The peak: live demo | 45 to 60 | One change, one answer. Stay quiet while it runs, then read the result line by line. Plan B is a recording, with the sentence that introduces it. |
| 8 | Proof | 10 | Real numbers only. Placeholders such as `[X] of 10` stay until a real run fills them. |
| 9 | The end | 10 to 15 | The real object, one new line, the tagline. Stop and let it land. |
| 10 | Backup | not timed | The explainer video, after "Questions?". |

Beat 5 is where added slides land. They cost time, so say how much: two slides of 15 seconds each
turned a talk just under three minutes into three and a half.

## 4. Timing

- On a stage people speak at about 140 words a minute, slower than they read. A speaker in a
  second language, or a language with longer words, needs 10 to 15% more time for the same content.
  Set `Pace:` lower for them.
- The check counts the spoken words of each beat and compares them with the beat's seconds. A beat
  more than 10% over is a finding. Pauses and the demo itself are not words, so leave room.
- Report it like this: "Total 3:20, limit 3:00. To cut 20 seconds, shorten beat 6 to two jobs."
- When a slide is added later, change the seconds and run the check again.

## 5. The visible lines (one per slide, on the slide itself)

Speaker notes do not reach a listener who missed one sentence. A short visible line on every slide
does. In the worked example the person said the story was confusing without them. The fix was one
plain line per slide, starting with who the main character stands for:
- Beat 1: "Grandma = the teammate who knows the rules nobody wrote down."
- Beat 2: "Grandma knew a secret she never wrote down."
- Beat 3: "When she retired, nobody knew her secret."
- Beat 4: "Our problem: important knowledge lives only in people's heads."
- The answer: "It writes that knowledge down before anyone retires."

Rules for a line:
- 12 words at most
- no jargon, and no "leverage" or "empower"
- it names one ledger pair, or says the product's point plainly

Show the lines to the person before you build anything. These are the words they care about most.

## 6. Spoken text and stage directions

- Write short sentences, as people speak.
- Put stage directions in parentheses: "(Raise your own hand as you ask.)", "(Stay quiet until the
  answer is on screen.)", "(From here on, talk plainly. Grandma comes back at the close.)".
- The first 15 seconds hold no product name and no definition.
- After beats 1 and 2, a stranger can retell the story in one sentence. Try it on one.

## 7. The object at the end

A real object from the story, held up at the end, beats any slide. In the worked example it was a
handwritten recipe card with the new line in a second hand. Name the object in the last beat's
stage direction, and put "bring the object" on the hand-over list.

## 8. Honest lines

- Say "most likely cause", not "the cause".
- Never say "nobody does this". Say what is new: "nobody ties the ticket, the code and the logs
  together through one rule".
- Fill proof numbers only from a real run. Until then the placeholders stay visible, and the check
  lists them.
