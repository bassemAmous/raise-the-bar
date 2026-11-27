# The deck and the explainer video

Build these only when the person asks, and only after they said yes to the words in `talk.md`.

## Contents
1. The deck file
2. A look that does not read as machine-made
3. The fit check, by eye
4. Translating a finished deck
5. A deck other people edit
6. The explainer video
7. Music

## 1. The deck file

- Use the slide tool the person already has, when they name one. Follow that tool's own rules
  before these notes.
- Otherwise write one self-contained HTML file: one `<section>` per beat at 1920 by 1080, inline
  CSS and inline SVG, arrow keys to move, and a print style that puts one slide on a page so the
  browser saves a PDF. No script or style loaded from the web, except fonts the person chose.
- Each section holds the beat's visible line from `talk.md`, word for word, and the spoken text as
  its speaker note, starting with the time range: "0:50 to 1:15, 25 seconds."
- Keep the file next to `talk.md`, in a folder the person can open.

## 2. A look that does not read as machine-made

What worked in the worked example:
- **Drawings:** inline SVG with a wobble (an `feTurbulence` and `feDisplacementMap` filter, with
  its own filter id per drawing), thick ink strokes with round caps. Colour sits in flat patches a
  few pixels off the outline, like a misprint.
- **Text:** all of it in ink, never coloured headings. One plain sans face, and one or two
  handwriting faces only for things written inside the story (Grandma's hand, the family's hand).
- **One tilted oval stamp per slide,** drawn in ink: "Never written down", "Same card, new cooks".
- **Tables:** ticks and crosses drawn as strokes, not typed characters. A highlighted row gets a
  flat marker band.
- **Colours from the story's world.** A kitchen story took paper, ink, turmeric, tomato and olive.
  A moving-house story takes cardboard, tape and marker.

Avoid all of these:
- robots, glow, gradients, neon, stock 3D, emoji
- icons in circles
- faces with expressions (show the character from behind, or as a hand)
- cream paper with a serif face and terracotta, which reads as a machine default
- coloured badges in place of the stamp

The person's pictures or templates set the mood only, unless they say otherwise.

## 3. The fit check, by eye

No script for this ships here: measuring pixels needs a browser, and this repository adds no
dependency. Open the deck at full size and look at every changed slide. If the person has
Playwright installed, take one screenshot per slide with animations turned off and read those.
Look for:
- text cut by the slide edge, or closer than 128 px to the bottom edge
- text on top of other text, or a stamp touching a headline
- text under 28 px on a 1920 by 1080 slide
- a headline that wraps to more rows than it was written with
- a font that did not load, or a letter the font lacks (the letter shows in another face)
- typed tick or cross characters
- a line that differs from `talk.md`

Say which slides you looked at. A slide nobody looked at is "not checked".

## 4. Translating a finished deck

- **Text grows.** Many languages run 20 to 30% longer than English. Stamps wrap in the middle of a
  word and captions run past the bottom. Look again after translating, then widen or move what
  broke. Shorten the wording last, and only with the person's yes.
- **Letters:** check that every face has the language's accented letters. A handwriting face often
  lacks them.
- **Handwriting quirks:** in some handwriting faces a capital L reads as an S and a "1" as a slash.
  Write such lines in lowercase and spell numbers as words ("one spoon").
- **Names:** keep the product's name. Translate the main character, so Grandma is the word people
  there use for their own grandmother.
- **Wording rules carry over.** "Retire, never left" needs its equivalent in the new language.
  Add it to `Avoid:` and run the check on the translated `talk.md`.
- **Scope:** ask whether the speaker notes and the video are translated too.

## 5. A deck other people edit

- Ask before every publish to a place others can see.
- People edit in the browser. Read the latest version before you change it, and apply your change
  to that version. After a third refused publish, stop and tell the person.
- Somebody else's edit can change a slide behind your back, and leave a placeholder empty. Show
  the person what was there before and what is there now, recommend one, and let them decide.

## 6. The explainer video (optional)

A gamified explainer of 60 to 70 seconds, shown after "Questions?" as a backup. It is not part of
the timed talk unless the person wants it to be.

**What it shows**
- **The quest:** the story's problem, named like a game level ("Quest: the bitter soup").
- **The crew:** each product job is one helper with a name, an ability verb and what it reads:
  the Reader finds (the code), the Mapper maps (the projects), the Checker warns (the ticket), the
  Taster explains (the logs).
- **The status bar:** the helpers' medallions, the clue slots and a counter. Each clue flies into
  its slot as its helper finishes.
- **The finale:** the story's fix. The card gets its new line, written on in a second hand.
- **The end card:** the tagline and the music credit.

A timeline that worked, 67 seconds: title 0 to 6, quest 6 to 12, four helpers of about 10 seconds
each from 12 to 52, finale 52 to 60, ending 60 to 67.

**How to build it so it can be checked**
- One HTML page whose every frame is a pure function of time: a `renderAt(seconds)` function sets
  every element's state for that moment. No timers and no CSS animations, because neither can be
  paused at an exact second.
- Seed the randomness, so a wobbly line is the same in every frame and does not shimmer.
- Before any full render, look at stills of the busiest seconds: the middle of each helper's scene
  and the finale. Fix what collides there.
- Rendering to MP4 needs a browser driver such as Playwright and an encoder such as ffmpeg,
  **installed by the person**. Ask before you rely on either. Without them, hand over the HTML
  page. It plays in any browser and can be screen-recorded.

**What to look for in the stills**
- No text touches a line or other text. Arrows do not cross text.
- Each label appears once. Titles do not touch the status bar.
- Handwriting quirks are handled (section 4).
- The music credit is readable on the end card.
- Every text agrees with the ledger and the person's wording rules.

## 7. Music

- Use music that is **licensed for reuse** (CC0, or CC BY with its credit), or **generated or made
  by the person**, with the right to use it in public.
- **Never a copyrighted track**, not even ten seconds, and not "just for the internal version".
- No generated music when the person said no AI.
- A CC BY credit appears wherever the video plays: on the end card and under the video on its
  slide.
  ```
  Music: "<title>" by <artist> (<where it was found>)
  Licensed under Creative Commons: By Attribution 4.0
  https://creativecommons.org/licenses/by/4.0/
  ```
- Download the file into its own empty folder, and never run anything from that folder.
- Fade it in and out, keep it under the voice, and play the result once with sound before the talk.
