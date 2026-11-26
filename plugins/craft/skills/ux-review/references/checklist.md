# Review checklist

Each line is pass or fail on a screenshot you have opened. Quote the line number in the finding.

## First-glance test (phone screenshot, every screen)

Judge the screen as a first-time user who reads slowly, word by word, and has never seen it. The
severity of a failed line follows what it does to the user, not how many lines failed: Critical if
it stops the user from finishing the task or misleads them, Major if it makes the task slow or
confusing, Minor if it is polish. A screen that fails line 1 or 2 is reported first.

1. **One job per screen.** Within a few seconds a new reader can say what the screen is for and
   what to do first. If the answer is "several things", split the screen. Restyling will not help.
2. **The main action is visible without scrolling** on a small phone, as one primary button
   labelled with the task ("Send invoice"), not "OK" or "Submit".
3. **One column, short lines.** No side-by-side blocks on a phone, no wall of text, nothing that
   moves or changes on its own.
4. **Every icon has a word next to it.** A tick, a cross or a dot alone fails. A symbol that could
   mean two things says which in words. Do not flag a standard, well-known icon-only control
   (close, search, menu, back) that has an accessible name.
5. **State is never shown by colour alone.** Ready, late, pending and done each carry a word or a
   shape as well.
6. **Plain words.** Short sentences, one idea each. No internal jargon and no abbreviations a new
   user would not know.
7. **Current status is visible without a tap.** What is done, what is waiting, and for whom.
8. **Controls a user cannot use are not shown to that user.** A disabled switch with no
   explanation at the top of the screen fails.
9. **Every field has a visible label above it.** A placeholder alone fails. An error sits next to
   its field and says what to do.
10. **Destructive actions sit apart** from the main action and ask a plain question that names
    the consequence ("Delete project Alpha? Its 12 files will be removed.").

## States

- Empty: says what belongs here and offers the action that fills it.
- Loading: shows that something is happening, and the layout does not jump when content arrives.
- Error: says what went wrong in plain words and what the user can do next. No raw error text.
- Long content: long names, large numbers and long lists do not break the layout.
- Success: the user can tell that the action worked, and what changed.
- Limits: the user is warned before reaching a limit, not only blocked at it.

## Navigation

- The current location is visible.
- Going back returns to where the user came from, with their input kept.
- The same action has the same name and place on every screen.

## Forms and feedback

- Fields are grouped in the order a person thinks about them.
- Only what is needed is asked.
- Validation appears when it helps, not on the first keystroke.
- A long action shows progress and cannot be triggered twice by accident.
- When one person's input becomes another person's view, the person entering it can preview the
  result.

## Accessibility

Use the project's stated target if it has one. A common target is WCAG 2.2 level AA.

- Text contrast is sufficient against its background, including on images and in disabled-looking
  states that are still readable content.
- Touch targets are large enough to hit, with space between them. A target under 24 by 24 CSS px
  fails WCAG 2.2 level AA (2.5.8), unless the space around it makes up for the size. 44 by 44 CSS
  px is the comfortable target (level AAA, 2.5.5).
- Keyboard: every control can be reached and used, in a sensible order, with a visible focus mark.
- Images that carry meaning have a text alternative. Controls have accessible names.
- Text can be enlarged without content being cut off.
- Motion can be reduced for users who ask for it.
- Text direction and long translations do not break the layout, if the product is translated.

## Desktop

- The layout uses the width with purpose: more context, side-by-side comparison, fewer steps.
- Line length stays readable. Text does not span the full width of a large screen.
- Hover is never the only way to discover an action.
