---
name: skill-issue
description: Improves a skill from how it really ran, not from opinion. Collects evidence from real sessions (a skill that fired on the wrong message, stayed silent when it should have fired, reached a wrong result, or dragged), sorts each finding into change, cut or keep, sweeps sibling skills for the same flaw, and keeps the total size of the skills flat or smaller. Use right after a notable skill run, and when the user says "improve this skill", "why did that skill misfire", "the skill did not fire", "the skill was too verbose", "sharpen the skills" or "review how the skills ran". Not for writing a new skill from scratch, or for lessons about code bugs (bug-autopsy).
---

# skill-issue

A skill is a prompt, and prompts decay. They fire on the wrong message, stay quiet on the right
one, and grow a paragraph every time something goes slightly wrong, until nobody reads them. Each
run "worked", so nobody notices. This skill is the feedback loop: it reads real runs, finds where
a skill cost more than it should have, and tightens the skill itself.

It runs on evidence. Every edit points at a real moment, quoted. No evidence, no edit. It is the
same discipline as never bending a test to fit a bug.

## When to use

- **After a run:** a skill just finished in this session and something was off. Fast, one skill,
  the evidence is in this conversation. This is the common case.
- **A sweep:** go through many past sessions and sharpen the skills that cost the most. Heavier.
  Use a read-only helper agent to gather.

If unsure, do the after-run version on the most recent skill.

## When not to use

- A lesson about a bug in the product: use `bug-autopsy`.
- A brand new skill with no runs behind it: write it, then come back after it has run.
- Only one run felt a bit off and no standard says otherwise: that is not evidence yet.

## The four ways a skill fails

Each finding belongs to one of these, so the edit lands on the part that failed:

1. **Firing** (the description). It fired on something it says it is not for, or stayed silent
   on a message that matched. The fix is in the trigger phrases or the "Not for" sentence.
2. **Result** (the steps). Once running, it reached a wrong verdict or missed a check. The fix is
   in the step the result hinged on.
3. **Cost** (proportion). It did far more than the task needed, or carried paragraphs that changed
   no action. The fix is a size rule or a cut.
4. **Boundaries** (siblings). It repeated or fought another skill. The fix is a hand-off line,
   never a copy.

## Steps

1. **Gather the evidence.** After a run: reread the invoking message, the steps as they ran, every
   place the user corrected or repeated themselves, and the outcome. Quote exactly. A sweep: have a
   read-only helper mine the session transcripts and the history of the skills folder, and return
   per skill the times it ran, each misfire with the message quoted, each wrong result, signs of
   drag, and whether recent edits stuck or were reverted. Count both ways a skill starts: a tool
   call and a typed slash command. Count each call once, even if the transcript repeats it.
2. **Check for a fork.** If the skills live in git, compare your copy with the main branch before
   editing, and merge in any edit made elsewhere. If they are not in git, say so.
3. **Sort each finding:**
   - **CHANGE:** the skill says the wrong thing or misses a step. Rewrite the smallest span.
   - **CUT:** a step or paragraph that changed no action and is not a safety rail. Delete it.
   - **KEEP:** nothing to bank, or a one-off. Write it down as looked at, so the next pass does
     not argue it again.
   For whole skills: **ADD** when two or more runs show a task no skill covers, and **RETIRE**
   when a skill never fires or is fully covered by another.
4. **Sweep the siblings.** One flaw is usually a class. Search the other skills for the same
   shape (a vague trigger, a missing "Not for", a repeated step) and fix the class.
5. **Apply the smallest edit, one reason each.** No "while I am here" rewrites. Before applying,
   review the edit yourself: evidence quoted, smallest span, siblings swept, no safety rail
   weakened, and the exact message that exposed the problem now takes the right path.
6. **Prove the edit helped.** For a firing change, replay ten or so real prompts (some that should
   fire, some near misses that must not) and read which skill each one starts. For a result
   change, run the skill against the message that exposed the problem. If an earlier edit was
   reverted, write down why, so it is never proposed again.
7. **Keep the size flat or down.** Count the lines of every skill touched, before and after. Over a
   sweep the total must not grow. Every addition is paid for by a cut somewhere.
8. **Report** in the format below.

## Output format

```
skill-issue: <after a run: skill X | sweep: N skills, M sessions>

Findings, worst first:
  [firing | result | cost | boundaries] <skill>: <what the evidence shows> ("<exact quote>")
    -> CHANGE | CUT | KEEP | ADD | RETIRE: <the exact edit>
    -> also in: <sibling skills | none>

Applied: <each edit, its reason, its self-review>
Line count: <before> -> <after> (<+/- N>)
Proven by: <the replay or dry run for each edit>
Looked at and kept: <findings set aside, so they are not raised again>
```

## Hard rules

- No edit without a quoted moment from a real run, or a standard the skill should already hold.
- One odd session is not a pattern. Two is.
- Never weaken a safety rail to remove friction. Friction that prevents an incident is the point.
- Do not run this on a timer or after every turn. It is judgment work, started on purpose.

## Common mistakes

- Editing because a run "felt off", with nothing quoted.
- Only ever adding, so every skill grows.
- Fixing one skill and leaving the same flaw in its siblings.
- Bundling five unrelated tweaks into one edit, so none can be judged or reverted alone.
