// Reads `git push` commands: which commit goes to which branch, and how.
import path from "node:path";
import { commitOf, slash, tryGit } from "./core.mjs";

const SEGMENT_SPLIT = /&&|\|\||[;|\n\r]/;
const GIT_CALL = /^(?:.*?\s)?git((?:\s+-[cC]\s+\S+)*)\s+([a-z][a-z-]*)(?:\s+(.*))?$/s;
const OPTIONS_WITH_VALUE = new Set(["-o", "--push-option", "--repo", "--receive-pack", "--exec"]);
const UNREADABLE = /[$`]/;

const unquote = (word) => word.replace(/^(['"])(.*)\1$/, "$2");

function words(text) {
  return (text.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map(unquote);
}

function parseRefspec(spec, currentBranch) {
  const forced = spec.startsWith("+");
  const body = forced ? spec.slice(1) : spec;
  const colon = body.indexOf(":");
  let src = colon === -1 ? body : body.slice(0, colon);
  let dst = colon === -1 ? body : body.slice(colon + 1);
  const deletes = colon === 0;
  if (colon === -1 && (body === "HEAD" || body === "@")) dst = currentBranch ?? "HEAD";
  dst = dst.replace(/^refs\/heads\//, "");
  src = src.replace(/^refs\/heads\//, "");
  return { src: src || null, dst, forced, deletes };
}

/** Every git call in a shell command: [{ folder, verb, rest }], following `cd` and `git -C`. */
export function gitCalls(command, cwd) {
  const calls = [];
  let folder = cwd;
  for (const rawSegment of String(command).split(SEGMENT_SPLIT)) {
    const segment = rawSegment.trim();
    const cd = segment.match(/^cd\s+(.+)$/);
    if (cd) {
      folder = path.resolve(folder, unquote(cd[1].trim()));
      continue;
    }
    const match = segment.match(GIT_CALL);
    if (!match) continue;
    const dashC = match[1].match(/-C\s+(\S+)/);
    calls.push({
      folder: slash(dashC ? path.resolve(folder, unquote(dashC[1])) : folder),
      verb: match[2],
      rest: match[3] ?? "",
    });
  }
  return calls;
}

/**
 * Every push found in a shell command.
 * Each one: { folder, remote, force, noVerify, unreadable, targets: [{ src, dst, forced, deletes }] }
 */
export function pushesIn(command, cwd) {
  const pushes = [];
  for (const call of gitCalls(command, cwd)) {
    if (call.verb !== "push") continue;
    const pushFolder = call.folder;
    const args = words(call.rest);
    const positional = [];
    const push = {
      folder: slash(pushFolder),
      remote: null,
      force: false,
      noVerify: false,
      unreadable: false,
      all: false,
      targets: [],
    };
    let deleteMode = false;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith("-")) {
        if (OPTIONS_WITH_VALUE.has(arg)) i++;
        else if (arg === "-f" || arg.startsWith("--force")) push.force = true;
        else if (arg === "--no-verify") push.noVerify = true;
        else if (arg === "-d" || arg === "--delete") deleteMode = true;
        else if (arg === "--all" || arg === "--mirror" || arg === "--branches") push.all = true;
        continue;
      }
      positional.push(arg);
    }
    if (positional.some((word) => UNREADABLE.test(word))) push.unreadable = true;

    const currentBranch = tryGit(["rev-parse", "--abbrev-ref", "HEAD"], pushFolder);
    push.remote =
      positional[0] ??
      tryGit(["config", `branch.${currentBranch}.remote`], pushFolder) ??
      "origin";

    const specs = positional.slice(1);
    if (push.all) {
      const local = tryGit(["for-each-ref", "--format=%(refname:short)", "refs/heads"], pushFolder);
      for (const branch of (local ?? "").split("\n").filter(Boolean))
        push.targets.push({ src: branch, dst: branch, forced: false, deletes: false });
    } else if (specs.length === 0) {
      if (currentBranch && currentBranch !== "HEAD")
        push.targets.push({ src: "HEAD", dst: currentBranch, forced: false, deletes: false });
    } else {
      for (const spec of specs) {
        const target = parseRefspec(spec, currentBranch);
        if (deleteMode) target.deletes = true;
        push.targets.push(target);
      }
    }
    pushes.push(push);
  }
  return pushes;
}

/** The commit a target pushes, and the files that change on the remote branch because of it. */
export function resolveTarget(push, target) {
  if (target.deletes || !target.src) return null;
  const head = commitOf(target.src, push.folder);
  if (!head) return null;
  const base = commitOf(`refs/remotes/${push.remote}/${target.dst}`, push.folder);
  let changed = null; // null = unknown, treat everything as code
  if (base) {
    const names = tryGit(["diff", "--name-only", base, head], push.folder);
    if (names !== null) changed = names.split("\n").filter(Boolean);
  }
  return { head, base, changed };
}
