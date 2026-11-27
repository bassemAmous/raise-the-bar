---
name: lost-in-translation
description: Finds text a user could meet untranslated, across every language the project supports. Reads the supported languages from the project's own source, compares every message key and every translated database field against that list, and reports what is missing, what is stale because the source text changed, which language lists drifted, and which strings never go through the translation system at all. Report first; fills gaps only when asked, and only on local or development data. Use when the user says "check the translations", "missing translations", "is it translated in German", "check every language" or "i18n check". Not for wording quality in one language (no-great-question) or a general code review (spaghetti-meter).
---

# lost-in-translation

A missing string in a supported language is a product defect, not a typo. The user sees a key, an
empty label, or text in the wrong language, and the test suite rarely notices, because the app
falls back quietly. This skill finds every such place, sorts it, and closes it through the
translation pipeline the project already has.

## When to use

- Before a release, a demo, or opening the product in a new language or market.
- After a change that added or edited user-facing text.
- When someone reports text in the wrong language.

## When not to use

- The wording in one language is unclear: use `no-great-question`.
- The code needs a general quality pass: use `spaghetti-meter`.

## Steps

1. **Read the ground truth, do not assume it.**
   - **Supported languages:** find the project's own list (a constant, a config file, a type).
     That list is the contract. Never assume the count or the source language.
   - **Per customer or tenant:** if each one turns languages on or off, it owes only the ones it
     turned on. A code turned on that is not in the supported list is a defect of its own: the app
     strips it or falls back. Flag it loudly, apart from the gaps.
   - **The text layer:** the message files or copy tables and the translation helper (`t(...)` or
     the project's equivalent).
   - **The data layer:** database fields that hold one value per language, and how an empty or
     absent language is stored.
   - **What already exists:** a gap helper, a translate button, a check on save. Reuse it. If a
     name you expected is gone, say so and use what you find.
2. **Compare the text layer.** Every key against every supported language. List each key with
   the languages it lacks.
3. **Compare the data layer.** For the scope asked (one customer, one screen, everything), list
   each translated field that is empty for an enabled language. Prefer the existing gap helper.
   Use local or development data, or a public read.
4. **Sort what you found:**
   - **Missing:** an enabled language has no value. Worst first.
   - **Dropped by a schema:** a validation schema lists fewer languages than the supported set,
     so the extra ones vanish on save or on read. Look for hand-written language lists that drifted
     from the source. Check both the write side and the read side. Rank with missing.
   - **Stale:** a translation exists, but the source text changed after it was written.
   - **Outside the system:** an inline `lang === "fr" ? a : b`, or a literal string that never
     goes through the translation helper. It will never reach the pipeline.
5. **Report** in the format below. If a layer is complete, say so in one line.
6. **Offer to fill, never fill unasked.** On a yes: use the project's existing translate path,
   translate from the source language, never overwrite a human translation, never touch the
   source language, and write to local or development data only. Then run the check again and
   show missing at zero.

## Output format

```
Translations: <scope>. Languages checked: <list, from <source file>>

Missing: <N>
  <key or entity.field> : missing <languages> (<file or record>)
Dropped by a schema: <N>
  <schema file:line> : lists <languages>, lacks <languages>
Stale: <N>
  <key or entity.field> : stale in <languages> (source changed <when>)
Outside the system: <N>
  <file:line> : <inline language check | untranslated literal>
Languages turned on but not supported: <codes, or "none">

Cleanest fix: <the one move that closes the most>
```

## Hard rules

- The language list comes from the project, read fresh each run.
- The source language is the source. The others are derived from it.
- Report first. Fill only on the user's yes, and never on shared or live data.
- Reuse the existing gate and pipeline. Building a second one is the failure.

## Common mistakes

- Trusting a language count from memory or an old document.
- Checking the message files and forgetting the database fields.
- Calling a stale translation "done".
- Fixing one schema's language list and missing its twin on the other side of the API.
