---
name: performance
description: Read-only performance review. Pins the one slow operation, measures it before forming any theory, finds where the time really goes, and returns a ranked list of fixes with the expected gain and the evidence for each. Changes no code, no data and no configuration. Use when the user says "why is this slow", "this page is laggy", "find the bottleneck", "performance audit", "profile this", "the app hangs", "it takes forever to load" or "speed this up" and wants the diagnosis first. Not for wrong results or crashes (bug-hunt), and not for applying the fixes (build-it).
---

# performance

Finds the real cause of a slowness complaint and hands back a ranked, evidenced fix list. The
method is: pin one operation, measure it, split the time, confirm the largest part, then rank.
This skill is read-only. It changes no code, no data and no configuration, and it ends by proving
that with a clean `git status`.

## When to use

- A named page, request, job or action is slow, hangs or got slower.
- Before an optimisation effort, to decide what is worth fixing.

## When not to use

- The result is wrong or it crashes. That is a bug: use `bug-hunt`.
- No operation is named and there is no timing. Get one first (step 1). Reviewing "everything"
  finds nothing.
- The user wants the fix applied. Run this first, then hand the top finding to `build-it`.

## Steps

1. **Pin the complaint.** Name one operation: the exact URL, endpoint, command or user action, and
   where it is slow (start-up, one request, one screen, a background job). One target keeps the
   review honest.
2. **Collect the numbers that exist.** Ask for or find real timings: response times in logs,
   monitoring traces, browser timing, a profiler output. If the complaint is about a deployed
   system, read the code at the version that is deployed, because the local checkout can be far
   from it.
3. **Measure a baseline yourself when you can.** Time the operation with the project's own tools
   (find them in its files: scripts, a `Makefile`, the test or benchmark setup). Run it several
   times and note cold and warm runs apart. Without a baseline nobody can tell later whether a fix
   helped.
4. **Split the time.** Break the total into parts: network, server work, queries, rendering,
   client script. Find the part that holds most of it. A fix to a part that holds a small share of
   the time cannot give more than that share back.
5. **Read the critical path first.** Before any theory about bundles or fonts, read the code that
   runs for this operation and look for blocking work: calls made one after another that could run
   together, calls with no timeout, blocking file or parse work inside a request, a query inside a
   loop.
6. **Check the layers the operation touches.** Use `references/checks-by-layer.md`: data access,
   server, rendering, assets. Skip the layers this operation does not use.
7. **Confirm the top suspect with a measurement.** For example a query plan that shows a full
   scan, a profile that shows where the time sits, the timing of one call in isolation. Use
   read-only tools only. A suspect that was not measured is labelled a hypothesis.
8. **Rank the fixes.** Worst user impact first. For each, state the expected gain and where that
   number comes from (the measured share of time it removes). Do not invent a figure.
9. **Confirm nothing changed.** Run `git status`. It must match the state before the run. A
   production build or a profiler may write to ignored output folders, and nothing else.

Helper agents can do the mechanical scans (list sequential calls on the critical path, list
queries with no limit, read a build's size table). Use a read-only agent such as
`guardrails:readonly-reviewer`, on a cheaper, faster model. Each returns locations and pasted
lines, not conclusions. Root cause and ranking stay with the main session, on the strongest model
you have. For a wider read-only pass, see `guardrails:readonly-audit`.

## Output format

```
Operation: <the one thing reviewed>
Baseline: <measured time, how it was measured, number of runs> | not measured: <why>
Where the time goes: <part: time or share> ...

Findings, worst first
1. <symptom in user terms>
   Evidence: <pasted measurement, plan line or code lines, with path:line>
   Fix: <the concrete change>
   Expected gain: <amount> because <the measured share it removes> | unknown until measured
   Also needs: <a schema, index or configuration step a human must apply, or "code only">
   Status: confirmed by measurement | hypothesis

Overall: critical | high | medium | low
How to verify a fix: <the same measurement to rerun>
Not checked: <layers or environments skipped, and why>
Changed: nothing (git status matches the start)
```

Severity: **critical** blocks use or causes errors. **high** is a delay users clearly feel on a
main path. **medium** is noticeable with a workaround. **low** is polish.

## Hard rules

- Read-only. Every data-store action is a read: plans, index listings, sizes. Never create an
  index, update a row or change a setting. A recommended index is an item for a human to apply.
- Numbers before theory. If nothing was measured, the report says "hypothesis, measure before
  acting" at the top.
- Do not recommend caching away a page that is fresh on purpose. Reduce the work per request
  instead.
- Keep load low on a live system: a few requests, never a stress test, unless the user asked for
  one.
- Paste the evidence. "It scans the table" without the plan line is not a finding.
- The expected gain is always tied to a measurement, or marked unknown.

## Common mistakes

- Blaming assets or bundle size before reading the code on the critical path.
- Optimising a step that holds a small share of the time.
- Reporting ten findings of equal weight instead of the one that matters.
- Measuring once, on a cold start, and treating it as typical.
- Reading local code to explain a slowness that happens on a different deployed version.
- Applying the fix "while there". The review loses its baseline and stops being read-only.
