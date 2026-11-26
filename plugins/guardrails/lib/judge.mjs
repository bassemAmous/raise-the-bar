// The decisions. Pure enough to test: a command or a file path goes in, a verdict comes out.
//
// One fact shapes this file: the hook runs BEFORE the command. So it can only judge the state
// it can see now. Where a command line would change that state first (commit, then push), the
// guard does not guess. It asks for the risky step to be sent as its own command.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { approvalFor } from "./approval.mjs";
import { CONFIG_FILE, commitOf, loadConfig, matchesAny, repoRoot, slash, stateDir, tryGit } from "./core.mjs";
import { dangerIn } from "./danger.mjs";
import { readPush, resolveTarget } from "./push.mjs";
import { readRecord } from "./records.mjs";
import { scanCommit } from "./secrets.mjs";
import { TEXT_PROGRAMS, callsIn, gitCall, programOf, readCommit, resolveFolder, writesTo } from "./shell.mjs";

const PLUGIN_ROOT = slash(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
const CLI = `node "${PLUGIN_ROOT}/cli.mjs"`;

const ALLOW = { decision: "allow" };
const deny = (lines) => ({ decision: "deny", reason: lines.join("\n") });
const ask = (lines) => ({ decision: "ask", reason: lines.join("\n") });

export function detectTestCommand(root) {
  const has = (name) => fs.existsSync(path.join(root, name));
  const windows = process.platform === "win32";
  if (has("package.json")) {
    try {
      const script = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts?.test;
      if (script && !/no test specified/.test(script)) {
        if (has("pnpm-lock.yaml")) return "pnpm test";
        if (has("yarn.lock")) return "yarn test";
        if (has("bun.lockb") || has("bun.lock")) return "bun test";
        return "npm test";
      }
    } catch {
      // An unreadable package.json is not a reason to guess a command.
    }
  }
  if (has("Makefile") && /^test:/m.test(fs.readFileSync(path.join(root, "Makefile"), "utf8"))) return "make test";
  if (has("go.mod")) return "go test ./...";
  if (has("Cargo.toml")) return "cargo test";
  if (has("pytest.ini") || has("tox.ini") || (has("pyproject.toml") && has("tests")))
    return windows ? "python -m pytest" : "python3 -m pytest";
  if (has("gradlew")) return windows ? "gradlew.bat test" : "./gradlew test";
  if (has("pom.xml")) return "mvn -q test";
  return null;
}

export function testCommandFor(config, root) {
  return config.tests.command ?? detectTestCommand(root);
}

const short = (sha) => sha.slice(0, 8);

// ---------------------------------------------------------------------------------------------
// Self-protection: the approval, the records, the session log and the config.

// The record folder is "guardrails" inside the git folder (also for submodules and worktrees).
const RECORD_FOLDER = /(?:^|[^\w.-])\.git[\\/](?:[^\s"']*[\\/])?guardrails(?:[\\/"']|$)/;
// The session log is where a typed approval is read from, so the agent may read it, not write it.
const SESSION_LOG = /[\\/]\.claude[\\/]+projects[\\/][^\s"']*\.jsonl\b/;

// Programs that only read the files they are given.
const READERS = new Set([
  "cat", "type", "less", "more", "head", "tail", "grep", "egrep", "fgrep", "rg", "bat", "wc", "ls", "dir", "stat",
  "file", "jq", "diff", "cmp", "du", "sort", "uniq", "cut", "echo", "printf", "test", "[", "get-content", "gc",
  "select-string", "sls", "get-childitem", "gci", "get-item", "gi", "test-path", "findstr", "write-host",
  "write-output", "md5sum", "sha256sum",
]);
const COPIERS = new Set(["cp", "copy", "copy-item", "cpi", "scp", "rsync"]);
const GIT_READ_VERBS = new Set([
  "add", "diff", "log", "show", "status", "blame", "commit", "grep", "ls-files", "check-ignore", "cat-file", "push",
  "fetch", "rev-parse",
]);

function touchesSessionLog(text, transcriptPath) {
  if (SESSION_LOG.test(text)) return true;
  const name = transcriptPath ? path.posix.basename(slash(transcriptPath)) : "";
  return name.length > 8 && text.includes(name);
}

/** Which protected thing a word names: "record", "log", "config" or null. */
function kindOf(text, call, context) {
  const plain = slash(text);
  if (RECORD_FOLDER.test(plain)) return "record";
  if (plain.includes("guardrails") && call.folder) {
    // A git folder can live somewhere else. Compare with the real record folder.
    const records = context.stateDir(call.folder);
    const full = resolveFolder(call.folder, text);
    const same = (a, b) => (process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b);
    if (records && full && (same(full, records) || same(full.slice(0, records.length + 1), `${records}/`))) return "record";
  }
  if (touchesSessionLog(text, context.transcriptPath)) return "log";
  if (plain.includes(CONFIG_FILE)) return "config";
  return null;
}

/** True when the call can only read the file named by this argument. */
function onlyReads(call, arg) {
  if (call.program === "git") {
    const git = gitCall(call);
    return !git || GIT_READ_VERBS.has(git.verb);
  }
  if (READERS.has(call.program)) return true;
  if (COPIERS.has(call.program)) {
    const named = call.args.filter((word) => !word.startsWith("-"));
    return named[named.length - 1] !== arg; // the file is copied from, not written to
  }
  return false;
}

const isGuardrailsCli = (word) =>
  programOf(word) === "guardrails" || (path.posix.basename(slash(word)) === "cli.mjs" && /guardrails/i.test(slash(word)));

function runsApprove(call) {
  if (isGuardrailsCli(call.word0)) return call.args[0] === "approve";
  if (TEXT_PROGRAMS.has(call.program) || call.program === "git") return false; // text about the command
  if (call.args.some((word, index) => isGuardrailsCli(word) && call.args[index + 1] === "approve")) return true;
  // A runner handed the whole command as one quoted word: script -c "guardrails approve".
  return call.args.some(
    (arg) => /\s/.test(arg) && callsIn(arg, null).some((inner) => isGuardrailsCli(inner.word0) && inner.args[0] === "approve"),
  );
}

function judgeSelfProtection(calls, context) {
  let question = null;
  for (const call of calls) {
    if (runsApprove(call))
      return deny([
        "BLOCKED by guardrails: the approval is the one step an agent may not do.",
        "Stop here and ask the human to approve. Tell them the exact line to type in the chat.",
      ]);
    const written = [
      ...call.redirects.filter(writesTo).map((redirect) => redirect.target),
      ...call.args.filter((arg) => !onlyReads(call, arg)),
    ];
    for (const text of written) {
      const kind = kindOf(text, call, context);
      if (kind === "record")
        return deny([
          "BLOCKED by guardrails: the record folder is written only by the guardrails command.",
          `To see what is on record, run: guardrails status   (or: ${CLI} status)`,
        ]);
      if (kind === "log")
        return deny([
          "BLOCKED by guardrails: the session log is the record of what the human typed.",
          "An agent may read it. It is never written or changed by a command.",
        ]);
      if (kind === "config")
        question ??= ask([
          `This command changes ${CONFIG_FILE}, the file that sets what the guardrails protect.`,
          "A human should confirm a change to it.",
        ]);
    }
  }
  return question;
}

// ---------------------------------------------------------------------------------------------
// Commits and pushes.

// git commands that leave the staged files as they are.
const KEEPS_INDEX = new Set([
  "status", "diff", "log", "show", "branch", "fetch", "config", "rev-parse", "remote", "tag", "describe", "ls-files",
  "blame", "grep", "shortlog", "commit", "push", "symbolic-ref", "cat-file", "check-ignore",
]);
// git commands that leave every commit and every branch where it is.
const KEEPS_HISTORY = new Set([
  "status", "diff", "log", "show", "fetch", "config", "rev-parse", "remote", "tag", "describe", "ls-files", "blame",
  "grep", "shortlog", "add", "push", "cat-file", "check-ignore",
]);
// git commands after which the current branch can be another one.
const SWITCHERS = new Set(["checkout", "switch", "init", "clone", "branch", "symbolic-ref", "worktree", "rebase", "bisect"]);
// Programs that cannot make a commit or change a file (when they have no redirect to a file).
const HARMLESS = new Set([
  "cd", "echo", "printf", "true", "false", "test", "[", "ls", "dir", "pwd", "cat", "type", "head", "tail", "grep",
  "egrep", "rg", "wc", "sleep", "date", "which", "where", "export", "set", "read", "stat", "jq", "diff", "sort",
  "uniq", "cut", "tr", "write-host", "write-output", "get-content", "select-string", "get-childitem", "test-path",
  "clear", "wait", ":", "exit", "return",
]);
// Programs that are known to write files.
const FILE_WRITERS = new Set([
  "tee", "cp", "mv", "curl", "wget", "unzip", "tar", "dd", "install", "ln", "touch", "patch", "out-file",
  "set-content", "add-content", "copy-item", "move-item", "new-item", "invoke-webrequest", "iwr", "expand-archive",
]);

const isHarmless = (call) => {
  if (call.redirects.some(writesTo)) return false;
  if (call.program === "git") {
    const git = gitCall(call);
    return !git || (KEEPS_INDEX.has(git.verb) && git.verb !== "commit" && git.verb !== "push");
  }
  return HARMLESS.has(call.program);
};

const writesFiles = (call) =>
  call.redirects.some(writesTo) ||
  FILE_WRITERS.has(call.program) ||
  (call.program === "sed" && call.args.some((arg) => /^-[a-zA-Z]*i/.test(arg) || arg.startsWith("--in-place")));

/** The branch a `git checkout` or `git switch` lands on, when the command line says it. */
function branchAfter(git) {
  if ((git.verb !== "checkout" && git.verb !== "switch") || git.args.includes("--")) return null;
  const create = git.args.findIndex((arg) => /^-[bBcC]$/.test(arg) || arg === "--create" || arg === "--force-create");
  if (create !== -1) return git.args[create + 1] ?? null;
  const named = git.args.filter((arg) => !arg.startsWith("-"));
  return named.length === 1 ? named[0] : null;
}

const brokenConfig = (config) =>
  deny([
    `BLOCKED by guardrails: ${config.file ?? CONFIG_FILE} has a problem, so the rules cannot be trusted:`,
    `  ${config.error}`,
    "Fix the file (a human confirms the edit), then send the command again.",
  ]);

/**
 * Is the folder of this git call a repository the guard can read?
 * Returns a verdict to stop with, "skip" when git itself will fail there, or null to go on.
 */
function locate(git, state, what, context) {
  if (git.folder === null || !fs.existsSync(git.folder))
    return deny([
      `BLOCKED by guardrails: the guard cannot tell which folder this ${what} runs in.`,
      "The line gets there through a variable, or a path that does not exist here.",
      `Write the folder itself: git -C <folder> ${what} ...   or: cd <folder>, then the ${what} as its own command.`,
    ]);
  if (context.isRepo(git.folder)) return null;
  if (!state.created) return "skip";
  return deny([
    `BLOCKED by guardrails: this line creates a repository and runs a ${what} in it.`,
    `The guard reads the repository before the line runs, and there is none yet. Send the ${what} as its own command.`,
  ]);
}

function judgeCommit(git, state, context) {
  const commit = readCommit(git.args);
  if (commit.dryRun) return null;
  const where = locate(git, state, "commit", context);
  if (where) return where === "skip" ? null : where;
  const config = context.config(git.folder);
  if (config.error) return brokenConfig(config);
  if (!config.secretScan.enabled) return null;

  if (state.wrote)
    return deny([
      `BLOCKED by guardrails: this line writes a file (${state.wrote}) and commits on the same line.`,
      "The secret scan reads what a commit adds before the line runs, so it cannot see a file",
      "that the same line creates. Run the first part, then the commit as its own command.",
    ]);

  // -a, named paths or an earlier `git add` mean the commit takes more than what is staged now.
  const tree = commit.all || commit.paths.length > 0 || state.indexTouched;
  const result = context.scan(git.folder, tree, state.adds);
  if (result.error)
    return deny([
      "BLOCKED by guardrails: the secret scan could not read what this commit adds.",
      `  ${result.error}`,
      "A commit that cannot be checked is not let through. Fix the cause, or commit in smaller parts.",
    ]);
  const { findings, files } = result;
  if (findings.length === 0 && files.length === 0) return null;
  const lines = ["BLOCKED by guardrails: this commit would put a secret into git history.", ""];
  for (const file of files) lines.push(`  ${file}: a secrets file should not be committed`);
  for (const finding of findings.slice(0, 12))
    lines.push(`  ${finding.file}:${finding.line}  ${finding.rule}  ${finding.shown}`);
  if (findings.length > 12) lines.push(`  ... and ${findings.length - 12} more`);
  lines.push(
    "",
    "Take the value out of the code and read it from the environment or a secrets store.",
    "If the key was real, it must also be rotated: a secret that reached a commit is burned.",
    "A false positive (a test fixture, a public example): add the comment",
    "  guardrails:allow-secret",
    `on that line, or list the path under secretScan.allowPaths in ${CONFIG_FILE}.`,
  );
  return deny(lines);
}

function judgePush(git, state, context) {
  const push = readPush(git);
  if (push.dryRun) return null;
  const where = locate(git, state, "push", context);
  if (where) return where === "skip" ? null : where;
  const config = context.config(push.folder);
  if (config.error) return brokenConfig(config);
  const guarded = [...config.protectedBranches, ...config.productionBranches];

  if (push.unreadable)
    return deny([
      "BLOCKED by guardrails: this push names its branch or commit through a shell variable,",
      "so the guard cannot see where it goes. Write the branch and the commit id themselves,",
      "for example: git push origin 3f2a9c1e:staging",
    ]);

  const targets = [...push.targets];
  if (push.implicit && state.switched) {
    if (!state.branch)
      return deny([
        `BLOCKED by guardrails: this line runs \`${state.switched}\` and then pushes without naming a branch,`,
        "so the guard cannot tell where the push goes.",
        "Name it: git push origin HEAD:<branch>   or send the push as its own command.",
      ]);
    targets.push({ src: "HEAD", dst: state.branch, forced: false, deletes: false });
  }

  for (const target of targets) {
    if (!matchesAny(target.dst, guarded)) continue;

    if (push.force || target.forced || target.deletes)
      return deny([
        `BLOCKED by guardrails: this would rewrite or delete the protected branch "${target.dst}".`,
        "History on a protected branch only moves forward. Push a new commit that fixes or reverts.",
        "A human who really means it can run the command in their own terminal.",
      ]);

    if (state.moved)
      return deny([
        `BLOCKED by guardrails: a push to the protected branch "${target.dst}" is sent as its own command.`,
        `On this line \`${state.moved}\` runs first, so the guard would judge code that does not exist yet.`,
        "Run the first part. Then send the push alone.",
      ]);

    const resolved = resolveTarget(push, target);
    if (!resolved) continue;
    if (!resolved.head)
      return deny([
        `BLOCKED by guardrails: cannot find the commit "${target.src}" that this push sends to "${target.dst}".`,
        "Name a branch or a commit id that exists in this repository.",
      ]);
    const { head, base, changed } = resolved;
    if (head === base) continue; // the remote branch already has this commit
    const root = repoRoot(push.folder) ?? push.folder;
    const codeChanged = changed === null || changed.some((file) => !matchesAny(file, config.ignorePaths));
    const production = matchesAny(target.dst, config.productionBranches);
    const testCommand = testCommandFor(config, root);

    const gate = (required, kind, extra) => {
      if (!required) return "not required (switched off in the config)";
      if (!codeChanged) return "not required (docs only)";
      if (extra) return extra;
      return readRecord(push.folder, kind, head) ? "yes" : "NO";
    };
    const tests = gate(config.tests.required, "tests", testCommand ? null : "not required (no test command found)");
    const review = gate(config.review.required, "review", null);
    const approval = !production
      ? null
      : approvalFor({ cwd: push.folder, head, transcriptPath: context.transcriptPath, config })
        ? "yes"
        : "NO";
    if (tests !== "NO" && review !== "NO" && approval !== "NO") continue;

    const lines = [
      `BLOCKED by guardrails: commit ${short(head)} is not ready for "${target.dst}".`,
      "",
      `  tests passed for this exact code: ${tests}`,
      `  review passed for this exact code: ${review}`,
    ];
    if (production) lines.push(`  approved by a human: ${approval}`);
    lines.push("", `Do these in order, from ${push.folder}:`);
    let step = 1;
    if (tests === "NO")
      lines.push(
        `  ${step++}. Run the tests through the guard, so the pass is on record:`,
        `       guardrails test        (or: ${CLI} test)`,
        "     Red: fix, commit, run it again. Tests run any other way leave no record.",
      );
    if (review === "NO")
      lines.push(
        `  ${step++}. Run the skill guardrails:push-review. A read-only reviewer reads the diff,`,
        "     and the pass is recorded with:  guardrails review-stamp --report <file>",
        "     Test before you review: a fix after the review means a second review.",
      );
    if (approval === "NO")
      lines.push(
        `  ${step++}. Production is locked until a human approves this commit. You cannot do this step.`,
        "     Stop, say what will ship, and ask the human to type this line in the chat, alone on its line:",
        `       ${config.approval.phrase} ${short(head)}`,
      );
    lines.push("", "Then send this exact push again, as its own command.");
    return deny(lines);
  }
  return null;
}

/** Walks the git calls of a line in order, keeping track of what earlier parts will have changed. */
function judgeGit(calls, context) {
  const state = { wrote: null, indexTouched: false, adds: [], created: false, moved: null, switched: null, branch: null };
  const seen = new Map();
  for (const call of calls) {
    const git = gitCall(call);
    if (!git) {
      if (call.program === "git") continue; // git with no command, such as git --version
      if (writesFiles(call)) state.wrote ??= call.program ? `${call.program}` : "a redirect to a file";
      if (!HARMLESS.has(call.program)) state.moved ??= call.program || "a redirect";
      continue;
    }
    if (git.verb === "commit" || git.verb === "push") {
      // The same call in the same situation gets the same answer: a long line of repeats costs one check.
      const key = JSON.stringify([git.verb, git.folder, git.args, state]);
      if (!seen.has(key))
        seen.set(key, git.verb === "commit" ? judgeCommit(git, state, context) : judgePush(git, state, context));
      if (seen.get(key)) return seen.get(key);
    }
    if (git.verb === "add") state.adds.push({ folder: git.folder, args: git.args });
    if (git.verb === "init" || git.verb === "clone") state.created = true;
    if (!KEEPS_INDEX.has(git.verb)) state.indexTouched = true;
    if (git.verb === "apply" || (git.verb === "stash" && ["pop", "apply"].includes(git.args[0])))
      state.wrote ??= `git ${git.verb}`;
    if (!KEEPS_HISTORY.has(git.verb)) state.moved ??= `git ${git.verb}`;
    if (SWITCHERS.has(git.verb)) {
      state.switched ??= `git ${git.verb}`;
      state.branch = branchAfter(git);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Production commands (deploy tools, live databases), named by the project's config.

function judgeProductionCommand(text, calls, folders, context) {
  // Text that is only printed or searched for is not a command. A commit message neither.
  const speaks = (call) =>
    (TEXT_PROGRAMS.has(call.program) && call.program !== "gh") || gitCall(call)?.verb === "commit";
  const candidates = calls
    .filter((call) => !speaks(call))
    .map((call) => [call.word0, ...call.args, ...call.heredocs].join(" "));
  if (!calls.some(speaks)) candidates.push(text);

  for (const folder of folders) {
    const config = context.config(folder);
    const pattern = config.productionCommands.find((source) => {
      const regex = new RegExp(source, "i");
      return candidates.some((candidate) => regex.test(candidate));
    });
    if (!pattern) continue;
    const head = commitOf("HEAD", folder);
    if (approvalFor({ cwd: folder, head: head ?? "", transcriptPath: context.transcriptPath, config })) continue;
    return deny([
      "BLOCKED by guardrails: this command reaches production, and production is locked.",
      `  matched: ${pattern}`,
      "",
      "You cannot approve this yourself. Stop, say exactly what the command will change,",
      "and ask the human to type this line in the chat, alone on its line:",
      `  ${config.approval.phrase} ${head ? short(head) : "now"}`,
      "Then send the same command again.",
    ]);
  }
  return null;
}

function memo(compute) {
  const known = new Map();
  return (...args) => {
    const key = JSON.stringify(args);
    if (!known.has(key)) known.set(key, compute(...args));
    return known.get(key);
  };
}

/**
 * Verdict for a shell command: { decision: "allow" | "deny" | "ask", reason? }
 * `shell` is "powershell" when the command is PowerShell; anything else is read as Bash.
 */
export function judgeCommand({ command, cwd, transcriptPath, shell }) {
  const text = String(command ?? "");
  if (!text.trim()) return ALLOW;
  const calls = callsIn(text, cwd, { shell });
  const context = {
    transcriptPath,
    config: memo((folder) => loadConfig(folder)),
    stateDir: memo((folder) => stateDir(folder)),
    isRepo: memo((folder) => tryGit(["rev-parse", "--git-dir"], folder) !== null),
    scan: memo((folder, tree, adds) => {
      const { secretScan } = context.config(folder);
      return scanCommit(folder, { tree, adds, allowPaths: secretScan.allowPaths });
    }),
  };
  const folders = [...new Set([cwd, ...calls.map((call) => call.folder)].filter(Boolean).map(slash))];
  const configs = folders.map((folder) => context.config(folder));

  // A deny always wins over a question, so the question waits until every check has run.
  let question = judgeSelfProtection(calls, context);
  if (question?.decision === "deny") return question;

  if (configs.some((config) => config.dangerGuard.enabled)) {
    const danger = dangerIn(text, calls);
    if (danger)
      return deny([
        `BLOCKED by guardrails (${danger.id}): ${danger.why}`,
        "If a human really wants this, they run it in their own terminal.",
      ]);
  }

  const verdict = judgeGit(calls, context) ?? judgeProductionCommand(text, calls, folders, context);
  if (verdict) return verdict;

  const broken = configs.find((config) => config.error);
  if (broken && !calls.every(isHarmless))
    question ??= ask([
      `${broken.file ?? CONFIG_FILE} has a problem: ${broken.error}`,
      "Until it is fixed, the guard cannot tell whether this command reaches production.",
      "A human should confirm this command, or fix the file first.",
    ]);

  return question ?? ALLOW;
}

/** Verdict for a file the agent wants to write. */
export function judgeEdit({ filePath, transcriptPath }) {
  const file = slash(filePath ?? "");
  if (file && touchesSessionLog(file, transcriptPath))
    return deny(["BLOCKED by guardrails: the session log is the record of what the human typed. It is not edited."]);
  if (RECORD_FOLDER.test(file))
    return deny([
      "BLOCKED by guardrails: records of tests, reviews and approvals are not edited by hand.",
      "They are written by the guardrails command, after the real thing happened.",
    ]);
  if (path.posix.basename(file) === CONFIG_FILE)
    return ask([
      `${CONFIG_FILE} sets what the guardrails protect. A human should confirm a change to it.`,
    ]);
  return ALLOW;
}
