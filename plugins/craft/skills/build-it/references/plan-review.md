# Plan review

How to review an implementation plan before any code exists. A weak decision is cheap to fix in a
plan and expensive after it has shipped. The review is read-only: it produces a verdict and the
work the plan is missing. It never edits code.

## 1. Cut the scope first

Do not review the plan as given. Challenge its size. For each part, ask what the smallest version
that delivers the value is, and what is explicitly out of scope. Write the out-of-scope list down.

## 2. Check what already exists

Search for existing code that does the same job. Name the helper, route or pattern the plan should
reuse. Say whether the plan uses a proven approach or a new one, and what the new one buys.

## 3. Read the plan through these questions

- **Blast radius.** In the worst case, who and what is affected: how many users, clients, stored
  records, printed or shared links, integrations?
- **Boring by default.** Is each new technique needed, or would the approach the project already
  uses do the job?
- **Reversibility.** Can each step be undone cheaply (a flag, an additive change, a staged
  rollout)? Name the steps that cannot be undone and slow down only there.
- **Reshape first, change second.** If the code must be restructured to make the change easy, the
  restructuring and the behaviour change belong in separate commits.
- **Real or self-made complexity.** Is the plan solving the user's problem, or a problem the plan
  itself created?
- **Checkable assumptions.** If the plan rests on a guess about how the system behaves, and the
  guess can be checked in the code or at runtime, check it now.

## 4. Plan-smell checklist

For each item the plan touches, the plan must contain an answer.

| If the plan touches | The plan must say |
| --- | --- |
| A public URL, API shape or file format others depend on | How old clients and old links keep working |
| A data model with several variants | Whether every variant is handled, or only the common one |
| A schema, index or stored format | The safe order: add the new shape, move the data, then remove the old shape |
| A new endpoint | Who may call it and where that is enforced |
| A page that shows live data | How it stays fresh after an edit |
| New user-facing text | Where the text lives and which languages need it |
| A value saved through the interface | Every validation layer it passes, not only the form |
| Soft-deleted records with a unique key | How a deleted record stops blocking a new one |
| Encrypted or size-limited fields | The worst-case stored size, and what happens to old values |
| Configuration, secrets, infrastructure, dependencies, seed data | That these do not ship by merging code, and who applies them |

## 5. Test coverage map

Draw the critical paths against the project's own test levels. Use the levels the project really
has. A path with no test at any level becomes required work in the plan.

```
                         unit      integration    end to end
<critical path A>        yes       yes            gap
<critical path B>        yes       gap            yes
<critical path C>        gap       gap            gap     <- must not ship like this
```

## 6. Walk the failure cases

For each input the change will meet, say what happens: empty, missing, very large, duplicated,
wrong role, called twice, two callers at once, a failure halfway through.

## 7. Output

Lead with the recommendation, then the rest in this order.

```
Verdict: sound | fix first | rethink
Recommendation: <ship this cut, defer that, or do X instead>
1. Scope: ship first / defer / drop
2. Reuse: <existing code to use instead of building>
3. Blast radius and steps that cannot be undone
4. Test coverage map, gaps marked as required work
5. Not shipped by code: <configuration, schema, data, dependency steps>
6. Failure cases the plan must handle
Open question: <only if there is a real fork, with your recommended answer>
```

If the foundation is wrong, say "rethink" plainly. Do not squeeze a needed redesign into a small
patch, and do not inflate a small change into a redesign.
