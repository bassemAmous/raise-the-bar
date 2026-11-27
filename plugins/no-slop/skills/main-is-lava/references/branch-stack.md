# Branch stacks

A stack is a chain of branches where each one builds on the one before: `parser` is based on
`main`, `export` on `parser`, `export-ui` on `export`. It lets a reviewer read one small change at
a time while the next one is already being built.

## Build the stack

1. One worktree per branch, each created from the branch below it:
   `git worktree add --no-track <folder>/export -b export parser`.
2. Each pull request targets the branch below it, not `main`. The reviewer then sees only that
   step's diff.
3. Keep a short list at the top of each pull request: the whole stack in order, this one marked.

## When a lower branch changes

A review fix on `parser` must reach every branch above it.

1. Commit the fix on `parser`.
2. In each branch above, in order from the bottom: `git rebase --onto parser <old parser tip>
   export`. Note the old tip before the fix (`git rev-parse parser`), because a plain rebase can
   replay commits that are already below.
3. Run the checks in each worktree after its rebase. A rebase that applied cleanly can still
   break the build.
4. Push each rebased branch with `--force-with-lease`, never a plain force, and only branches
   that are yours.

## When the bottom merges

1. Fetch. Rebase the next branch onto the base: `git rebase --onto origin/main <old parser tip>
   export`.
2. Point its pull request at `main`.
3. Retire the merged branch's worktree with the steps in `retire-and-sync.md`.

## Rules

- Never merge a branch from the middle of a stack before the ones below it.
- Never move work between branches with `git stash`: the stash is shared by every worktree. Use
  a commit on the branch it belongs to.
- A stack deeper than three or four branches is hard to review. Merge the bottom first.
