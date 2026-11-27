# The rules

Each rule has an id. Cite the id in every finding and in every fix commit, so the reader can look
it up and the fix is not open to debate. Thresholds are defaults. If the project has its own
written limits, use those and say so.

## N: names

- **N1** A name says what the thing is or does. Functions are verbs (`loadInvoice`), data are
  nouns (`pendingOrders`), booleans are questions (`isPaid`).
- **N2** No filler names: `data`, `tmp`, `info`, `list`, `handleClick2`. A name that needs a
  comment to explain it is the wrong name.
- **N3** One word per idea across the codebase. Do not mix `fetch`, `get` and `load` for the same
  kind of action.
- **N4** The length of a name matches its reach. A loop index can be short. A module-level value
  cannot.

## F: functions and files

- **F1** One function does one job at one level of detail. The top function reads like a table of
  contents, and each step is a named function.
- **F2** A function over about 80 lines (150 in tests) is a finding. A shorter one that mixes
  levels (parsing a request next to a business rule next to a query) is a bigger one.
- **F3** A file over about 500 lines is a finding. Split it by responsibility, not by size.
- **F4** No flag arguments that change what a function does. Make two functions.
- **F5** More than three or four parameters become one named object.
- **F6** No nested conditional expressions. Name the cases.

## C: comments

- **C1** A comment says why, never what. Keep: the reason for a workaround with a link to the
  issue, an invariant, a warning about a real trap.
- **C2** Delete commented-out code. Version control keeps it.
- **C3** Delete comments that repeat the code, and section rulers that split a file which should
  have been two files.
- **C4** A to-do without a name or a tracker entry is deleted or written into the backlog.

## D: duplication and reuse

- **D1** The same few lines in two places are noted, not extracted. A third copy is the moment to
  extract a helper. Say where it should live.
- **D2** Before adding a helper, search for the concept, not the name. A second copy of an
  existing helper is a finding.
- **D3** Shared truth (types, validation schemas, constants, translations) lives in one place.
  A module that declares its own copy is a finding.
- **D4** No unexplained literals. A number or string with meaning gets a name.

## E: errors

- **E1** No swallowed errors. An empty catch, or a catch that only logs and carries on, is a
  finding.
- **E2** Errors are raised with a type or code at the edge and translated once into a message a
  person can act on. No raw stack trace reaches a user.
- **E3** A failure path is tested like a success path.

## B: boundaries

- **B1** Every input from outside is validated where it enters: request parameters, bodies,
  cookies, files, responses from other services.
- **B2** Each layer depends on the one below it, not the other way round. Interface code does not
  import storage code directly unless the project's design says so.
- **B3** A value saved through the interface passes every validation layer with the same rules.
  A form that accepts what the storage layer rejects is a finding.
- **B4** Public names that others depend on (URLs, API fields, stored fields) are stable. Renaming
  one is Critical.

## S: security hygiene

- **S1** Every endpoint that is not public checks who is calling and what they may touch. An
  identifier taken from the request and trusted is Critical.
- **S2** No secret in the code, in logs or in error messages.
- **S3** No user input spliced into a query, a shell command, a regular expression or markup
  without the safe mechanism for it.
- **S4** No personal data in logs.
- **S5** No unbounded work driven by user input: a loop, a batch or a parallel fan-out with no
  limit.

## T: tests

- **T1** A test name is a sentence a non-developer could read ("refuses a viewer on the billing
  page").
- **T2** Arrange, act and assert are visible. Helpers are named by intent.
- **T3** A module with public behaviour and no test is Major.
- **T4** A bug fix ships with a test that failed on the old code. The commit says so.
- **T5** No tolerated failing tests. A failing test is fixed or reported. It is removed or changed
  only when the test itself is wrong and the user agrees, with the reason written down.
- **T6** A test is not loosened to make a change pass.

## R: the newcomer test

- **R1** A new team member, with the file name and one minute, can say what the file does and
  where a bug would hide. If not, name the one obstacle: a name, the size, a hidden side effect,
  or a dependency that is not visible.

## A: signs of machine-written code

- **A1** Comments that narrate the next line, or say "now we", "this ensures", "robust".
- **A2** Defensive checks for cases the types already rule out, and try/catch that only rethrows.
- **A3** A helper, wrapper or config option used exactly once, added "for flexibility".
- **A4** Names with filler words: `data`, `info`, `manager`, `handler`, `util`, `processedResult`.
- **A5** A new pattern next to an existing one that does the same job. Match the conventions
  already in the file before adding your own.

## Severity

- **Critical**: breaks a contract, a security rule (S1 to S3) or correctness.
- **Major**: makes the code hard to change safely (F1 to F3, E1, T3, T4, R1).
- **Minor**: costs the reader time (most N, C, D and A rules).
