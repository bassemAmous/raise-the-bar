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
  tests: { required: true, command: null, allowUntracked: false },
  review: { required: true },
  approval: { phrase: "approve production", maxAgeMinutes: 60 },
  secretScan: { enabled: true, allowPaths: [] },
  dangerGuard: { enabled: true },
  // What to do when the guard itself crashes on a line that cannot commit, push or deploy:
  // "allow" keeps you working, "deny" is stricter. A line that can is always refused.
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

const GIT_TIMEOUT_MS = 15000;

/** git did not answer in time. That is not an answer, so it is never read as "nothing to check". */
export class OutOfTime extends Error {
  constructor(args) {
    super(`git ${args.slice(0, 3).join(" ")} did not answer in time`);
    this.name = "OutOfTime";
  }
}

// A hook has a time limit, and a check that is cut off checked nothing. The hook sets one
// budget for all of its git calls, so it can refuse in time instead of being stopped half way.
let deadline = Infinity;
export function startTimeBudget(ms) {
  deadline = Date.now() + ms;
}

function runGit(args, options) {
  const left = deadline - Date.now();
  if (left <= 0) throw new OutOfTime(args);
  try {
    return execFileSync("git", args, { ...options, stdio: ["ignore", "pipe", "ignore"], timeout: Math.min(GIT_TIMEOUT_MS, left) });
  } catch (error) {
    if (error?.code === "ETIMEDOUT") throw new OutOfTime(args);
    throw error;
  }
}

export function git(args, cwd) {
  // A first commit or a lockfile is easily over Node's 1 MB default.
  return runGit(args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).trim();
}

/** The answer of git, or null when git says no. Running out of time is thrown, not hidden. */
export function tryGit(args, cwd) {
  try {
    return git(args, cwd);
  } catch (error) {
    if (error instanceof OutOfTime) throw error;
    return null;
  }
}

/** A file's content out of git, as bytes (it may not be text). null when git cannot give it. */
export function gitBytes(args, cwd) {
  try {
    return runGit(args, { cwd, maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    if (error instanceof OutOfTime) throw error;
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

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isStringList = (value) => Array.isArray(value) && value.every((item) => typeof item === "string");

/**
 * The config for a folder: the defaults, with the project's file on top.
 * It never throws. A file that cannot be used sets `config.error`, and the caller refuses
 * guarded commands until it is fixed: a broken config must not quietly switch the guard off.
 */
export function loadConfig(cwd) {
  const file = cwd ? findConfigFile(cwd) : null;
  const problems = [];
  let user = {};
  if (file) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
      if (isObject(parsed)) user = parsed;
      else problems.push("the file must hold one JSON object");
    } catch (error) {
      problems.push(`it is not valid JSON (${error.message})`);
    }
  }
  const config = { ...DEFAULTS, ...user };
  for (const key of ["tests", "review", "approval", "secretScan", "dangerGuard"]) {
    if (user[key] !== undefined && !isObject(user[key])) problems.push(`"${key}" must be an object`);
    config[key] = { ...DEFAULTS[key], ...(isObject(user[key]) ? user[key] : {}) };
  }
  for (const key of ["protectedBranches", "productionBranches", "productionCommands", "ignorePaths"]) {
    if (isStringList(config[key])) continue;
    problems.push(`"${key}" must be a list of strings`);
    config[key] = DEFAULTS[key];
  }
  if (!isStringList(config.secretScan.allowPaths)) {
    problems.push('"secretScan.allowPaths" must be a list of strings');
    config.secretScan.allowPaths = [];
  }
  config.productionCommands = config.productionCommands.filter((source) => {
    try {
      new RegExp(source, "i");
      return true;
    } catch (error) {
      problems.push(`productionCommands has a pattern that does not compile: ${source} (${error.message})`);
      return false;
    }
  });
  if (typeof config.approval.phrase !== "string" || !config.approval.phrase.trim()) {
    problems.push('"approval.phrase" must be a non-empty string');
    config.approval.phrase = DEFAULTS.approval.phrase;
  }
  if (!(Number(config.approval.maxAgeMinutes) > 0)) {
    problems.push('"approval.maxAgeMinutes" must be a number above 0');
    config.approval.maxAgeMinutes = DEFAULTS.approval.maxAgeMinutes;
  }
  // A switch written as "false" (a string) is true to JavaScript. It must not flip a check by accident.
  for (const [section, key] of [
    ["tests", "required"],
    ["tests", "allowUntracked"],
    ["review", "required"],
    ["secretScan", "enabled"],
    ["dangerGuard", "enabled"],
  ]) {
    if (typeof config[section][key] === "boolean") continue;
    problems.push(`"${section}.${key}" must be true or false`);
    config[section][key] = DEFAULTS[section][key];
  }
  if (config.tests.command !== null && (typeof config.tests.command !== "string" || !config.tests.command.trim())) {
    problems.push('"tests.command" must be a command as text, or null');
    config.tests.command = null;
  }
  if (config.onGuardError !== "allow" && config.onGuardError !== "deny") {
    problems.push('"onGuardError" must be "allow" or "deny"');
    config.onGuardError = DEFAULTS.onGuardError;
  }
  config.file = file ? slash(file) : null;
  config.error = problems.length ? problems.join("; ") : null;
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
