---
name: readonly-audit
description: Read-only security audit of a codebase, a feature or one endpoint. Maps what can be reached and by whom, hunts for real weaknesses, has a second agent try to disprove every finding, and returns a ranked list with evidence and the smallest fix. Changes nothing. Use when the user says "security audit", "audit this", "is this endpoint safe", "threat model", "what can an attacker reach", "check for vulnerabilities", or before opening a new surface to users. Not for a review of only the pending diff (Claude Code's /security-review), or for fixing what is found.
---

# Read-only audit

An audit answers one question: what can go wrong here, and how do we know? It diagnoses and
changes nothing: no file, no setting, no data. That keeps the audit safe to run at any time, and
keeps the findings separate from the fixes, which someone must choose to make.

## When to use

- Before a new surface goes live: a public endpoint, an upload, a login change, a webhook.
- On a schedule, or when the user asks whether something is safe.
- After an incident, to find the same class of problem elsewhere.

Not for style or speed. Not as a replacement for the review before a push
(`guardrails:push-review`): that one reads a diff, this one reads a surface.

## Steps

1. **Fix the scope in one line.** "The public API under /api/orders" or "everything a logged-out
   visitor can reach". Note what is out of scope. Record `git status` so you can show at the end
   that nothing changed.

2. **Map the surface.** List every way in: routes, forms, uploads, webhooks, background jobs,
   admin screens, scripts. For each: who can call it (anyone, a logged-in user, an admin, another
   service), what input it takes, what it reads and writes. Read the code for this. Do not guess
   from names.

3. **Hunt by class.** Run the hunt as one or more `guardrails:readonly-reviewer` agents (tools:
   Read, Grep, Glob). They cannot edit a file or run a command, so for them read-only is a fact.
   The main session can still run commands and edit, so for it read-only is a promise, kept by
   the hard rules below. Each finder goes through each entry point with these questions:
   - Access: is the caller's identity checked, and is it checked that this caller may touch this
     record, not only that they are logged in?
   - Input: can a value reach a database query, a shell command, a file path, a template, or a
     URL the server fetches, without being checked?
   - Secrets: is a key, token or password in the code, in logs, in an error message, or sent to
     the browser?
   - Sessions: cookie flags, token lifetime, logout, password reset, rate limits on login.
   - Data: can one user read or change another's data by changing an id? Are uploads checked for
     type and size, and stored where they cannot run?
   - Dependencies and settings: known-vulnerable versions, debug modes, open CORS, missing
     security headers, default credentials.
   - Abuse: what can be done a million times for free? What costs money or sends messages?

4. **Have every finding attacked.** Give each candidate to the agent
   `guardrails:readonly-reviewer` with the file, the line and your reasoning, and ask it to prove
   the finding wrong: a check you missed, a layer that already blocks it, a path that cannot be
   reached. A finding counts only if it survives. Mark the rest "not confirmed" and keep them in
   an appendix. For a large surface, start several finders at once, each on one part, and one
   skeptic per finding.

5. **Rank by what an attacker can reach.** Critical: reachable without an account, or leads to
   other users' data, code execution or money. High: needs an ordinary account. Medium: needs
   special access or luck. Low: hardening. Say what the attacker needs and what they get.

6. **Report**, in the format below, and show `git status` again: it must match step 1.

## Output format

```
Scope: <one line>     Out of scope: <one line>

Summary: <N> confirmed (<critical>/<high>/<medium>/<low>), <M> not confirmed

1. [CRITICAL] <title>
   Where: <file:line>
   What an attacker does: <steps in plain words>
   What they get: <result>
   Evidence: <the code path or a read-only command and its output>
   Smallest fix: <one or two lines>

...

Not confirmed: <finding> : <what disproved it>
Not looked at: <part> : <why>
Working tree unchanged: yes (git status before and after)
```

## Hard rules

- Read-only means read-only: no edits, no installs, no writes to any database, no requests that
  change state on a live system. If proving a finding would need one, describe the proof and stop.
- Never test against systems or accounts you were not asked to test.
- Evidence for every finding: a file and line, or the output of a read-only command. No evidence,
  no finding.
- Do not paste a real secret into the report. Name the file and line, and say it must be rotated.
- Say what you did not look at. A silent gap reads as "checked and fine".

## Common mistakes

- A list of every theoretical weakness with no ranking. Ten real findings beat a hundred maybes.
- Stopping at "the user is logged in" without checking the record belongs to them.
- Reporting a finding the framework already blocks, because nobody tried to disprove it.
- Fixing things during the audit. The fix is the next task, started on purpose.
