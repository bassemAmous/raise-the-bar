# Kill proof

How to show that a test can fail, and fails for the right reason. Read it for steps 6 to 9.

## 1. What counts as a kill

A kill is the test failing **at the assertion that pins the behaviour**, with a received value
that shows the break. Read it in the report, never from the exit code:

- Playwright's JSON report has, per test, the last result's `status` and `error.location`
  (file, line). `failed` with `expect(...)` at the pinned line is a kill.
- `timedOut`, a crash, a failed navigation, or a failure at an earlier line (setup, a locator
  before the pinned one) is **not** a kill. The test may be blind and merely fragile.
- A missing element counts only when its absence is the behaviour. A missing page is not.
- A custom message (`expect(x, "total shown")`) comes before the `expect(` line in the error.
  Read the whole message.
- Keep traces on evidence runs: the trace shows what the page held at the red.
- After the kill, restore and run the same test green. A break never restored taints every run
  after it.

A test that no break turns red is **equivalent** only after you tried another input or state where
the break would show, and nothing observable differed. If unsure, write **unresolved**.

## 2. Ways to break, cheapest first

**A planted reply.** Serve a copy of the recorded reply with one field changed, so the page must
show it. Fulfil with an explicit status, content type and body. If the app compares a new reply
with one it holds, let the first load through and plant from the second.

**A flipped input.** A cookie, a query parameter, the browser locale, a feature flag, a viewport
across a breakpoint. Prove the flip took effect (the request carries it) before reading the result.

**A one-line source change**, restored from a copy. Copy the file first, edit one line, run, copy
it back. Never `git checkout` a file: it throws away other uncommitted work. Useful one-line breaks:
- a wrong constant (another language code, an off-by-one limit);
- a flipped branch (`!==` to `===`, `&&` to `||`, a guard removed);
- a missing side effect (delete the call that writes the cookie or sends the request);
- an empty return (`return {}`, `return []`, `return ""`);
- missing validation (accept the value the code used to refuse).

Restore with a plain content copy that gives the file a new modification time. A copy that keeps
the backup's old time can make an incremental build skip the file, so the "green again" run
executes the broken code. Look for a marker only the break has in the compiled output, and see it
gone, before the restored run counts.

**A mutant build of a dependency.** For a library upgrade, break the shipped bundle, not its
source, so the app installs it the way it installs the real one:
1. Unpack the build under test. For each behaviour the app takes from it, write one exact text
   swap (`from` to `to`) in the bundle file.
2. Check that `from` matches exactly once. Zero or two matches mean the swap is wrong.
3. Append a marker line naming the mutant.
4. Pack it and record its fingerprint (sha256 of the bundle file, 16 hex digits).
5. Install it without saving it to the lock file, and compare the installed fingerprint with the
   build list before every run.
6. Clear the bundler's dependency cache before the run. Afterwards, find the marker in the file
   the dev server served. No marker, no run.

`scripts/make-mutants.mjs` does steps 1 to 4 from a JSON list of swaps.

## 3. Prove what ran

Before a run counts, print and keep:
- **the build**: the installed bundle's fingerprint, matched against the build list;
- **what was served**: the marker in the served file, after clearing the cache;
- **the server**: every test port free before the start, no reuse of a server already running,
  and the server's working folder is the copy you meant;
- **the network**: other hosts aborted, and a request no stub expected fails the test;
- **the planted control**: a reply change the page must show, seen once per rig.

Size a repeated run to finish inside any wrapper or lock timeout: a run cut short writes no report.
Keep one summary line per run: time, build, label, exit code, passed, failed, flaky, skipped,
served build. A run whose served build differs from its label does not count.

## 4. Base against change

- The same spec file, unchanged, runs on the base and on the change.
- Each run alone: one spec, one worker, no retries.
- A difference counts after it is seen twice on each side, with the order swapped: the first
  browser of a fresh run can be slow and make whichever side runs first look slow.
- Every red is reconciled with the expected result written before the run. A cause read from a
  trace is a guess until a rerun with that factor flipped confirms it.
- "Same on both sides" counts only with the planted control seen on both sides. Two runs that
  both errored compare equal and prove nothing.

## 5. Worked example (invented)

Acme's shared text library changes how five apps fetch and format their texts. The question:
would the apps' tests notice if the library broke?

Five mutant builds, one exact swap each:

| Mutant | Breaks |
|---|---|
| markup | inline markup stays as sent instead of becoming tags |
| nesting | dotted keys stay flat instead of nesting |
| language | every text request asks for US English |
| server-texts | the service's texts are ignored, only the fallback shows |
| error | a failed request rejects instead of falling back |

The apps' own suites stayed green on every mutant: one aborted every text request, one answered
an empty map, one ran on mocks. The new specs did the job: on one app the markup mutant turned
exactly its three markup tests red, each at its `toHaveText` line, and left the two service-text
tests green. That is a kill and specificity in one run.

Before that, a first round compared old and new pages in four languages and found them "the
same". Both showed English: the test sent a language code the service does not read. The planted
control exposed it.

## 6. Scripts

`node scripts/make-mutants.mjs <config.json>` builds mutants of one npm package. The config format
is in the script's header. It writes each mutant's package, a `.tgz` per mutant and `builds.tsv`
(name, fingerprint, tarball), and refuses a swap that does not match exactly once.

`node scripts/kill-matrix.mjs --base a.json --change b.json --break markup=c.json ...` reads
Playwright JSON reports. It prints whether base and change agree test by test, which tests each
break turned red and at which line (a timeout or an error before the assertion is flagged as "not
a kill"), and which tests no break turned red.

Both are tested by `scripts/scripts.test.mjs` (`node --test`).
