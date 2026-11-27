---
name: pixel-police
description: Reviews real rendered screens, not just the code behind them. Captures screenshots at phone and desktop widths, reads them, and judges clarity, discoverability, states, consistency and accessibility against the product's own design language. Returns findings ranked Critical, Major and Minor, each tied to a spot in a screenshot, with the exact fix. Read-only by default. Use when the user says "review the UX", "audit the design", "does this look good", "this screen feels off", "is this confusing", "check it on mobile" or "review this page before launch". Not for code structure (spaghetti-meter) or load speed (find-the-snail). Formerly named "ux-review", and still answers to that name.
---

# pixel-police

Judges a screen the way a user meets it: as rendered pixels, at phone width first and then
desktop. Code tells you what was intended. A screenshot tells you what the user gets. The result
is a ranked list of findings, each pointing at a place in a screenshot you opened and read, with
the exact fix. The skill is read-only unless the user asks for the fixes.

## When to use

- A named screen or flow should be graded: "review the UX", "does this look good", "check it on
  mobile".
- After a build that changed a screen, before calling it done.

## When not to use

- Nothing can be rendered. Start the app first. An app with no data looks broken, not badly
  designed, so it needs sample data. Ask the user before loading any data, and never run a seed
  script on your own. Seed scripts often empty tables first.
- The question is about code structure (`spaghetti-meter`) or speed (`find-the-snail`).
- The user wants new feature ideas. That is a product conversation, not a review.

## Steps

1. **Name the screens.** List the exact routes or views, the user role, and the state of the data.
   A review of "the app" has no edge. A review of three named screens does.
2. **Find the product's own bar.** Look for a design system, a style guide, tokens, a component
   library, or notes in the project's instruction files. The review holds the screen to that
   language. It does not invent a new one.
3. **Capture at phone width, then desktop.** Use the project's own screenshot scripts if it has
   them. If not, drive a browser tool yourself (for example Playwright or a browser automation
   tool your agent has). Defaults when the project names none: about 390 px wide for phone and
   1280 px for desktop, full page. Save the images to a scratch folder outside the repository, so
   the working tree stays clean.
4. **Open and read every image.** A capture nobody looked at is not evidence. Also read the
   browser console while the page is open: errors there often explain what looks wrong.
5. **Capture the other states.** Empty, loading, error, very long content, a narrow phone, and a
   signed-out or low-permission user if they apply. Most rough edges live outside the happy path.
6. **Run the first-glance test** from `references/checklist.md` on each phone screenshot. It asks
   whether a first-time user, reading slowly, knows what the screen is for and what to do.
7. **Check discoverability.** Can a new user find the main action in a few steps from a clearly
   labelled entry? "Where is X?" is a fault of the design, not of the user.
8. **Check consistency and layout.** Spacing, type sizes, colours and components against the
   product's own language. Desktop should use its space with purpose, not show the phone layout
   stretched into columns.
9. **Check forms, feedback and accessibility** with `references/checklist.md`: labels, errors
   beside the field, focus, contrast, target sizes, keyboard use.
10. **Write the verdict** in the format below. Lead with the single fix that would help most.
11. **Confirm nothing changed.** Run `git status`. It must match the state before the run.

**If the user asks for the fixes too:** work in a worktree (`main-is-lava`), keep the "before"
screenshots, fix Critical and Major first, then capture "after" at both widths. Look at the whole
screen again, not only the spot you changed, because a fix can move the problem.

**Several screens:** one helper agent per screen can capture and review it. Each returns its
screenshot paths, its findings in the format below, and its first-glance result. A helper that
only reviews should be read-only, for example `no-slop:readonly-reviewer`. Mechanical checks
(contrast, target sizes, focus order) suit a cheaper, faster model. The ranking across screens and
the overall judgment stay with the main session, on the strongest model you have. When reviewing
fixes, the reviewer must not be the agent that made them.

## Output format

```
Screens reviewed: <route or view> at <width> px, state: <normal | empty | error ...>
Screenshots: <paths>
Design reference used: <the project's design source, or "none found, general principles">

Top fix: <the one change with the most effect>

Findings
  Critical  <screen, width>  <where in the screenshot>  <what is wrong for the user>  Fix: <exact change>
  Major     <screen, width>  <where>  <what is wrong>  Fix: <exact change>
  Minor     <screen, width>  <where>  <what is wrong>  Fix: <exact change>

First glance: <screen>: 10/10 | fails lines <numbers>, at <where>
Console: clean | <errors seen>
To verify: <claims that could not be settled from a screenshot, and how to check each>
Not reviewed: <screens, states or widths skipped, and why>
Changed: nothing (git status matches the start)
```

Severity: **Critical** stops a user from finishing the task or misleads them. **Major** makes the
task slow, confusing or untrustworthy. **Minor** is polish.

## Hard rules

- No screenshot, no finding. Anything inferred from code alone goes under "To verify" or is
  dropped. If no app is running, the report says "UX pass not run", never a verdict.
- Phone width first. Problems hide there, and many users arrive there.
- Read-only by default. No fix is applied unless the user asked.
- Judge against the product's own design language. Do not strip its character in the name of
  simplicity, and do not restyle it to personal taste.
- Never copy another company's artwork, wording or look as the suggested fix.
- A check that passes in the page structure is not proof that it looks right. Look at the image.
- Use test accounts and sample data. Do not capture real users' personal data in screenshots.

## Common mistakes

- Reviewing the component code and describing what it probably looks like.
- Capturing only the desktop view with perfect sample data.
- Listing twenty findings of equal weight with no top fix.
- Writing "improve spacing" instead of the exact change.
- Reporting a personal preference as a defect.
- Checking a fix at the spot that changed and missing what it pushed out of place.
