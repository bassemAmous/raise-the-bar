// Reads `git push` commands: which commit goes to which branch, and how.
import fs from "node:fs";
import { commitOf, tryGit } from "./core.mjs";
import { callsIn, gitCall } from "./shell.mjs";

const OPTIONS_WITH_VALUE = new Set(["-o", "--push-option", "--repo", "--receive-pack", "--exec"]);
const UNREADABLE = /[$`%]/;
// Two common ways to write "the branch I am on". They are read as that, not as a variable.
const CURRENT_BRANCH = /^\$\(\s*git\s+(?:branch\s+--show-current|rev-parse\s+--abbrev-ref\s+HEAD|symbolic-ref\s+--short\s+HEAD)\s*\)$/;

/** Every git call in a shell command: [{ folder, verb, args, globals, call }], following `cd` and `git -C`. */
export function gitCalls(command, cwd, options) {
  return callsIn(command, cwd, options).map(gitCall).filter(Boolean);
}

const branchName = (ref) => ref.replace(/^refs\/heads\//, "").replace(/^heads\//, "");

/** `remoteName` gives the branch a bare local name lands on (it differs with push.default=upstream). */
function parseRefspec(spec, currentBranch, remoteName) {
  const forced = spec.startsWith("+");
  const body = forced ? spec.slice(1) : spec;
  const colon = body.indexOf(":");
  const src = colon === -1 ? body : body.slice(0, colon);
  let dst = colon === -1 ? body : body.slice(colon + 1);
  const deletes = colon === 0;
  if (colon === -1 && (body === "HEAD" || body === "@")) dst = currentBranch ?? "HEAD";
  else if (colon === -1) dst = remoteName(branchName(body));
  if (colon > 0 && dst === "") dst = src; // "main:" pushes to the branch of the same name
  return { src: branchName(src) || null, dst: branchName(dst), forced, deletes };
}

const lines = (text) => (text ?? "").split("\n").filter(Boolean);

/**
 * What one `git push` call does:
 * { folder, remote, force, dryRun, unreadable, implicit, landsOn, targets: [{ src, dst, forced, deletes }] }
 * `implicit` is true when the command leaves the branch to git, which picks the current one.
 * `landsOn(branch)` names the remote branch a local branch is pushed to when none is written.
 * When the folder is not a repository that can be read, `targets` stays empty.
 */
export function readPush(git) {
  const folder = git.folder;
  const push = {
    folder,
    remote: null,
    force: false,
    dryRun: false,
    unreadable: false,
    implicit: false,
    landsOn: (branch) => branch,
    targets: [],
  };
  const positional = [];
  let all = false;
  let deleteMode = false;
  let tagsOnly = false;
  let prune = false;
  let repoOption = null;
  for (let i = 0; i < git.args.length; i++) {
    const arg = git.args[i];
    if (arg === "--") {
      positional.push(...git.args.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      if (arg === "--repo") repoOption = git.args[++i] ?? null;
      else if (arg.startsWith("--repo=")) repoOption = arg.slice(7);
      else if (OPTIONS_WITH_VALUE.has(arg)) i++;
      else if (arg.startsWith("--force")) push.force = true;
      else if (arg === "--mirror") push.force = all = prune = true;
      else if (arg === "--prune") prune = true;
      else if (arg === "--dry-run") push.dryRun = true;
      else if (arg === "--delete") deleteMode = true;
      else if (arg === "--all" || arg === "--branches") all = true;
      else if (arg === "--tags") tagsOnly = true;
      continue;
    }
    if (arg.startsWith("-") && arg.length > 1) {
      // Short flags can be grouped: -fu is --force with --set-upstream. After -o comes a value:
      // -on is the push option "n", not a dry run.
      for (let k = 1; k < arg.length; k++) {
        if (arg[k] === "o") {
          if (k === arg.length - 1) i++;
          break;
        }
        if (arg[k] === "f") push.force = true;
        else if (arg[k] === "d") deleteMode = true;
        else if (arg[k] === "n") push.dryRun = true;
      }
      continue;
    }
    positional.push(arg);
  }
  if (positional.some((word, index) => UNREADABLE.test(word) && !(index > 0 && CURRENT_BRANCH.test(word))))
    push.unreadable = true;
  if (folder === null || !fs.existsSync(folder)) return push;
  if (tryGit(["rev-parse", "--git-dir"], folder) === null) return push;

  const currentBranch = tryGit(["symbolic-ref", "--short", "-q", "HEAD"], folder);
  // A setting written on the line (git -c key=value push) wins over the one in the config files.
  const inline = (key) =>
    git.globals
      .filter((setting) => setting.toLowerCase().startsWith(`${key.toLowerCase()}=`))
      .map((setting) => setting.slice(key.length + 1));
  const configured = (key) => inline(key).pop() ?? tryGit(["config", key], folder);
  push.remote =
    positional[0] ??
    repoOption ??
    (currentBranch && configured(`branch.${currentBranch}.pushRemote`)) ??
    configured("remote.pushDefault") ??
    (currentBranch && configured(`branch.${currentBranch}.remote`)) ??
    "origin";

  let pushDefault; // read once, and only when a push needs it
  const mode = () => (pushDefault ??= configured("push.default") ?? "simple");
  // With push.default=upstream, `git push origin hotfix` lands on the branch hotfix follows.
  const remoteName = (branch) => {
    if (mode() !== "upstream" && mode() !== "tracking") return branch;
    const follows = lines(tryGit(["config", "--get-all", `branch.${branch}.merge`], folder));
    return follows.length === 1 ? branchName(follows[0]) : branch;
  };

  push.landsOn = remoteName;

  const localBranches = () => lines(tryGit(["for-each-ref", "--format=%(refname:short)", "refs/heads"], folder));
  const specs = [];
  let matching = false;
  let current = false; // the line names "the branch I am on"
  for (let i = 1; i < positional.length; i++) {
    if (positional[i] === "tag") {
      i++; // "tag v1.2" pushes a tag, not a branch
      tagsOnly = true;
    } else if (CURRENT_BRANCH.test(positional[i])) current = true;
    else if (positional[i] === ":" || positional[i] === "+:" || positional[i].includes("*")) {
      matching = true;
      if (positional[i].startsWith("+")) push.force = true;
    } else if (positional[i].includes(",")) {
      // PowerShell hands `main,feature/x` to git as two branches. Read both ways: the stricter one wins.
      specs.push(positional[i], ...positional[i].split(",").filter(Boolean));
    } else specs.push(positional[i]);
  }

  let bare = !all && !matching && !current && specs.length === 0 && !tagsOnly;
  if (bare) {
    // remote.<name>.push names what a push with no branch sends: `HEAD:main` there turns a plain `git push` into a push to main.
    const key = `remote.${push.remote}.push`;
    const preset = [...lines(tryGit(["config", "--get-all", key], folder)), ...inline(key)];
    for (const spec of preset) {
      if (spec === ":" || spec === "+:" || spec.includes("*")) matching = true;
      else specs.push(spec);
      if (spec.startsWith("+")) push.force = true;
    }
    if (preset.length) bare = false;
  }
  if (bare && mode() === "matching") matching = true; // every local branch that has a twin on the remote
  if (all || matching) {
    for (const branch of localBranches()) push.targets.push({ src: branch, dst: branch, forced: false, deletes: false });
  }
  for (const spec of specs) {
    const target = parseRefspec(spec, currentBranch, remoteName);
    if (deleteMode) target.deletes = true;
    push.targets.push(target);
  }
  if (current || (bare && !matching)) {
    push.implicit = true;
    if (currentBranch) {
      // With push.default=upstream the branch on the remote can have another name.
      const upstream = current ? null : tryGit(["rev-parse", "--abbrev-ref", "@{push}"], folder);
      const prefix = `${push.remote}/`;
      const dst = upstream?.startsWith(prefix) ? upstream.slice(prefix.length) : currentBranch;
      push.targets.push({ src: "HEAD", dst, forced: false, deletes: false });
    }
  }
  if (prune) {
    // --prune and --mirror delete the remote branches that have no local twin.
    const local = new Set(localBranches());
    const prefix = `${push.remote}/`;
    for (const ref of lines(tryGit(["for-each-ref", "--format=%(refname:short)", `refs/remotes/${push.remote}`], folder))) {
      const name = ref.startsWith(prefix) ? ref.slice(prefix.length) : ref;
      if (name !== "HEAD" && name !== push.remote && !local.has(name))
        push.targets.push({ src: null, dst: name, forced: false, deletes: true });
    }
  }
  return push;
}

/** Every push found in a shell command. */
export function pushesIn(command, cwd, options) {
  return gitCalls(command, cwd, options)
    .filter((git) => git.verb === "push")
    .map(readPush);
}

/**
 * The commit a target pushes, and the files that change on the remote branch because of it.
 * { head, base, changed }: head is null when the commit cannot be found; changed is null when
 * the files are not known (treat everything as code).
 */
export function resolveTarget(push, target) {
  if (target.deletes || !target.src) return null;
  const head = commitOf(target.src, push.folder);
  if (!head) return { head: null, base: null, changed: null };
  const base = commitOf(`refs/remotes/${push.remote}/${target.dst}`, push.folder);
  let changed = null;
  if (base) {
    const names = tryGit(["-c", "core.quotePath=false", "diff", "--name-only", "--no-renames", base, head], push.folder);
    if (names !== null) changed = lines(names);
  }
  return { head, base, changed };
}
