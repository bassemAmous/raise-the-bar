// Shared helpers: hook input and output, config, git, and the record folder.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const CONFIG_FILE = "guardrails.config.json";

export const DEFAULTS = {
  // Branches that need a passed test run and a passed review before a push.
  protectedBranches: ["main", "master", "staging", "production", "prod", "release/*"],
  // Branches that also need a human approval for the exact commit.
  productionBranches: ["main", "master", "production", "prod"],
  // Regular expressions for commands that reach production (deploy CLIs, live databases).
  productionCommands: [],
  // A push that only touches these paths needs no test run and no review.
  ignorePaths: ["**/*.md", "docs/**", "LICENSE", ".gitignore"],
  tests: { required: true, command: null },
  review: { required: true },
  approval: { phrase: "approve production", maxAgeMinutes: 60 },
  secretScan: { enabled: true, allowPaths: [] },
  dangerGuard: { enabled: true },
  // What to do when the guard itself crashes: "allow" keeps you working, "deny" is stricter.
  onGuardError: "allow",
};

export function readStdin() {
  return new Promise((resolve) => {
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (text += chunk));
    process.stdin.on("end", () => resolve(text));
    process.stdin.on("error", () => resolve(text));
  });
}

/** Ends the hook with a decision. No output means "no opinion": the normal permission flow runs. */
export function decide(decision, reason) {
  if (decision !== "allow") {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: decision,
          permissionDecisionReason: reason,
        },
      }),
    );
  }
  process.exit(0);
}

export function git(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 15000,
  }).trim();
}

export function tryGit(args, cwd) {
  try {
    return git(args, cwd);
  } catch {
    return null;
  }
}

export const slash = (p) => String(p).split("\\").join("/");

export function repoRoot(cwd) {
  const root = tryGit(["rev-parse", "--show-toplevel"], cwd);
  return root ? slash(root) : null;
}

/** The record folder lives inside the git folder: never committed, shared by every worktree. */
export function stateDir(cwd) {
  const common = tryGit(["rev-parse", "--git-common-dir"], cwd);
  if (!common) return null;
  return slash(path.resolve(cwd, common, "guardrails"));
}

function findConfigFile(start) {
  let dir = path.resolve(start);
  for (let depth = 0; depth < 30; depth++) {
    for (const candidate of [CONFIG_FILE, path.join(".claude", CONFIG_FILE)]) {
      const file = path.join(dir, candidate);
      if (fs.existsSync(file)) return file;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

export function loadConfig(cwd) {
  const file = findConfigFile(cwd);
  let user = {};
  if (file) user = JSON.parse(fs.readFileSync(file, "utf8"));
  const config = { ...DEFAULTS, ...user };
  for (const key of ["tests", "review", "approval", "secretScan", "dangerGuard"]) {
    config[key] = { ...DEFAULTS[key], ...(user[key] ?? {}) };
  }
  config.file = file ? slash(file) : null;
  return config;
}

/** Glob with * (inside one path part) and ** (across parts). Enough for branch and path lists. */
export function globToRegExp(glob) {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === "*" && glob[i + 1] === "*") {
      out += glob[i + 2] === "/" ? "(?:.*/)?" : ".*";
      i += glob[i + 2] === "/" ? 2 : 1;
    } else if (ch === "*") out += "[^/]*";
    else if (ch === "?") out += "[^/]";
    else out += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

export const matchesAny = (value, globs) =>
  (globs ?? []).some((glob) => globToRegExp(glob).test(value));

export function treeOf(ref, cwd) {
  return tryGit(["rev-parse", "--verify", "--quiet", `${ref}^{tree}`], cwd);
}

export function commitOf(ref, cwd) {
  return tryGit(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], cwd);
}

export function appendAudit(dir, entry) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      path.join(dir, "audit.log"),
      `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`,
    );
  } catch {
    // The audit line is a record, not a gate: a read-only disk must not stop work.
  }
}
