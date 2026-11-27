---
name: story-or-snore
description: >-
  Turns a pitch, demo or talk into a story people stay awake for, where the story carries the
  content and is not decoration on top of it. Offers 4 to 6 story ideas from different everyday
  worlds (family and food, kids' games, home, sport, shift work), each mapped part by part to the
  real product, scored and stress-tested for where it breaks, then stops so the person picks.
  Builds the pick into a locked story-to-product ledger, a beat sheet with seconds, the spoken
  script and one visible line per slide, and runs a script that fails when one story element means
  two things, the words do not fit the time or the story leans on a stock image. Use when the user
  says "make my pitch a story", "my talk is boring", "find me a metaphor", "give the talk a hook",
  "a story behind it" or "nobody will remember this talk", and before a hackathon pitch, a demo
  day, an all-hands, a sales talk or a change announcement. Not for attacking the plan behind the
  pitch (what-could-go-wrong), for plain replies and documents (no-great-question in no-slop), or
  for bad news that has to be said straight.
---

# story-or-snore: the story carries the content

People argue about whether a talk should be all content or should be fun. It is a false choice. A
joke or a metaphor stuck on top of the content is decoration: the room enjoys it and forgets the
point. A story whose parts line up with the real thing **is** the content, in a shape people can
carry out of the room.

A hackathon pitch for "a tool that finds business rules hidden in code" became "Grandma's lentil
soup":
- The recipe card is the ticket: what was written down.
- Grandma adds the cumin at the very end. That habit is the rule in the code: what really happens.
- Four bitter soups in four kitchens are what the logs show, after she retires to the seaside.

Nobody retells "rule extraction". Everybody retells the cumin. The full case, with what went wrong,
is in `references/worked-example-grandma.md`. Read it before your first run.

## When to use

- A pitch, demo, all-hands slot, sales talk or change announcement that has to be remembered.
- "It is boring", "it is confusing", "it needs a hook", "like the grandma thing".
- The person only asks for ideas. Steps 1 and 2 are the whole job then.

## When not to use

- **Bad news.** An outage review, a price rise, a team cut. Say it straight. A story there reads
  as hiding.
- **A plan nobody attacked yet.** A good story sells a weak plan too well. Run
  `what-could-go-wrong` first.
- **An audience that asked for the numbers.** Give the numbers. At most, open with one line.
- **No story fits.** If every option loses half the parts, say so and give the plain version.

## Steps

The person may come in at any step. "We have the story, build the talk" starts at step 3, and the
ledger is still written first, because every later check reads it.

### 1. The parts list

Before inventing anything, write 5 to 8 lines:
- **The thing** in one sentence.
- **Its parts:** the 3 to 6 pieces the talk must show: the input, the hidden problem, the
  consequence, how anyone notices, what the product does.
- **The causal chain:** what leads to what. "A reason lives in one head, so the copies drift, so
  things break, so nobody knows why, until someone finds it and writes it down."
- **The setting:** audience, minutes, language, room or call, and the person's own rules (words to
  avoid, the look, the music).

Ask at most three questions, once, and only when the answer would change the options. Otherwise
state your assumptions in one line and go on.
Why: an analogy convinces when its causal chain matches, not when its objects look alike. Without
the parts list the charming option wins, and it cannot carry the demo.

### 2. Offer 4 to 6 stories, then stop

Read `references/story-craft.md`. Each option comes from a different everyday world and has:
- **The story:** a name and one sentence a child could follow.
- **The mapping:** every part from step 1 with its story element. Write `(no match)` where there
  is none. Hiding a gap is how a weak option wins.
- **Where it breaks:** the first wrong idea a listener could take from it.
- **The lunch line:** the sentence a listener repeats to a colleague the next day.
- **Scores from 1 to 5:** Coverage, Warmth, Speed (understood in 30 seconds), Demo fit, Freshness.

Give your pick first, with one line of why. Offer a mix (opener, main story, closer) only when it
is clearly stronger. Then ask the person to choose, and **stop**.
Why: the pick is a matter of taste and of knowing the room. In the worked example the person chose
Grandma over a story that scored higher. Warmth beat coverage, and the gaps were closed afterwards.

### 3. Close the gaps and lock the ledger

Every `(no match)` part gets a story element, or it is marked `(plain)` and the talk says that part
plainly. Then write the ledger: the real part, its story element, the first beat it appears in.
**One story element never means two things.** If a second meaning is needed, pick a new element.

Pick the one concrete detail that carries the secret: "she added the cumin at the very end, or it
turns bitter." Keep the story gentle. The loss is the softest true version (Grandma retires, she
does not die), nobody is to blame, and the person who knows is the expert, never the joke.
Why: the ledger is the contract. Each slide line, spoken line and video scene is checked against it.

### 4. Write the talk file

Read `references/beats-and-script.md`. Write `talk.md` in its format: the settings, the ledger and
one beat per slide with its seconds, one visible `Line:` and the spoken `Say:` text. Mark:
- the hook: the audience takes part in the first 10 seconds, and no product name yet
- the turn: "Our code has grandmas too", then the ledger said out loud
- where the talk leaves the story and speaks plainly
- the peak: the live demo, with a plan B
- the end: a real object from the story, and a tagline that calls back to the opening

Keep the file where the person can open it, never only in a temporary folder.

### 5. Run the check

```
node "${CLAUDE_PLUGIN_ROOT}/skills/story-or-snore/scripts/check-story.mjs" talk.md
```

It fails on a double meaning, an open gap, a stock image, a story element no beat says, a missing
or long line, a beat with more words than its seconds, a total over the limit, a word the person
asked to avoid, a changed phrase of theirs, a product name in the first 15 seconds, and an ending
that repeats nothing from the opening. Fix the talk, not the check. Quote its last line.
Why: every one of these happened in a real talk, and none of them shows when you read your own
script.

### 6. Show the words, then stop

Show the person the ledger, the lines, the tagline and the total time. Wait for their yes before
building anything. People care about these words more than about any drawing.

### 7. The deck and the video, only if asked

Read `references/deck-and-video.md`. A deck is one self-contained HTML file, or the tool the person
already uses. The look is hand-drawn, not machine-made. The explainer video is optional and needs
Playwright and ffmpeg, installed by the person. No script for it ships here.

### 8. Hand over

Report the check line, the total time against the limit, and what the person still owns: fill the
real numbers, bring the object, rehearse with a stopwatch, and say it once to someone who does not
know the product.

## Output format

Step 2 uses the options message in `references/story-craft.md`. The hand-over is:

```
Story: <name> | Talk: <minutes> of <limit> | check-story: Clean | <N> finding(s), each explained
Ledger: <real part> = <story element> (one row per pair; plain parts listed last)
Lines: <beat number>. <the visible line>
Tagline: <the closing line>
Files: <path to talk.md>, <path to the deck, if built>
Still yours: <numbers to fill, the object to bring, the rehearsal>
Not checked: <what no script or reader verified>
```

## Hard rules

- Never develop a story the person has not picked.
- Never invent a statistic, a quote, a user count or a result. A placeholder such as `[X]` stays
  until a real run fills it. Say "most likely cause", never "the cause".
- No real brand and no real person inside the story or its pictures.
- Music is licensed for reuse with its credit shown, or generated or made by the person. Never a
  copyrighted track, not even ten seconds of it. No generated music if the person said so.
- Ask before publishing anything other people can see.
- The check is not edited to pass. A finding you keep is named in the hand-over with its reason.

## Common mistakes

- Choosing a theme ("something about knowledge") in place of a mechanism. It gives libraries and
  brains.
- Five variants of one kitchen offered as five options.
- A story so complete that the talk never leaves it. The product gets plain words too.
- Adding a slide and not saying what it did to the time.
- An iceberg, a rocket, a puzzle piece or a lighthouse. The cure is one named dish, spice or moment.
