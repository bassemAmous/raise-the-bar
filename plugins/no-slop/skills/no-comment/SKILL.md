---
name: no-comment
description: Keeps code comments to the ones that say why, never what. Fixes the name first so the comment is not needed, defaults to no comment, and keeps a comment only for what the code cannot say itself: a trap, a reason, an outside constraint, an order that matters, a unit the type does not carry. Applies to every file written or edited, in any language. Use it while writing code, and when the user says "too many comments", "these comments are useless", "clean up the comments" or "write a comment for this". Not for grading code as a whole (spaghetti-meter) or for prose replies (no-great-question).
---

# no-comment

Comments that say why, never what. The code already says what it does. A comment that repeats it
is noise the reader must skip, and it goes stale the first time the code changes. A comment earns
its place only by telling the reader something the code cannot.

## When to use

- Every time code is written or edited. This is a habit, not a review step.
- When a file has more comments than it needs, or a comment has gone stale.

## When not to use

- A full quality grade of the code: use `spaghetti-meter`.
- Explanations in a reply: use `no-great-question`.

## Steps

1. **Fix the name first.** A comment that explains what something does means the name failed.
   Rename, then delete the comment. `const enabledSources = ...` beats `const active = ...` with a
   comment above it.
2. **Default to no comment.**
3. **Ask the test of every comment that is left:** would a good developer be surprised, confused,
   or about to break something without this line? No means delete it.
4. **Keep only what earns a place:**
   - **A trap:** the code looks wrong, or looks safe to change, and is not.
   - **A why:** the obvious alternative looks better, and there is a reason it was not chosen.
   - **An outside constraint:** a quirk of another service, a rule in a spec, a browser bug.
     Open the source before you cite it.
   - **An order that matters:** "must run before X" is invisible in the syntax.
   - **A unit the type does not carry:** seconds or milliseconds?
5. **Write the earned ones short.** One or two lines, in plain words, like speech. Say what breaks
   if someone changes it.
6. **Before saving, count the comments you added.** Delete half. Ask the test again of the rest.

## What never earns one

- Restating the code: `// set the user name`.
- Section banners: `// ===== Helpers =====`.
- Empty doc blocks: `@param id the id`.
- Step narration: `// Step 1: fetch`. Name the function `fetchOrders` instead.
- Change history: `// added null check`. Version control holds that.
- The old bug's story. Say the rule the line keeps instead: not "// was 5 px too wide", but
  "// keeps the heading inside the card at 200% text size".
- Commented-out code.
- A bare ticket number. Say what it forced, then the number.

## Example

```ts
// Restates the code: delete it.
// Loop through and keep the enabled sources
const active = sources.filter((s) => s.enabled);

// Better name, no comment needed.
const enabledSources = sources.filter((s) => s.enabled);

// Earned: the reader cannot see this from here.
// The settings service also returns disabled sources; the screen must not show them.
const enabledSources = sources.filter((s) => s.enabled);
```

## Hard rules

- The project's own rules win. If it requires doc comments on public functions, write them, with
  real content.
- Never delete a comment that names a real trap or constraint just to lower the count.
- A comment that is wrong is worse than none. Fix it or remove it in the same change.

## Common mistakes

- Commenting to look thorough.
- Keeping a long block about a problem this file does not own.
- Explaining a confusing name instead of changing it.
- Citing a spec or a ticket without opening it to check it says that.
