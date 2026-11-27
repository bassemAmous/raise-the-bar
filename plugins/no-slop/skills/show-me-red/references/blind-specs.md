# Blind specs

Patterns that keep a spec green whatever the app does, or red whatever the app does. For each: why
it is blind, the break that proves it, and the fix.

A spec is **blind** when a break of the behaviour it claims leaves it green. A spec is **brittle**
when a harmless change (a refactor, a class rename, unrelated copy) turns it red. Both fail as
detectors: the first hides regressions, the second teaches people to ignore red.

## Assertions that cannot fail

| Pattern | Why it is blind | The break that proves it | The fix |
|---|---|---|---|
| `toBeVisible()` on `body`, `toBeTruthy()`, `toBeDefined()`, `not.toBeNull()` | Holds on any rendered page, an error page included | Any break of the behaviour | Assert the marker only this state has, with its exact text |
| A fragment: `toContain("a")`, `toContainText("Acme")`, `/.+/` | Almost any text contains it | Change the text: the fragment survives | `toHaveText` with the whole string, typed as a literal |
| `getByRole("button", { name: "Remove" })` without `exact: true` | Playwright matches substrings and ignores case: "Remove all" passes | Rename the label to a longer one | `exact: true`, or `toHaveText` on the element |
| The expected value read from the app's own code or files | The expectation moves with the app | Change the source value: still green | A literal from the spec or a recording |
| An `if (await x.isVisible())` around the assertion | The branch skips the check when the state is wrong | Make the condition false: green | No branches; one test per state |
| No assertion, or one in a helper that is never awaited | Nothing is checked | Any break | Every test ends on an awaited `expect` |

## Stubs that hide the changed path

| Pattern | Why it is blind | The break that proves it | The fix |
|---|---|---|---|
| Every request to the service aborted, or answered with an empty map | Only the fallback runs; the code under change never sees data | A build that ignores the data: green | Answer from a recorded reply; plant a change and see it |
| The code under change is stubbed (a mocked module or hook) | The test checks the fake | Break the real module: green | Stub at the network boundary only |
| The stub gives the same reply whatever was asked | A wrong request still gets the right answer | A build that asks for the wrong language: green | Route on the exact parameters; assert the request |
| A service worker answers before the test's route does | The stub never runs | Change the stub: the page does not change | Block service workers when routing |
| A recording made once and never refreshed | The real service changed shape; the stub keeps the old one green | Diff a fresh recording against the stored one | Re-record in a named live run, never inside the suite |
| An unexpected request passes through or gets a default 200 | A new or extra call goes unseen | Add a call: green | Fail on any unstubbed request; count calls per endpoint |
| The input is in a format the system ignores | Both builds fall back to the same default and compare equal | A planted reply never shows | Use the format the system reads; check the request carries it |

## Runs that hide flakes or test the wrong thing

| Pattern | Why it is blind | The break that proves it | The fix |
|---|---|---|---|
| Retries above 0 for an evidence run (a retry set inside the file beats the command line) | A flake becomes a pass | No retries and ten repeats show the red | Remove retries from the file; run with none |
| `waitForTimeout`, waiting for network idle, a fixed sleep | Passes or fails by timing | Run under load or repeated | Wait on a real condition; hold a slow reply on a promise |
| `waitForFunction("() => ...")` as a string | The string is an arrow function, always truthy, so the wait never waits | Remove what it waits for: green | Pass a real function |
| Reusing a server already running on the port | The suite tests whatever answers the port | Start another app there: green | A port of its own, no reuse |
| A dependency swapped while the bundler cache is kept | The server serves the build installed before | A mutant's marker is missing from the served file | Clear the cache; check the served marker each run |
| `force: true` on a click | Clicks what a user cannot | Cover the button with an overlay: green | No `force` |

## Brittle patterns (red for nothing)

| Pattern | Why it fails as a detector | The fix |
|---|---|---|
| Class names, DOM structure, component state | A refactor turns it red while the user sees no change | Roles, accessible names, text, requests |
| A large snapshot (serialized DOM, full-page screenshot) | Any change turns it red, so it gets updated by a flag and stops checking | The fields that carry the behaviour |
| Exact unrelated copy in a test about something else | A copy edit turns a data test red | Pin exact words only where the words are the behaviour |
| Every request asserted byte for byte, tracing headers included | Red on a harmless refactor of the call | Assert the fields another system reads |

## Machine checks

Where the project uses ESLint, `eslint-plugin-playwright` catches several shapes before any run:
`expect-expect`, `no-conditional-in-test`, `no-conditional-expect`, `no-wait-for-timeout`,
`no-networkidle`, `no-force-option`, `no-skipped-test`, `no-focused-test`, and
`no-restricted-matchers`. A lint pass finds blind shapes, not blind stubs. It does not replace the
kill proof.
