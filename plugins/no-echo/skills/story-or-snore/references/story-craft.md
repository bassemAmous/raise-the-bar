# Story craft: finding, scoring and stress-testing options

## Contents
1. Start from the causal chain, not a theme
2. Worlds to search
3. Why structure beats surface
4. Scoring
5. Stress test: where it breaks
6. The lunch line
7. Roles: opener, main story, closer
8. What the beats rely on
9. Stock images to avoid
10. The options message

## 1. Start from the causal chain, not a theme

Take the causal chain from the parts list and ask: where in everyday life does this exact chain
happen? For the tool that finds business rules hidden in code, the chain was:

> a reason lives only in one head → the copies drift → things go wrong → nobody knows why →
> someone finds it and writes it down

Searching for "a story about knowledge" gives libraries and brains, which are stock images.
Searching for "where does a reason that lives in one head make the copies go wrong" gives a family
recipe that never tastes the same. That is the difference between a theme and a mechanism.

## 2. Worlds to search

Pick worlds the audience has lived in, not worlds they have read about. Most people in a room have
cooked from a family recipe and played the whisper game. Few have steered a submarine.

| World | Mechanisms it carries well |
|---|---|
| Family and food | knowledge in one head, copies that drift, the secret ingredient, the recipe card |
| Kids and games | the whisper game (messages change on the way), sharing rules, hide and seek |
| Home and repair | the one person who knows which fuse, the house built without plans, the leaky roof |
| Moving house | a big change done in steps while life goes on, the boxes that go first |
| Travel and maps | the guide who knew the shortcut, the map that is out of date, the detour sign |
| Sport and teams | the playbook, the coach's unwritten rule, the handover in a relay |
| Shift work | the handover note, night shift to day shift, what the last person forgot to say |
| Nature and senses | echo, the dog that hears what we cannot, tracks in the snow |
| School | the notes everyone copies, the substitute teacher who does not know the class rules |

Use at least three different worlds in one set of options. Five variants of a kitchen are one
option, not five.

## 3. Why structure beats surface

Research on analogy (Gentner's structure mapping) found that an analogy persuades when the
relations carry over (A causes B, B hides C), not when the objects look alike. More connected
relations make a stronger analogy. To test an option, walk the causal chain link by link and count
how many links survive in the story.

From the worked example: "kids sharing one cake" mapped the rule ("the one who cuts picks last")
but had no step for finding a cause. It was cute and it could not carry the demo. A shallow,
charming option makes a good opener or closer. It does not make the main story.

## 4. Scoring (1 to 5 each)

- **Coverage:** the share of parts and causal links that map.
- **Warmth:** will people smile, feel it, and recognise their own life?
- **Speed:** can a stranger get it in 30 seconds without hearing about the product?
- **Demo fit:** does the story have a moment the live demo replays? (the bitter soup, and the
  broken rule found in the logs)
- **Freshness:** is it free of stock images (section 9)?

Recommend the highest total and break ties towards Warmth, because people retell what they felt.
Show the scores. The person will often weigh them differently than you do, and the scores let them
do that knowingly.

## 5. Stress test: where it breaks

For each option, look for the first wrong idea a listener could take from it:
- **Wrong cause:** an element suggests a cause that is not the real one. A "bad chef" story blames
  a person, when the real cause is a note nobody wrote.
- **Overclaim:** the story implies the product does more than it does. "It knows why" is an
  overclaim when the product names the most likely cause.
- **Double meaning:** one element will need two meanings later. Cards that stand for tickets and
  then for repositories are the bug from the worked example.
- **Dark loss:** the loss is a death, an illness or a firing. Use the gentlest true version:
  "retires to the seaside".
- **Someone mocked:** a listener could feel mocked for their age, gender, origin or job. The person
  who knows is the expert, never the joke.
- **Translation:** the key word or idiom does not survive in the talk's language, or the main
  character's name does not work there.

Write the result as one line, "Breaks where". An honest weak point makes the strong points
believable.

## 6. The lunch line

For each option, write the one sentence a listener says to a colleague the next day: "You know
that tool? It is the one that writes Grandma's cumin trick onto the recipe card." If you cannot
write it, the option is too thin or too tangled. If it does not contain the product's point, the
story is decoration.

The same line is the opener of a post, a README or an email about the talk. Steps 1 and 2 work for
those formats too; steps 3 to 5 then produce a 60-second version.

## 7. Roles: opener, main story, closer

- **Opener:** short and played with the room, about 20 seconds. The whisper game with four people
  in the front row is one.
- **Main story:** carries the middle. It has the best coverage and demo fit, and enough warmth.
- **Closer:** one strong picture or a line that repeats the opening.

Offer a mix only when each piece does a different job. Three stories in three minutes is usually
one too many.

## 8. What the beats rely on

- **Curse of knowledge:** experts skip the steps the audience needs. The story forces those steps
  back in.
- **Made to Stick (Chip and Dan Heath):** simple, unexpected, concrete, credible, emotional, story.
  The concrete detail ("at the very end, never earlier") is the strongest of these.
- **Peak-end rule (Kahneman):** people judge an experience by its peak and its end. Plan both on
  purpose: the demo is the peak, the object and the tagline are the end.
- **Participation:** a show of hands in the first ten seconds turns listeners into witnesses. Raise
  your own hand as you ask, because people copy you.
- **Callback:** the ending repeats an object or phrase from the opening, which closes the loop.
- **What is, what could be (Duarte):** move between the world as it is (bitter soups) and the world
  with the product (the secret written down).

## 9. Stock images to avoid

These read as machine-written or as consultant slides: iceberg, puzzle or jigsaw pieces,
lighthouse, compass, bridge, rocket or launch, Swiss army knife, North Star, orchestra conductor,
chess, Lego bricks, "the glue", and a book or temple for "a single source of truth". Use one only
when the person asked for it, and say why in the option. `check-story.mjs` refuses the ones up to
Lego in a ledger, unless the talk file allows one by name (`Allow: iceberg`). The cure is to be
specific: a named dish, a named spice, a named moment.

## 10. The options message

Keep it to about one screen per two options:

```
What I understood: <the thing in one sentence>. Audience: <who>, <minutes> min.

1. <Name>: <one-sentence story>
   - <story element> = <real part>
   - <story element> = <real part>
   - <real part> = (no match)
   Breaks where: <the first wrong idea>
   Lunch line: "<what a listener repeats the next day>"
   Role: whole story | Coverage 4 | Warmth 5 | Speed 5 | Demo fit 3 | Freshness 4 | Total 21

2. ...

My pick: <n>. <one-line reason>.
Mix (only if stronger): open with <a> (20 s), tell <b>, close with <c>'s line.
```

Put your pick first. Then ask the person to choose: with the question tool when you have one (your
top three and the mix), in plain text otherwise. Stop until they answer.
