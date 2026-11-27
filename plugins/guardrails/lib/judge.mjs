// The decisions. Pure enough to test: a command or a file path goes in, a verdict comes out.
//
// One fact shapes this file: the hook runs BEFORE the command. So it can only judge the state
// it can see now. Where a command line would change that state first (commit, then push), the
// guard does not guess. It asks for the risky step to be sent as its own command.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { approvalFor } from "./approval.mjs";
import { CONFIG_FILE, commitOf, loadConfig, repoRoot, slash, stateDir, tryGit } from "./core.mjs";
import { SKIPS_HOOKS, dangerIn, skipsHooks } from "./danger.mjs";
import { isGuarded, notReady, pushGate } from "./gate.mjs";
import { hookFile, refreshHook } from "./githook.mjs";
import { readPush, resolveTarget } from "./push.mjs";
import { ALLOW_PRAGMA, scanCommit, scanMessage, scanPatches } from "./secrets.mjs";
import { TEXT_PROGRAMS, callsIn, gitCall, programOf, readCommit, readLine, resolveFolder, writesTo } from "./shell.mjs";

const PLUGIN_ROOT = slash(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
const CLI = `node "${PLUGIN_ROOT}/cli.mjs"`;

const ALLOW = { decision: "allow" };
const deny = (lines) => ({ decision: "deny", reason: lines.join("\n") });
const ask = (lines) => ({ decision: "ask", reason: lines.join("\n") });

const short = (sha) => sha.slice(0, 8);

// ---------------------------------------------------------------------------------------------
// What a program or a git command can change. Everything below is built from these few lists.

// Programs that only read the files they are given, or only print.
const READERS = new Set([
  "cat", "type", "less", "more", "head", "tail", "grep", "egrep", "fgrep", "rg", "bat", "wc", "ls", "dir", "stat",
  "file", "jq", "diff", "cmp", "du", "sort", "uniq", "cut", "tr", "echo", "printf", "test", "[", "[[", "get-content", "gc",
  "select-string", "sls", "get-childitem", "gci", "get-item", "gi", "test-path", "findstr", "write-host",
  "write-output", "md5sum", "sha256sum", "nl", "od", "tac", "strings", "tree", "realpath", "readlink", "basename",
  "dirname",
]);
// Programs that change no file, no commit and no branch (when they have no redirect to a file).
const HARMLESS = new Set([
  ...READERS, "cd", "true", "false", "pwd", "sleep", "date", "which", "where", "export", "set", "read", "clear",
  "wait", ":", "exit", "return",
  // PowerShell: the end of a pipe that only filters, counts or shows.
  "out-null", "out-string", "out-host", "out-default", "select-object", "select", "where-object", "sort-object",
  "measure-object", "format-table", "ft", "format-list", "fl", "convertto-json", "convertfrom-json", "write-error",
  "write-warning", "write-verbose",
]);
// What makes `find` more than a search.
const FIND_ACTS = /^-(?:delete|exec|execdir|ok|okdir|fprint0?|fprintf|fls)$/;
// PowerShell settings that only say how errors and progress are shown.
const PS_PREFERENCE =
  /^\$(?:global:|script:)?(?:ErrorActionPreference|ProgressPreference|WarningPreference|VerbosePreference|InformationPreference|DebugPreference|ErrorView)$/i;
const PS_COMPARES = /^-(?:eq|ne|gt|ge|lt|le)$/i;

/**
 * PowerShell: a statement that is only a variable runs no program. `if ($?) { ... }`,
 * `$LASTEXITCODE -eq 0` and `$ErrorActionPreference = "Stop"` are the usual ways to chain commands
 * there, since Windows PowerShell has no `&&`.
 */
function readsVariable(call) {
  if (call.ps !== true) return false;
  const [first, second] = call.args;
  if (call.args.length === 0) {
    const set = call.word0.match(/^(\$[\w:]+)=(\w+)$/);
    return set ? PS_PREFERENCE.test(set[1]) : /^\$[\w:?]+$/.test(call.word0);
  }
  if (!/^\$[\w:?]+$/.test(call.word0) || call.args.length !== 2 || !/^[\w$?:.-]+$/.test(second)) return false;
  return first === "=" ? PS_PREFERENCE.test(call.word0) : PS_COMPARES.test(first);
}

/** True for a call that changes no file, no commit and no branch (a redirect to a file is judged apart). */
function changesNothing(call) {
  if (HARMLESS.has(call.program)) return true;
  if (call.program === "find") return !call.args.some((arg) => FIND_ACTS.test(arg));
  return readsVariable(call);
}
const COPIERS = new Set(["cp", "copy", "copy-item", "cpi", "scp", "rsync"]);
// Programs that make folders or remove things. They cannot put new text into a file.
const WRITES_NO_TEXT = new Set(["mkdir", "md", "rm", "rmdir", "rd", "del", "erase", "remove-item", "ri"]);

// git commands that only read the repository.
const GIT_READS = new Set([
  "status", "diff", "log", "show", "fetch", "config", "rev-parse", "remote", "describe", "ls-files", "blame", "grep",
  "shortlog", "cat-file", "check-ignore", "version", "help",
]);
// git commands that never write to a file named in their arguments.
const GIT_LEAVES_ITS_ARGUMENTS = new Set([...GIT_READS, "add", "commit", "push"]);
// git commands that stage nothing new: what they put in the index is already in a commit.
const GIT_STAGES_NOTHING_NEW = new Set([
  ...GIT_READS, "branch", "tag", "symbolic-ref", "commit", "push", "checkout", "switch", "restore", "reset", "rm", "mv",
  "init", "clone",
]);
// git commands that bring no new text into the working files: same reason.
const GIT_WRITES_NO_TEXT = new Set([...GIT_STAGES_NOTHING_NEW, "add"]);
// git commands that leave every commit and every branch where it is.
const GIT_KEEPS_HISTORY = new Set([...GIT_READS, "tag", "add", "push"]);
// The git commands the guard knows by name. Any other word may be an alias, and is looked up.
const GIT_COMMANDS = new Set([
  ...GIT_WRITES_NO_TEXT, "am", "apply", "archive", "bisect", "bundle", "cherry", "cherry-pick", "clean", "clone",
  "count-objects", "difftool", "filter-branch", "for-each-ref", "format-patch", "fsck", "gc", "init", "ls-remote",
  "ls-tree", "maintenance", "merge", "merge-base", "mergetool", "name-rev", "notes", "prune", "pull", "range-diff",
  "rebase", "reflog", "rev-list", "revert", "send-pack", "show-ref", "sparse-checkout", "stash", "submodule",
  "update-index", "update-ref", "var", "worktree",
]);

const named = (args) => args.filter((arg) => !arg.startsWith("-"));

/** True when this git call only looks: `git branch -vv` reads, `git branch -d old` does not. */
function gitOnlyReads(git) {
  if (GIT_READS.has(git.verb)) return true;
  if (git.verb === "branch" || git.verb === "tag") return named(git.args).length === 0;
  if (git.verb === "symbolic-ref") return named(git.args).length < 2;
  return git.verb === "stash" && git.args[0] === "list";
}

/**
 * True when a git call can bring text into the index or the working files that is not there
 * for the scan to read now: a merge, a stash, or files taken out of another commit.
 */
function bringsNewText(git) {
  if (!GIT_WRITES_NO_TEXT.has(git.verb)) return true;
  if (git.verb === "checkout") {
    // `git checkout stash@{0} -- .env`, `git checkout other config/`, `git checkout -b x origin/y`
    const split = git.args.indexOf("--");
    return named(split === -1 ? git.args : git.args.slice(0, split)).length > (split === -1 ? 1 : 0);
  }
  if (git.verb === "switch") return named(git.args).length > 1;
  if (git.verb === "restore") return git.args.some((arg) => arg === "-s" || arg.startsWith("--source"));
  if (git.verb === "reset") {
    // `git reset other -- app.js` stages the file as it is in another commit. `git reset`,
    // `git reset HEAD app.js` and `git reset -- app.js` only unstage.
    const split = git.args.indexOf("--");
    const commit = named(split === -1 ? git.args : git.args.slice(0, split))[0];
    return commit !== undefined && commit !== "HEAD";
  }
  return false;
}

/** True when the call changes nothing: no file, no commit, no branch. */
function isHarmless(call) {
  if (call.redirects.some(writesTo)) return false;
  if (call.program !== "git") return changesNothing(call);
  const git = gitCall(call);
  return !git || gitOnlyReads(git);
}

/**
 * git runs an alias as the command it stands for, so the guard reads it the same way:
 * `git pom` with alias.pom = "push origin main" is a push to main.
 */
function expandAlias(call, context, depth = 0) {
  const git = gitCall(call);
  if (!git || GIT_COMMANDS.has(git.verb) || depth > 3) return [call];
  const inline = git.globals
    .map((setting) => setting.match(/^alias\.([^=]+)=([\s\S]*)$/))
    .find((match) => match && match[1].toLowerCase() === git.verb);
  const value = inline ? inline[2] : git.folder ? context.alias(git.folder, git.verb) : null;
  if (!value) return [call];
  if (value.startsWith("!")) {
    // A shell alias: git runs the text as a command line, from the top folder of the repository,
    // and adds the arguments at the end.
    const inner = callsIn(value.slice(1), repoRoot(git.folder) ?? git.folder);
    if (inner.length === 0) return [call];
    const last = inner[inner.length - 1];
    inner[inner.length - 1] = { ...last, args: [...last.args, ...git.args] };
    return inner.flatMap((part) => expandAlias(part, context, depth + 1));
  }
  const [stands] = callsIn(`git ${value}`, git.folder);
  if (!stands) return [call];
  const globals = call.args.slice(0, call.args.length - git.args.length - 1);
  return expandAlias({ ...call, args: [...globals, ...stands.args, ...git.args] }, context, depth + 1);
}

// ---------------------------------------------------------------------------------------------
// Self-protection: the approval, the records, the session log and the config.

// The record folder is "guardrails" inside the git folder (also for submodules and worktrees).
// Case is ignored: on Windows and macOS .git/GUARDRAILS is the same folder.
const RECORD_FOLDER = /(?:^|[^\w.-])\.git[\\/](?:[^\s"']*[\\/])?guardrails(?:[\\/"']|$)/i;
// The session log is where a typed approval is read from, so the agent may read it, not write it.
const SESSION_LOG = /[\\/]\.claude[\\/]+projects[\\/][^\s"']*\.jsonl\b/i;

// git's own hooks folder holds the pre-push hook, the second check on every push (see githook.mjs).
// The folder itself (hooks, hooks/), the hook, or a pattern that can take it (hooks/*, hooks/pre-*).
const PUSH_HOOK =
  /(?:^|[^\w.-])\.git[\\/](?:[^\s"']*[\\/])?hooks(?:[\\/](?:pre-push|[^\\/\s"']*[*?[{][^\\/\s"']*)?)?(?:["']|$)/i;
// Programs that remove or move what they are given.
const REMOVERS = new Set([
  "rm", "rmdir", "rd", "del", "erase", "remove-item", "ri", "mv", "move", "move-item", "mi", "ren", "rename-item", "rni",
]);
// A file git reads its settings from: an alias or a push rule can be written there without `git config`.
const GIT_SETTINGS_FILE = /(?:^|[\\/])(?:\.gitconfig|\.git[\\/]config(?:\.worktree)?|gitconfig)["']?$/i;

const sameText = (a, b) => a.toLowerCase() === b.toLowerCase();

function touchesSessionLog(text, transcriptPath) {
  if (SESSION_LOG.test(text)) return true;
  const name = transcriptPath ? path.posix.basename(slash(transcriptPath)) : "";
  return name.length > 8 && text.toLowerCase().includes(name.toLowerCase());
}

/** Which protected thing a word names: "record", "hook", "log", "config" or null. */
function kindOf(text, call, context) {
  const plain = slash(text);
  if (RECORD_FOLDER.test(plain)) return "record";
  if (PUSH_HOOK.test(plain)) return "hook";
  if (call.folder && (/pre-push/i.test(plain) || REMOVERS.has(call.program))) {
    // core.hooksPath can point anywhere (.husky, .githooks). Compare with the file git really runs.
    const hook = context.hookFile(call.folder);
    const full = resolveFolder(call.folder, text.replace(/[\\/]+$/, ""));
    if (hook && full && (sameText(full, hook) || sameText(full, path.posix.dirname(hook)))) return "hook";
  }
  if (/guardrails/i.test(plain) && call.folder) {
    // A git folder can live somewhere else. Compare with the real record folder.
    const records = context.stateDir(call.folder);
    const full = resolveFolder(call.folder, text);
    if (records && full && (sameText(full, records) || sameText(full.slice(0, records.length + 1), `${records}/`)))
      return "record";
  }
  if (touchesSessionLog(text, context.transcriptPath)) return "log";
  if (GIT_SETTINGS_FILE.test(plain)) return "settings";
  if (plain.toLowerCase().includes(CONFIG_FILE)) return "config";
  return null;
}

/** True when the call can only read the file named by this argument. */
function onlyReads(call, arg) {
  if (call.program === "git") {
    const git = gitCall(call);
    return !git || GIT_LEAVES_ITS_ARGUMENTS.has(git.verb);
  }
  if (READERS.has(call.program)) return true;
  if (call.program === "find") return !call.args.some((word) => FIND_ACTS.test(word));
  if (COPIERS.has(call.program)) {
    const files = named(call.args);
    return files[files.length - 1] !== arg; // the file is copied from, not written to
  }
  return false;
}

/** True for the guard's own command line tool, however the path to it is written. */
function isGuardrailsCli(word, folder) {
  if (programOf(word) === "guardrails") return true;
  const file = slash(word);
  if (path.posix.basename(file) !== "cli.mjs") return false;
  if (/guardrails/i.test(file)) return true;
  // A short path after a cd: `cd <plugin folder> && node cli.mjs`. An unknown folder is not a risk to take.
  const full = resolveFolder(folder, file);
  return full === null || /guardrails/i.test(full) || full.toLowerCase() === `${PLUGIN_ROOT}/cli.mjs`.toLowerCase();
}

function runsApprove(call) {
  if (isGuardrailsCli(call.word0, call.folder)) return call.args[0] === "approve";
  // `$TOOL approve`: a program named through a variable cannot be told apart from the guard's own.
  if (call.word0.startsWith("$") && call.args[0] === "approve") return true;
  if (TEXT_PROGRAMS.has(call.program) || call.program === "git") return false; // text about the command
  if (call.args.some((word, index) => isGuardrailsCli(word, call.folder) && call.args[index + 1] === "approve")) return true;
  // A runner handed the whole command as one quoted word: script -c "guardrails approve".
  return call.args.some(
    (arg) => /\s/.test(arg) && callsIn(arg, call.folder).some(runsApprove),
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
    // Without git's hooks the second check on a push does not run. This holds with the danger guard on or off.
    if (skipsHooks(gitCall(call)))
      return deny([
        `BLOCKED by guardrails (skip-hooks): ${SKIPS_HOOKS}`,
        "If a human really wants this, they run it in their own terminal.",
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
      if (kind === "hook")
        question ??= ask([
          "This command changes git's hooks folder. The pre-push hook there is the second check on every push.",
          "A human should confirm a change to it.",
        ]);
      if (kind === "settings")
        question ??= ask([
          "This command writes to a file git reads its settings from. The hooks folder, an alias or a push rule can be set there.",
          "A human should confirm a change to it.",
        ]);
    }
  }
  return question;
}

// A program named through a variable or the output of a command: $C, ${C}sh, $(echo git), `echo git`.
const HIDDEN_PROGRAM = /^(?:\$|`)[^\\/]*$/;
const SHIPS = /(?<![\w-])(?:git|push|commit)(?![\w-])/i;
// Settings that switch a hook off, or hand git its config from outside the command line.
const ENV_TRICK =
  /(?<![\w])(?:HUSKY\s*=\s*["']?0\b|GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+|PARAMETERS|GLOBAL|SYSTEM|NOSYSTEM)\b|CLAUDECODE\b|AI_AGENT\b|CLAUDE_CODE_ENTRYPOINT\b)/i;
const SETS_VARIABLES = new Set(["export", "set", "declare", "typeset", "unset", "setx", "set-item", "remove-item", "si", "ri"]);

/**
 * Ways of writing a commit or a push so that the words of the line do not show it.
 * The guard reads text, so it does not guess here: it asks for the plain form.
 */
function judgeDisguise(text, calls, shell) {
  const ships = SHIPS.test(text);
  for (const call of calls) {
    if (!call.word0.startsWith("$") && !call.word0.startsWith("`")) continue;
    const verb = (call.args[0] ?? "").toLowerCase();
    const hidden = shell === "powershell" ? verb === "push" || verb === "commit" : HIDDEN_PROGRAM.test(call.word0) && ships;
    if (hidden)
      return deny([
        `BLOCKED by guardrails: the program on this line is \`${call.word0}\`, a variable or the output of a command,`,
        "and the line talks about git, a commit or a push. The guard cannot read a program it cannot see.",
        "Write the program itself, for example: git push origin feature/x",
      ]);
  }
  const shipping = calls.some((call) => ["commit", "push"].includes(gitCall(call)?.verb));
  if (!shipping) return null;
  // Read from the words of the command, never from the guard's own environment.
  const settings = calls
    .map((call) =>
      SETS_VARIABLES.has(call.program) || /^\$env:/i.test(call.word0)
        ? [...(call.env ?? []), call.word0, ...call.args].join(" ")
        : (call.env ?? []).join(" "),
    )
    .join(" ");
  const trick = settings.match(ENV_TRICK);
  if (!trick) return null;
  return deny([
    `BLOCKED by guardrails: this line sets \`${trick[0]}\` and then commits or pushes.`,
    "That setting can switch a check off, or change what git does, from outside the command.",
    "Send the commit or the push without it.",
  ]);
}

// ---------------------------------------------------------------------------------------------
// Commits and pushes.

/**
 * The branch a git call switches to: a name, null when it switches but the line does not say
 * where, or undefined when the call does not switch at all.
 */
function branchSwitch(git) {
  const { verb, args } = git;
  const words = named(args);
  if (verb === "checkout" || verb === "switch") {
    if (args.includes("--")) return verb === "checkout" ? undefined : null; // checkout -- <files> restores files
    const track = args.some((arg) => arg === "-t" || arg.startsWith("--track"));
    const create = args.findIndex(
      (arg) => /^-[bBcC]$/.test(arg) || arg === "--create" || arg === "--force-create" || arg === "--orphan",
    );
    if (create !== -1) return track ? null : (args[create + 1] ?? null);
    if (words.length !== 1 || /[@~^]/.test(words[0])) return null;
    // `checkout -t origin/staging` makes and enters the local branch "staging".
    return track ? words[0].replace(/^[^/]+\//, "") : words[0];
  }
  if (verb === "rebase") {
    // `git rebase main topic` checks out topic first. The value of --onto is not a branch to enter.
    const onto = args.indexOf("--onto");
    const real = named(onto === -1 ? args : [...args.slice(0, onto), ...args.slice(onto + 2)]);
    return real.length >= 2 ? real[real.length - 1] : undefined;
  }
  if (verb === "branch") return args.some((arg) => /^-[mM]$/.test(arg) || arg === "--move") ? null : undefined;
  if (verb === "symbolic-ref") return words.length >= 2 ? null : undefined;
  return verb === "init" || verb === "clone" ? null : undefined;
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
  const made = deny([
    `BLOCKED by guardrails: this line creates a folder or a repository and runs a ${what} in it.`,
    `The guard reads the repository before the line runs, and there is none yet. Send the ${what} as its own command.`,
  ]);
  const missing = git.folder !== null && !fs.existsSync(git.folder);
  if (missing && state.created) return made;
  if (git.folder === null || missing)
    return deny([
      `BLOCKED by guardrails: the guard cannot tell which folder this ${what} runs in.`,
      "The line gets there through a variable, or a path that does not exist here.",
      `Write the folder itself: git -C <folder> ${what} ...   or: cd <folder>, then the ${what} as its own command.`,
    ]);
  if (context.isRepo(git.folder)) return null;
  if (!context.gitWorks())
    return deny([
      `BLOCKED by guardrails: the guard could not run git, so it cannot check this ${what}.`,
      "Make sure git is on the PATH of the session, then send the command again.",
    ]);
  return state.created ? made : "skip";
}

const MAX_MESSAGE_BYTES = 1024 * 1024;

/**
 * The secrets in the message of a commit, a merge or a tag: { findings, waived }.
 * The message goes into history like any file. `refused` holds a verdict when it cannot be read.
 */
function messageReport(commit, git, state, context) {
  const said = [...commit.messages];
  for (const name of commit.messageFiles) {
    if (name === "-") {
      // The message comes on the standard input: a here-document, or what an earlier part of the line prints.
      said.push(...(git.call.heredocs.length ? git.call.heredocs : [context.text]));
      continue;
    }
    let text = null;
    try {
      const file = state.ran ? null : resolveFolder(git.folder, name);
      if (file && fs.statSync(file).size <= MAX_MESSAGE_BYTES) text = fs.readFileSync(file, "utf8");
    } catch {
      text = null;
    }
    if (text === null)
      return {
        refused: deny([
          `BLOCKED by guardrails: the secret scan cannot read the message file "${name}".`,
          state.ran
            ? `On this line \`${state.ran}\` runs first and can write it, and the scan reads before the line runs.`
            : "It is missing, too large, or named through a variable.",
          "Write the file first. Then send this command on its own, or pass the message with -m.",
        ]),
      };
    said.push(text);
  }
  return scanMessage(said.join("\n"));
}

/** The verdict for what a secret scan found: null, a question about waived lines, or a refusal. */
function secretVerdict({ findings, files, waived }) {
  if (findings.length === 0 && files.length === 0) {
    if (waived.length === 0) return null;
    // The agent can add the comment itself, so the comment is a question to the human, not a pass.
    const lines = [`This commit adds ${waived.length} line(s) that look like a secret and are marked ${ALLOW_PRAGMA}:`];
    for (const finding of waived.slice(0, 8)) lines.push(`  ${finding.file}:${finding.line}  ${finding.rule}  ${finding.shown}`);
    lines.push("A human should confirm that none of them is a real secret.");
    return ask(lines);
  }
  const lines = ["BLOCKED by guardrails: this commit would put a secret into git history.", ""];
  for (const file of files) lines.push(`  ${file}: a secrets file should not be committed`);
  for (const finding of findings.slice(0, 12))
    lines.push(`  ${finding.file}:${finding.line}  ${finding.rule}  ${finding.shown}`);
  if (findings.length > 12) lines.push(`  ... and ${findings.length - 12} more`);
  lines.push(
    "",
    "Take the value out of the code or the message, and read it from the environment or a secrets store.",
    "If the key was real, it must also be rotated: a secret that reached a commit is burned.",
    "A false positive (a test fixture, a public example): add the comment",
    `  ${ALLOW_PRAGMA}`,
    "on that line, and a human is asked to confirm the commit. Or a human lists the path",
    `under secretScan.allowPaths in ${CONFIG_FILE}.`,
  );
  return deny(lines);
}

/** A merge, a tag or a note with a message on the line: the message is scanned like a commit's. */
function judgeMessage(git, state, context) {
  const said = readCommit(git.args);
  if (said.messages.length === 0 && said.messageFiles.length === 0) return null;
  const config = git.folder ? context.config(git.folder) : null;
  if (config && !config.error && !config.secretScan.enabled) return null;
  const spoken = messageReport(said, git, state, context);
  return spoken.refused ?? secretVerdict({ findings: spoken.findings, waived: spoken.waived, files: [] });
}

function judgeCommit(git, state, context) {
  const commit = readCommit(git.args);
  if (commit.dryRun) return null;

  // What the commit takes besides the files staged now: nothing, some paths, or every changed file.
  // --patch, --interactive and --pathspec-from-file pick files the line does not name: every changed file is read.
  let scope = state.scope;
  if (commit.all || commit.wide) scope = "all";
  else if (commit.paths.length && scope !== "all") scope = [...(scope ?? []), { folder: git.folder, paths: commit.paths }];

  // A repository made on this line, with nothing added to it since, has nothing staged:
  // `git init && git commit --allow-empty -m init` can only make an empty commit. Its message is still read.
  const here = git.folder !== null && fs.existsSync(git.folder) && context.isRepo(git.folder);
  if (state.created && !here && !scope && git.folder !== null) {
    const spoken = messageReport(commit, git, state, context);
    return spoken.refused ?? secretVerdict({ findings: spoken.findings, waived: spoken.waived, files: [] });
  }

  const where = locate(git, state, "commit", context);
  if (where) return where === "skip" ? null : where;
  const config = context.config(git.folder);
  if (config.error) return brokenConfig(config);
  if (!config.secretScan.enabled) return null;

  if (scope && state.ran)
    return deny([
      `BLOCKED by guardrails: this line runs \`${state.ran}\` and then commits files as they will be on disk.`,
      "The secret scan reads the files before the line runs, so it cannot see what that step",
      "writes or changes. Run the first part, then the add and the commit as their own command.",
    ]);

  const result = context.scan(git.folder, scope, state.adds);
  if (result.error)
    return deny([
      "BLOCKED by guardrails: the secret scan could not read what this commit adds.",
      `  ${result.error}`,
      "A commit that cannot be checked is not let through. Fix the cause, or commit in smaller parts.",
    ]);
  const spoken = messageReport(commit, git, state, context);
  if (spoken.refused) return spoken.refused;
  return secretVerdict({
    findings: [...spoken.findings, ...result.findings],
    files: result.files,
    waived: [...spoken.waived, ...result.waived],
  });
}

function judgePush(git, state, context) {
  const push = readPush(git);
  if (push.dryRun) return null;
  const where = locate(git, state, "push", context);
  if (where) return where === "skip" ? null : where;
  const config = context.config(push.folder);
  if (config.error) return brokenConfig(config);
  // Only the real hook does this. `guardrails check` shows an answer and writes nothing.
  if (context.live) refreshHook(push.folder);

  if (state.rerouted)
    return deny([
      `BLOCKED by guardrails: this line runs \`${state.rerouted}\` and then pushes.`,
      "That step can change where a push goes, and the guard reads git's settings before the line runs.",
      "Run the first part. Then send the push as its own command.",
    ]);

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
        `BLOCKED by guardrails: this line runs \`${state.switched}\` and then pushes the current branch,`,
        "so the guard cannot tell where the push goes.",
        "Name it: git push origin HEAD:<branch>   or send the push as its own command.",
      ]);
    targets.push({ src: "HEAD", dst: push.landsOn(state.branch), forced: false, deletes: false });
  }

  for (const target of targets) {
    if (!isGuarded(target.dst, config)) continue;

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
    const gate = pushGate({ folder: push.folder, head, dst: target.dst, changed, config, transcriptPath: context.transcriptPath });
    if (gate.open) return deny(notReady({ gate, head, dst: target.dst, folder: push.folder, config, cli: CLI }));
  }
  return null;
}

const AM_TAKES_NO_PATCH = /^(?:--continue|--skip|--abort|--quit|--resolved|-r|--retry|--show-current-patch(?:=.*)?)$/;

/** The files a word of a `git am` line names: one file, or the files a pattern fits. */
function patchFiles(folder, name) {
  const file = resolveFolder(folder, name.replace(/[*?]/g, "x"));
  if (!file) return [];
  if (!/[*?]/.test(name)) return fs.existsSync(file) ? [file] : [];
  const dir = path.posix.dirname(file);
  const base = path.posix.basename(slash(name));
  if (/[*?]/.test(slash(name).slice(0, -base.length)) || !fs.existsSync(dir)) return [];
  const fits = new RegExp(`^${base.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
  return fs.readdirSync(dir).filter((entry) => fits.test(entry)).map((entry) => `${dir}/${entry}`);
}

/** `git am` turns patch files into commits, so the lines they add are read like a commit's. */
function judgeAm(git, state, context) {
  if (git.args.some((arg) => AM_TAKES_NO_PATCH.test(arg))) return null;
  const where = locate(git, state, "commit", context);
  if (where) return where === "skip" ? null : where;
  const config = context.config(git.folder);
  if (config.error) return brokenConfig(config);
  if (!config.secretScan.enabled) return null;
  const fed = git.call.redirects.filter((redirect) => redirect.op === "<").map((redirect) => redirect.target);
  const files = [...named(git.args), ...fed].flatMap((name) => patchFiles(git.folder, name));
  if (files.length === 0 || state.ran)
    return deny([
      "BLOCKED by guardrails: the secret scan cannot read the patch that this `git am` turns into commits.",
      state.ran
        ? `On this line \`${state.ran}\` runs first and can write it, and the scan reads before the line runs.`
        : "It comes through a pipe, a variable, or a file that is not there.",
      "Name the patch file on the line, and send it as its own command: git am fix.patch",
    ]);
  const result = scanPatches(files, { allowPaths: config.secretScan.allowPaths });
  if (result.error)
    return deny([
      "BLOCKED by guardrails: the secret scan could not read what this `git am` adds.",
      `  ${result.error}`,
      "A commit that cannot be checked is not let through.",
    ]);
  return secretVerdict(result);
}

const FINISHES_A_COMMIT = new Set(["rebase", "merge", "cherry-pick", "revert", "am"]);
const CARRIES_A_MESSAGE = new Set(["merge", "tag", "notes"]);
// Settings that change what a git word means or where a push lands.
const ALIAS_SETTING = /^(?:\*$|alias\.|include(?:if)?\.)/;
const ROUTE_SETTING = /^(?:\*$|alias\.|include(?:if)?\.|remote\..+\.(?:push|mirror)$|push\.|branch\.|core\.hookspath$)/;

/**
 * The setting a `git config` call writes, in lower case ("*" when it opens an editor),
 * or null when the call only reads.
 */
function configWrite(git) {
  if (git.verb !== "config") return null;
  const words = [];
  let writes = false;
  for (let i = 0; i < git.args.length; i++) {
    const arg = git.args[i];
    if (/^(?:-l|--list|--get|--get-all|--get-regexp|--get-urlmatch|--get-color|--get-colorbool)$/.test(arg)) return null;
    if (/^(?:-f|--file|--blob|--type|--default|--comment|--value)$/.test(arg)) i++;
    else if (/^(?:-e|--edit)$/.test(arg)) return "*";
    else if (/^--(?:add|unset|unset-all|replace-all|rename-section|remove-section)$/.test(arg)) writes = true;
    else if (!arg.startsWith("-")) words.push(arg);
  }
  // `git config set <name> <value>`: a first word without a dot is the newer way to say what to do.
  const action = !writes && words.length && !words[0].includes(".") ? words.shift() : null;
  if (action === "edit") return "*";
  if (action === "get" || action === "list") return null;
  if (action !== null) writes = true;
  if (words.length === 0) return null;
  return writes || words.length >= 2 ? words[0].toLowerCase() : null;
}

const MAX_CHECKS_PER_LINE = 20;

/** Walks the calls of a line in order, keeping track of what earlier parts will have changed. */
function judgeGit(calls, context) {
  const state = {
    ran: null, // the first earlier step that can write or change a working file
    moved: null, // the first earlier step that can make a commit or move a branch
    scope: null, // what a commit takes besides the staged files: null, "all", or [{ folder, paths }]
    adds: [], // the `git add` calls so far
    created: false, // a folder or a repository was made on this line
    switched: null, // the first earlier step that can change the current branch
    branch: null, // the branch it lands on, when the line says so
    aliased: null, // the first earlier step that can give a git word a new meaning
    rerouted: null, // the first earlier step that can change where a push lands
  };
  const seen = new Map();
  let question = null;
  for (const call of calls) {
    const git = gitCall(call);
    if (!git) {
      if (call.program === "git") continue; // git with no command, such as git --version
      if (["mkdir", "md", "new-item", "ni"].includes(call.program)) state.created = true;
      const targets = [...call.redirects.filter(writesTo).map((redirect) => redirect.target), ...call.args];
      if (!READERS.has(call.program) || call.redirects.some(writesTo)) {
        if (targets.some((target) => GIT_SETTINGS_FILE.test(slash(target)))) {
          state.aliased ??= "a change to git's settings file";
          state.rerouted ??= "a change to git's settings file";
        }
      }
      const writesText = call.redirects.some(writesTo) || !(changesNothing(call) || WRITES_NO_TEXT.has(call.program));
      if (writesText) state.ran ??= call.program || "a redirect to a file";
      if (!changesNothing(call)) state.moved ??= call.program || "a redirect";
      continue;
    }
    if (/^[$@]|`/.test(git.verb))
      return deny([
        "BLOCKED by guardrails: the git command on this line is a variable, so the guard cannot read it.",
        "Write the command itself, for example: git push origin feature/x",
      ]);
    if (state.aliased && !GIT_COMMANDS.has(git.verb))
      return deny([
        `BLOCKED by guardrails: this line runs \`${state.aliased}\` and then \`git ${git.verb}\`, a word git does not know by itself.`,
        "It may be an alias made on this same line, and the guard reads aliases before the line runs.",
        "Run the first part. Then send the second command on its own.",
      ]);
    // --config-env takes the value of a setting from a variable, where the guard cannot read it.
    const outside = git.envSettings.find((name) => ROUTE_SETTING.test(name) || ALIAS_SETTING.test(name));
    if (outside)
      return deny([
        `BLOCKED by guardrails: this line hands git the setting \`${outside}\` through --config-env, from a variable the guard cannot read.`,
        "That setting can change what a git word means, where a push lands, or which hooks run.",
        "Send the command without it.",
      ]);
    const setting = configWrite(git);
    if (setting !== null) {
      if (ALIAS_SETTING.test(setting)) state.aliased ??= `git config ${setting}`;
      if (ROUTE_SETTING.test(setting)) state.rerouted ??= `git config ${setting}`;
      if (setting === "core.hookspath")
        question ??= ask([
          "This command changes core.hooksPath, the folder git runs its hooks from.",
          "The pre-push check lives there. A human should confirm the change.",
        ]);
    }
    if (git.verb === "branch" && git.args.some((arg) => /^(?:-u|--set-upstream-to)/.test(arg)))
      state.rerouted ??= "git branch --set-upstream-to";
    if (CARRIES_A_MESSAGE.has(git.verb)) {
      const spoken = judgeMessage(git, state, context);
      if (spoken?.decision === "deny") return spoken;
      question ??= spoken;
    }
    if (git.verb === "am") {
      const patched = judgeAm(git, state, context);
      if (patched?.decision === "deny") return patched;
      question ??= patched;
    }
    // `git rebase --continue` (and merge, cherry-pick, revert, am) commits what is staged.
    const finishes = FINISHES_A_COMMIT.has(git.verb) && git.args.includes("--continue");
    if (git.verb === "commit" || git.verb === "push" || finishes) {
      // The same call in the same situation gets the same answer: a long line of repeats costs one check.
      const key = JSON.stringify([git.verb, git.folder, git.args, state]);
      if (!seen.has(key)) {
        if (seen.size >= MAX_CHECKS_PER_LINE)
          return deny([
            `BLOCKED by guardrails: this line holds more than ${MAX_CHECKS_PER_LINE} different commits and pushes.`,
            "Each one is checked against the repository, and that many cannot be checked in time. Send fewer per line.",
          ]);
        const asCommit = finishes ? { ...git, args: [] } : git;
        seen.set(key, git.verb === "push" ? judgePush(git, state, context) : judgeCommit(asCommit, state, context));
      }
      const verdict = seen.get(key);
      if (verdict?.decision === "deny") return verdict;
      question ??= verdict;
    }
    if (git.verb === "add") {
      state.adds.push({ folder: git.folder, args: git.args });
      // `git add src` takes those paths. `git add -A` and `git add -u` take every changed file.
      const paths = named(git.args);
      if (paths.length === 0) state.scope = "all";
      else if (state.scope !== "all") state.scope = [...(state.scope ?? []), { folder: git.folder, paths }];
    } else if (bringsNewText(git)) state.scope = "all";
    if (git.verb === "init" || git.verb === "clone") state.created = true;
    if (bringsNewText(git)) state.ran ??= `git ${git.verb}`;
    // `git show old:.env > .env` writes a file like any other program with a redirect.
    if (call.redirects.some(writesTo)) state.ran ??= `git ${git.verb} with a redirect to a file`;
    if (!GIT_KEEPS_HISTORY.has(git.verb) && !gitOnlyReads(git)) state.moved ??= `git ${git.verb}`;
    const lands = branchSwitch(git);
    if (lands !== undefined) {
      state.switched ??= `git ${git.verb}`;
      state.branch = lands;
    }
  }
  return question;
}

// ---------------------------------------------------------------------------------------------
// Production commands (deploy tools, live databases), named by the project's config.

const GH_TEXT_FLAGS = new Set(["--body", "-b", "--title", "-t", "--notes", "-n", "--message", "-m", "--subject"]);

/** The words of a `gh` call without the text of a title, a body or a note. */
function ghWithoutProse(call) {
  const words = [call.word0];
  for (let i = 0; i < call.args.length; i++) {
    if (GH_TEXT_FLAGS.has(call.args[i])) i++;
    else if (!/^--(?:body|title|notes|message|subject)=/.test(call.args[i])) words.push(call.args[i]);
  }
  return words;
}

function judgeProductionCommand(text, calls, folders, context) {
  // Text that is only printed or searched for is not a command. A commit message neither.
  const speaks = (call) => TEXT_PROGRAMS.has(call.program) || gitCall(call)?.verb === "commit";
  const candidates = calls
    .filter((call) => call.program === "gh" || !speaks(call))
    .map((call) => (call.program === "gh" ? ghWithoutProse(call) : [call.word0, ...call.args, ...call.heredocs]).join(" "));
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
      "and ask the human to send this line as a message of its own:",
      `  ${config.approval.phrase} ${head ? short(head) : "now"}`,
      "Then send the same command again.",
    ]);
  }
  return null;
}

/** Runs one check. When it throws, the error carries the name of the check, for the one line the hook prints. */
function stage(name, run) {
  try {
    return run();
  } catch (error) {
    if (error && typeof error === "object") error.guardStage ??= name;
    throw error;
  }
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
 * `live` is true in the real hook, where a stale pre-push hook may be written again. Without it
 * the verdict is only shown, and nothing is written.
 */
export function judgeCommand({ command, cwd, transcriptPath, shell, live = false }) {
  const text = String(command ?? "");
  if (!text.trim()) return ALLOW;
  const line = stage("reading the command", () => readLine(text, cwd, { shell }));
  if (line.unreadable)
    return deny([
      "BLOCKED by guardrails: this line nests commands inside commands deeper than the guard reads.",
      "A line the guard cannot read is not let through. Send it in simpler parts.",
    ]);
  const context = {
    text,
    transcriptPath,
    live: live === true,
    config: memo((folder) => loadConfig(folder)),
    stateDir: memo((folder) => stateDir(folder)),
    hookFile: memo((folder) => hookFile(folder)),
    isRepo: memo((folder) => tryGit(["rev-parse", "--git-dir"], folder) !== null),
    gitWorks: memo(() => tryGit(["--version"]) !== null),
    alias: memo((folder, verb) => tryGit(["config", "--get", `alias.${verb}`], folder)),
    scan: memo((folder, scope, adds) => {
      const { secretScan } = context.config(folder);
      return scanCommit(folder, { scope, adds, allowPaths: secretScan.allowPaths });
    }),
  };
  const calls = stage("reading the command", () => line.calls.flatMap((call) => expandAlias(call, context)));
  const folders = [...new Set([cwd, ...calls.map((call) => call.folder)].filter(Boolean).map(slash))];
  const configs = stage("reading the config", () => folders.map((folder) => context.config(folder)));

  // A deny always wins over a question, so a question waits until every check has run.
  let question = stage("self-protection", () => judgeSelfProtection(calls, context));
  if (question?.decision === "deny") return question;

  if (configs.some((config) => config.dangerGuard.enabled)) {
    const danger = stage("dangerous commands", () => dangerIn(calls));
    if (danger)
      return deny([
        `BLOCKED by guardrails (${danger.id}): ${danger.why}`,
        "If a human really wants this, they run it in their own terminal.",
      ]);
  }

  const production = () => stage("production lock", () => judgeProductionCommand(text, calls, folders, context));
  const readable = stage("secret scan and push checks", () => judgeGit(calls, context));
  if (readable?.decision === "deny") return readable;
  // What the guard could read is judged first. Then the parts it cannot read.
  const disguise = stage("reading the command", () => judgeDisguise(text, calls, shell));
  if (disguise) return disguise;
  const verdict = readable ?? production();
  if (verdict?.decision === "deny") return verdict;
  question ??= verdict;
  if (verdict?.decision === "ask") {
    // A question about a commit must not hide a production command further down the line.
    const locked = production();
    if (locked) return locked;
  }

  const broken = configs.find((config) => config.error);
  if (broken && !calls.every(isHarmless))
    question ??= ask([
      `${broken.file ?? CONFIG_FILE} has a problem: ${broken.error}`,
      "Until it is fixed, the guard cannot tell whether this command reaches production.",
      "A human should confirm this command, or fix the file first.",
    ]);

  return question ?? ALLOW;
}

/** The nearest folder above a file that exists, or null. */
function folderOf(file) {
  let dir = path.posix.dirname(file);
  while (!fs.existsSync(dir)) {
    const up = path.posix.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
  return dir;
}

/**
 * A git folder can have another name (a separate git folder, a bare repository with worktrees),
 * and core.hooksPath can point anywhere. So git is asked where the records and the hook really are:
 * "record", "hook" or null. Only a path that could be one of them costs a call to git.
 */
function protectedPlace(file, cwd) {
  const couldBeRecord = /(?:^|\/)guardrails\//i.test(file);
  const couldBeHook = sameText(path.posix.basename(file), "pre-push");
  if (!couldBeRecord && !couldBeHook) return null;
  const full = resolveFolder(cwd ? slash(cwd) : null, file);
  if (!full) return null;
  // The repository the file is in, and the one the session works in.
  for (const folder of new Set([folderOf(full), cwd ? slash(cwd) : null].filter(Boolean))) {
    const records = couldBeRecord ? stateDir(folder) : null;
    if (records && sameText(full.slice(0, records.length + 1), `${records}/`)) return "record";
    const hook = couldBeHook ? hookFile(folder) : null;
    if (hook && sameText(full, hook)) return "hook";
  }
  return null;
}

/** Verdict for a file the agent wants to write. `cwd` is the folder the session works in. */
export function judgeEdit({ filePath, transcriptPath, cwd }) {
  const file = slash(filePath ?? "");
  if (file && touchesSessionLog(file, transcriptPath))
    return deny(["BLOCKED by guardrails: the session log is the record of what the human typed. It is not edited."]);
  const place = file ? protectedPlace(file, cwd) : null;
  if (RECORD_FOLDER.test(file) || place === "record")
    return deny([
      "BLOCKED by guardrails: records of tests, reviews and approvals are not edited by hand.",
      "They are written by the guardrails command, after the real thing happened.",
    ]);
  if (PUSH_HOOK.test(file) || place === "hook")
    return ask([
      "This file is in git's hooks folder. The pre-push hook there is the second check on every push.",
      "A human should confirm a change to it.",
    ]);
  if (GIT_SETTINGS_FILE.test(file))
    return ask([
      "git reads its settings from this file. The hooks folder, an alias or a push rule can be set there.",
      "A human should confirm a change to it.",
    ]);
  if (sameText(path.posix.basename(file), CONFIG_FILE))
    return ask([
      `${CONFIG_FILE} sets what the guardrails protect. A human should confirm a change to it.`,
    ]);
  return ALLOW;
}
