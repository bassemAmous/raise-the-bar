---
name: main-is-lava
description: Keeps the main checkout clean by doing every multi-file change, and every helper agent's work, in its own git worktree on its own branch, then promoting the result deliberately after review and tests. Also covers retiring a worktree without losing work and keeping scratch files out of the repository. Use before starting a feature or a multi-file fix, before spawning agents that edit code, and when the user says "use a worktree", "do this in isolation", "don't touch my working copy", "keep main clean", "work on a separate branch", "clean up the worktrees" or "why are there so many changed files". Not for a one-file edit or a read-only task. Formerly named "worktree-first", and still answers to that name.
---

# main-is-lava

A git worktree is a second working folder attached to the same repository, on its own branch. This
skill makes it the default place for real work. The main checkout stays clean, so the user's own
uncommitted edits are never mixed into a change, two sessions never overwrite each other, and a
bad attempt is removed by deleting a folder. Nothing reaches a shared branch by accident: changes
are promoted on purpose, after review and tests.

## When to use

- Before any change that touches more than one file: a feature, a fix, a refactor.
- Before starting helper agents that edit code. Each one gets its own worktree.
- Before removing a worktree, and when the main checkout has filled up with stray files.

## When not to use

- A single-file edit, such as a typo or one line of documentation, when nobody else is working in
  the checkout.
- Read-only work. Reading needs no isolation.
- The folder is not a git repository. Say so and ask how the user wants to isolate the work.

## Steps

1. **Check where you are.** Run `git status` and `git worktree list`. If the main checkout has
   uncommitted changes, leave them alone. They belong to the user or to another session.
2. **Find the base branch.** Use the branch the project integrates into. Read it from the
   project's contribution notes or from the remote's default (`git symbolic-ref
   refs/remotes/origin/HEAD`). Ask if it is not clear.
3. **Fetch, then create the worktree from the remote branch.** Base it on the remote copy, not
   the local one. A local branch can be behind or can hold commits that were never pushed, and a
   stale base means conflicts later.

   ```
   git fetch origin
   git worktree add --no-track <folder outside the repo>/<topic> -b <new-branch> origin/<base-branch>
   ```

   Put the folder outside the repository, for example a sibling directory, so the main checkout
   does not list it as untracked. `--no-track` stops the new branch from taking the base branch
   as its upstream. Without it, a later plain `git push` can aim at the base branch.
4. **Set it up as its own project.** Install dependencies inside the worktree with the project's
   own install command. Do not link the main checkout's dependency folder into it. A link makes
   tools resolve packages from the wrong tree, and a recursive delete can follow the link back
   into the main checkout. Copy local configuration files the app needs (ignored files are not
   carried over), and keep secrets out of commits. In a monorepo, check that path aliases and
   workspace links resolve to the worktree's own copy of each package, not the main checkout's:
   print the resolved path of one shared package once.
5. **Do all the work there.** If the session has Claude Code's own worktree tools
   (`EnterWorktree`, `ExitWorktree`), use them to move the session into the worktree. Otherwise
   name the folder in every command: `git -C <worktree> <command>`, or `cd <worktree> &&
   <command>` on one line. A shell can go back to its start folder after a command that ends
   outside the session's working folders. The next command then runs in the main checkout with
   no warning. For a test run used as proof, print the folder in the same command: `cd
   <worktree> && git rev-parse --show-toplevel && <test command>`. One session per folder. Keep
   screenshots, dumps and probe scripts in a scratch folder outside any repository, so the diff
   shows only the real change.
6. **Give each helper agent its own worktree.** If your agent tool has a worktree isolation
   option, use it. Otherwise create one worktree per agent and name it in the brief. Assign each
   file to one agent only. Each helper returns its branch name, its commits, and the commands it
   ran with their output. It does not merge anything.
7. **Review before promoting.** Read the full diff against the base (`git diff
   origin/<base-branch>...<new-branch>`). The reviewer must not be the author: for a helper's
   work that is you, and for your own work use a second agent such as
   `no-slop:readonly-reviewer` on anything weighty.
8. **Test the result that will land.** Fetch again, bring the branch up to date with the base,
   then run the project's checks in the worktree (type check or compile, lint, tests, found in
   `package.json`, a `Makefile`, `pyproject.toml` or the CI configuration). Tests that passed on
   an old base prove little about the merged result.
9. **Promote on purpose.** Use the project's normal route: a pull request, or a merge or
   cherry-pick the user asked for. Promote only the commits that were approved. If picking them
   drags unapproved work along, stop and say so. Run `no-yolo:you-shall-not-push` before any push,
   and follow the rules of your protected branches. If the no-yolo plugin is not installed,
   run the checks on the exact commit and have a reviewer who is not the author read the diff.
10. **Retire the worktree safely.** Only after its commits are merged, on a remote, or on a
    local branch that stays. Cleanup never pushes. Follow `references/retire-and-sync.md`: check
    that no commit and no ignored-but-unique file would be lost, then `git worktree remove
    <folder>` and `git worktree prune`.

**Stacked branches:** when one change waits on another, follow `references/branch-stack.md`.

## Output format

When the worktree is created:

```
Worktree: <folder>
Branch: <new-branch> from origin/<base-branch> at <short commit>
Main checkout: untouched (<clean | has the user's uncommitted changes, left as they are>)
Setup: <install command run, result>
```

When the work is ready to promote:

```
Branch: <new-branch>, <n> commits, up to date with origin/<base-branch> as of <fetch time>
Diff reviewed by: <who, not the author>
Checks: <each command and its result>
Promotion route: <pull request | merge | cherry-pick of <commits>> , waiting for: <the user's go | done>
Worktree: <kept, reason | removed after the retire checks>
```

## Hard rules

- Do not run destructive commands in the main checkout: `git reset --hard`, `git clean`,
  `git checkout -- <path>`, `git stash`. They can erase work that is not yours and cannot be
  brought back.
- To set work aside, make a temporary commit on your branch. The stash list is shared by every
  worktree of a repository, so a plain `git stash pop` can apply someone else's entry.
- Never delete the main repository folder to "start fresh". It holds the history for every
  linked worktree and every branch that was never pushed.
- Nothing is promoted without a reviewed diff, checks run on the up-to-date branch, and the
  user's go for that change.
- Never push a whole backlog branch to a protected branch when only part of it was approved.
- Before removing a worktree, check for unpushed commits and for ignored files that exist nowhere
  else.
- Fetch right before any comparison you act on. A result measured on old refs can be wrong.

## Common mistakes

- Basing the worktree on the local base branch without fetching first.
- Linking the dependency folder from the main checkout to save time.
- Two agents editing the same file from two worktrees.
- Testing in the main checkout instead of in the worktree that holds the change.
- Letting finished worktrees pile up until the disk is full.
- Writing screenshots and probe scripts into the repository, which buries the real diff.
- Trusting "the tree is clean" before removal, when `git status` does not list ignored files.
