# Retiring worktrees, syncing the main checkout, and scratch files

## Retire a worktree without losing work

A worktree is finished when its change has been promoted, or abandoned on purpose. Before removing
it, run these checks. Each one guards against a loss that a plain "is it clean" check misses.

First check that nobody is using it. Run `git worktree list --porcelain` and skip every worktree
marked `locked`. For a worktree this session did not create, ask the user whether another session
still works there.

1. **Every commit is on a remote or on a branch that stays.**

   ```
   git -C <worktree> rev-list --count HEAD --not --remotes
   ```

   A result of `0` means every commit is on a remote. If it is not `0`, the commits are on this
   machine only. Removing a worktree keeps its branch, so no push is needed. Check that the
   branch still exists: `git -C <worktree> branch --show-current` must print a name. If it prints
   nothing, the worktree is on no branch, so create one first (`git -C <worktree> branch
   <name>`). Cleanup never pushes. If the work must leave the machine, ask the user.
2. **No uncommitted work.** `git -C <worktree> status --porcelain` must be empty.
3. **No ignored file that exists only here.** `git status` does not list ignored files, and
   removing the worktree deletes them with it. List them:

   ```
   git -C <worktree> status --porcelain --ignored
   ```

   Set aside what can be rebuilt (dependency folders, build output, caches). For everything else,
   such as local configuration, notes or a report, confirm that a copy exists elsewhere or move it
   out first.
4. **No directory links.** If a symlink or a Windows junction inside the worktree points into
   another tree, remove the link itself first. A recursive delete can follow a link and empty the
   folder it points to. After the removal, check that the target folder still has its contents:
   count its entries, do not only test that it exists.
5. **Remove, then verify.**

   ```
   git worktree remove <worktree>
   git worktree prune
   git worktree list
   ```

   If the removal failed halfway, the folder can remain on disk while git no longer lists it.
   Compare the folders on disk with `git worktree list` and recheck any leftover against steps 1
   to 3 before deleting it by hand.

A worktree with unmerged commits on its own branch is work in progress, not rubbish. Ask before
removing it.

## The main checkout goes stale

When all work happens in worktrees, nothing moves the main checkout forward. After a while it is
far behind the remote. That is expected, and it has two consequences.

**Do not delete it and clone again.** The main repository folder is the single store for every
linked worktree and for every local branch that was never pushed. Deleting it orphans the
worktrees and loses those branches. It also destroys ignored local files, such as local
configuration, that have no other copy. Update it instead:

```
git -C <repo> fetch origin
git -C <repo> branch backup/pre-sync-<date> <base-branch>
git -C <repo> status --porcelain
```

If there are local changes, they belong to someone. Ask before moving them. If there are none,
check which branch is checked out: `git -C <repo> branch --show-current` must print
`<base-branch>`. The merge moves whatever branch is checked out, so on another branch, stop and
ask. Then fast-forward with `git -C <repo> merge --ff-only --no-overwrite-ignore
origin/<base-branch>`. Without `--no-overwrite-ignore`, git replaces an ignored local file with
no warning when the update brings a tracked file at the same path, and `git status` does not list
ignored files. If the update stops because untracked or ignored files would be overwritten, do
not force it. Compare each blocking file with the incoming version (`git hash-object <file>`
against `git rev-parse origin/<base-branch>:<file>`). If they are identical, the local copy is a
leftover. If they differ, copy the local file outside the repository before deciding.

**A stale checkout gives wrong answers.** A comparison such as "what differs between these two
branches" is true only at the moment of the fetch. Fetch right before any measurement you will act
on, and measure again right before you decide. Treat a surprising "nothing differs" as a stale-ref
problem until a fresh fetch confirms it. Test the comparison on a control first: run it without
the path filter. If that is empty too, the refs or the paths are wrong, not the tree. Before using
any second checkout as a reference, confirm which commit it is on.

## Scratch files stay out of the repository

Screenshots, saved pages, response dumps and one-off scripts are made to prove something once. If
they pile up in the working tree, the list of changes becomes too long to read, and that list is
how an accidental edit to real code gets noticed.

- Write them to a scratch folder outside the repository by default.
- If one must live in the repository, add its kind to `.gitignore` in the same step, while you
  still know what it is.
- Ignore the kind, not the file: `/capture-*.png`, not `capture-3.png`.
- Start root-only rules with `/`. `/*.png` matches images at the top level. A bare `*.png` would
  also hide real product images deeper in the tree.
- `.gitignore` affects only untracked files. A new rule never removes a tracked file from version
  control and never hides changes to one.
- A file that the next person must read (a decision, a runbook, an incident record) does not
  belong in an ignored folder. An ignored file exists on one machine only.

Before deleting old scratch files, prove the rule matches only what you expect. Copy the files
outside the repository, then check each one with `git check-ignore -q "<file>"`. The number of
matches must equal the number of files you plan to delete. If a file does not match, the rule is
wrong. Do not delete that file.
