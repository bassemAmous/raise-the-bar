---
name: message-in-a-bottle
description: Writes a handoff note that a fresh session, with no memory of this one, can pick up and trust. Every command in it was run before it ships, and it opens with a start check the reader runs first, so a stale note says so itself. Has a wrap mode that saves this session's state before the context runs out. Use when the user says "write a handoff", "give me a handover for another session", "a resume note", "so another session can run it", "wrap up the session", "save what we did" or "the context is almost full", and before parking work you will not finish here. Not for test cards for a human tester (homework-for-humans), a commit or pull request text (not-another-wip), or doing the handed-over work yourself.
---

# message-in-a-bottle

A handoff note is read by someone who saw none of this session: another agent, a teammate, or you
tomorrow. It must work cold. Two things make that true. Every command in it ran before it ships,
with its output next to it. And it opens with a **start check**: a block the reader runs first,
which prints the facts the note depends on and compares them. A note that says "the branch is at
X" goes stale within hours. A block that prints X and compares does not.

## When to use

- **Forward mode:** work moves to another session. A brief to build, test or challenge something,
  a "fix these review comments" plan, a resume note.
- **Wrap mode:** this session is ending or its context is nearly full. Save what was done, how to
  start everything, what is still owed, and what comes next.
- Before you park work you will not finish here.

## When not to use

- The reader is a human tester: use `homework-for-humans`.
- The reader is a reviewer of a commit or pull request: use `not-another-wip`.
- The handed-over work should be done in this session: do it.

## Steps

1. **Say who it is for, first, in the chat.** One line: "Written for: a fresh session with no
   context, whose job is ...". It lets the user correct the audience before the note is written.
2. **Ask first what you cannot default.** If an open question would lead to different code (which
   base branch, what the new code must match, which environment), ask it now, in one batch, each
   with your default and its reason. Everything else gets a stated default inside the note.
3. **Pick where it lives.** Forward mode: a committed `docs/handoff/<topic>-<date>.md`, unless the
   project keeps them elsewhere. Wrap mode: a file in the project's ignored scratch area. Run
   `git check-ignore -v <path>` either way and say in the note whether it is committed or local
   only. Never a temp folder: the next session cannot see it.
4. **Write the start check.** One block to copy and paste that prints and compares: the tip commit
   of every branch involved, the ancestors it expects (`git merge-base --is-ancestor`), the
   baseline numbers (type check, lint, test count, build), and the ports it uses. When a check
   needs a server that does not answer, it prints "SKIPPED, not verified", never a pass. An
   unreachable server returns nothing, and nothing can read like "all clear".
5. **Write the body, in this order:**
   1. **The ask, as numbered clauses**, each with the evidence that will close it. A claim to
      attack is a clause too.
   2. **What to trust.** The documents and records the reader reads before forming an opinion,
      with the exact entries.
   3. **Rails.** What the reader must not do: push, touch the main checkout, fix inside a
      find-only run. Each rail names the skill that owns it. Every install, build, test or server
      command is written as `cd <absolute path> && ...`: a helper's shell starts in its parent's
      folder, and a bare command runs in the wrong project.
   4. **Which skill runs it.** The reader's first instruction names the skill to load. Do not
      paste the skill's method: a pasted method gets approximated, a loaded skill gets followed.
   5. **What to hand back:** the format, gaps first, and any list that must balance.
   6. **How to resume:** servers to start (command, folder, port, what "ready" looks like), test
      data, logins and where they live. Never a secret in the note.
6. **Wrap mode adds four plain sections:** what was done (one line per change, from `git status`
   and `git log`, never from the plan), how to start every server, what does not ship with the
   code (settings, data changes, new dependencies), and what comes next. A section with nothing in
   it says so in one honest line.
7. **Check it as the cold reader.** Run the start check again and paste its output at the top.
   Open every path the note names. Search the whole note for a command without its folder and
   fix each hit. Find the source of every number.
8. **Hand back** in the format below.

## Output format

```
Written for: <audience>
Note: <path> (committed | local only: <why>)
Start check: ran at <time>, <N> of <N> checks agree
Commands run before shipping: <N>/<N>
Commands without their folder: 0
Skill the reader loads first: <name>
Owed by the reader: <what they hand back>
Asked before writing: <questions and answers, or "nothing open">
```

## Hard rules

- No command in the note that was not run this turn. "Should work" is not a line in a handoff.
- No person's name. Roles only: "the reviewer", "the tester".
- No secret, token or password. Name where it lives.
- Facts come from the repository and this conversation, never from a plan's intentions.
- A check that could not reach its server says "not verified", never "ok".

## Common mistakes

- Writing "the tree is at X" instead of a block that prints X.
- Restating a method instead of naming the skill that owns it, so the reader loads nothing.
- Leaving the note in a temp folder that dies with the session.
- A bare `npm ci` in the middle of a table, run later in someone else's project.
- Padding "what was done" with what was planned.
