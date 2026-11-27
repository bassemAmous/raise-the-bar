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

## Facts

- Footnote does four jobs: it finds the rules, maps the projects, warns and names the cause.
- The test: 10 breaks planted in a test project. The results are not measured yet.
- Example: the demo rule is "refunds within thirty days".

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
- `## Facts` holds what the person gave, one list item per fact, in their words: every number,
  price, result and promise the talk may say. The check refuses a number in a `Line:` or in `Say:`
  that is in no fact, no ledger row and no `Keep:` phrase. "40" and "forty" are the same number. A
  number said with a unit ("18 percent", "29 euros") needs a fact with that unit. The word "one"
  alone is not counted.
- A fact that starts with `Example:` is demo data, not a result. Its numbers pass only in a beat
  that says "example" or "demo" out loud or on the slide.
- An empty `## Facts` section means the person gave no number. A file with no such section still
  runs, as talk files written before it did, and the check warns that no fact was checked.
- A beat heading is `### <number>. <name> (<seconds> s)`. A heading with no seconds is not timed.
  Only its numbers and claim words are checked. Use that for a backup slide.
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

## 3. The beat sheet

Seconds per beat for a slot of 3, 5 or 10 minutes. Copy the column for your slot.

| # | Beat | 3:00 | 5:00 | 10:00 | What happens |
|---|---|---|---|---|---|
| 1 | Hook | 10 | 15 | 15 | A show of hands on the everyday version, within the first 10 seconds. Pause two seconds and look at the hands. No product name. |
| 2 | The secret | 20 | 30 | 50 | The person who knows, and the one concrete detail. Why was it never written down? "Why would she? She was always there." |
| 3 | The loss | 20 | 30 | 50 | The gentle loss. The copies go wrong, and everyone blames the wrong thing. |
| 4 | The turn | 25 | 35 | 60 | "Our code has grandmas too." Say the ledger out loud. Then leave the story and speak plainly. |
| 5 | Why the obvious fixes fail | none | 25 | 60 | Why the usual tools do not solve it. One picture or one small table. |
| 6 | The answer | 20 | 35 | 75 | The product and its jobs, one plain line each. |
| 7 | The peak: live demo | 55 | 85 | 180 | One change, one answer. Stay quiet while it runs, then read the result line by line. Plan B is a recording, with the sentence that introduces it. |
| 8 | Proof | 10 | 15 | 50 | Real numbers only. Placeholders such as `[X] of 10` stay until a real run fills them. |
| 9 | The end | 15 | 20 | 45 | The real object, one new line, the tagline. Stop and let it land. |
|   | **Planned** | 2:55 | 4:50 | 9:45 | The sum of the column, a little under the limit. |
|   | **Spoken words** | 290 to 420 | 475 to 700 | 960 to 1,400 | About. Under the range the check warns. Over it the check fails. |
| 10 | Backup | not timed | not timed | not timed | The explainer video, after "Questions?". |

**Scaling to another slot.** Plan about 97% of the limit and keep these shares: the story (beats 2
and 3) about a fifth, the turn about an eighth, the demo just under a third. The hook stays at 10
to 15 seconds whatever the slot, and the show of hands still comes within the first 10. What grows
with the slot is the plain part (beats 5 and 6) and the proof. Under 5 minutes, leave beat 5 out.
Then write about 2.3 words for each second (140 a minute), and never less than 70% of that in
total.

Beat 5 is where added slides land. They cost time, so say how much: two slides of 15 seconds each
turned a talk just under three minutes into three and a half.

## 4. Timing

- On a stage people speak at about 140 words a minute, slower than they read. A speaker in a
  second language, or a language with longer words, needs 10 to 15% more time for the same content.
  Set `Pace:` lower for them.
- The check counts the spoken words of each beat and compares them with the beat's seconds. A beat
  whose words need more than 110% of its seconds is a finding. So are beats, or words, that add up
  to more than the limit.
- Words that need less than 70% of the planned seconds are a warning: content is missing, or the
  seconds are a guess. The other 30% is for the pauses, the show of hands and the quiet part of the
  demo. If one long silent demo takes the talk under 70%, keep the warning and say why in the
  hand-over.
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
- The first 15 seconds hold no product name and no definition. The show of hands comes within the
  first 10, also when the hook beat is 15 seconds long.
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
- Say only numbers that are in `## Facts`. Never add a fact there to make a number pass: a fact
  comes from the person.
- A number that only the demo shows ("butter runs out in two days") is example data. Put it on an
  `Example:` row and say "example" or "demo" in that beat, so nobody takes it for a result.
