#!/usr/bin/env node
// The guardrails command: runs the tests on the record, records a passed review, takes a
// human approval, shows what a commit still needs, and is what git's pre-push hook calls.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { CONFIG_FILE, DEFAULTS, PLAIN_DIFF, commitOf, isAgentShell, loadConfig, readStdin, repoRoot, stateDir, tryGit } from "./lib/core.mjs";
import { isGuarded, notReady, pushGate } from "./lib/gate.mjs";
import { CLI_FILE, hookState, installHook } from "./lib/githook.mjs";
import { judgeCommand } from "./lib/judge.mjs";
import { readRecord, reviewTrailer, writeRecord } from "./lib/records.mjs";
import { detectTestCommand, testCommandFor } from "./lib/testcommand.mjs";

const USAGE = `guardrails <command>

  status                         what the current commit has on record
  test                           run the project's tests; a pass is recorded for this exact code
  review-stamp --report <file>   record a passed review (the report must end with the trailer)
  approve                        human only, in a real terminal: approve this commit for production
  check "<shell command>"        show what the guard would say to a command, without running it
  init                           write ${CONFIG_FILE} with the defaults for this repository
  install-hook                   add git's own pre-push hook: git checks every push a second time

Options: --head <ref> (default HEAD) for status, review-stamp and approve.
`;

const cwd = process.cwd();
const [command, ...rest] = process.argv.slice(2);

function option(name) {
  const index = rest.indexOf(`--${name}`);
  return index === -1 ? undefined : rest[index + 1];
}

function fail(message) {
  process.stderr.write(`guardrails: ${message}\n`);
  process.exit(1);
}

function needRepo() {
  const root = repoRoot(cwd);
  if (!root) fail("this folder is not inside a git repository");
  return root;
}

function headOf() {
  const ref = option("head") ?? "HEAD";
  const head = commitOf(ref, cwd);
  if (!head) fail(`cannot resolve ${ref}`);
  return head;
}

function status() {
  const root = needRepo();
  const config = loadConfig(cwd);
  const head = headOf();
  const tests = readRecord(cwd, "tests", head);
  const review = readRecord(cwd, "review", head);
  const approval = readRecord(cwd, "approval", head);
  const testCommand = testCommandFor(config, root);
  const mark = (record) => (record ? `yes (${record.at})` : "no");
  process.stdout.write(
    [
      `commit            ${head.slice(0, 8)}`,
      `config            ${config.file ?? "defaults (no guardrails.config.json)"}`,
      ...(config.error ? [`config PROBLEM    ${config.error}`] : []),
      ...(config.unknown.length ? [`config NOTE       not a setting of the guard, so it changes nothing: ${config.unknown.join(", ")}`] : []),
      `protected         ${config.protectedBranches.join(", ")}`,
      `production        ${config.productionBranches.join(", ") || "(none)"}`,
      `test command      ${testCommand ?? (config.tests.required ? NO_TEST_COMMAND : "(none: tests are switched off in the config)")}`,
      `tests passed      ${mark(tests)}`,
      `review passed     ${mark(review)}`,
      `human approval    ${mark(approval)}`,
      `pre-push hook     ${HOOK_STATES[hookState(cwd)]}`,
      "",
    ].join("\n"),
  );
}

const NO_TEST_COMMAND = "(none found: a push of code to a protected branch is refused until one is set)";
const HOOK_STATES = {
  current: "installed (git checks every push a second time)",
  stale: "written by another copy of the plugin: run guardrails install-hook",
  edited: "installed, and changed by hand: it is not written again after a plugin update",
  added: "installed inside another tool's hook (git checks every push a second time)",
  moved: "inside another tool's hook, and this clone does not point to this copy of the plugin: run guardrails install-hook",
  oldline: "another tool's hook holds the one line of version 0.2.0, which takes the list of branches away from the commands under it: run guardrails install-hook for the lines to replace it with",
  other: "another tool's hook is there: run guardrails install-hook to see the lines to add",
  none: "not installed: run guardrails install-hook",
};

function runTests() {
  const root = needRepo();
  const config = loadConfig(cwd);
  if (config.error) fail(`${config.file} has a problem: ${config.error}`);
  const testCommand = testCommandFor(config, root);
  if (!testCommand)
    fail(`no test command found. Set "tests": { "command": "..." } in ${CONFIG_FILE}`);
  const head = commitOf("HEAD", root);
  if (!head) fail("this repository has no commit yet. Commit first: a pass is recorded for a commit.");
  // A pass is recorded for a commit, so the files on disk must be exactly that commit.
  // A new file that git does not know yet can make the tests pass here and fail for everyone else.
  const changes = () =>
    tryGit(["status", "--porcelain", config.tests.allowUntracked ? "--untracked-files=no" : "--untracked-files=normal"], root);
  const dirty = changes();
  if (dirty === null) fail("git could not report the state of the files. Nothing recorded.");
  if (dirty) {
    const rows = dirty.split("\n");
    fail(
      "the files here are not exactly what is committed:\n" +
        rows.slice(0, 8).map((row) => `  ${row}`).join("\n") +
        (rows.length > 8 ? `\n  ... and ${rows.length - 8} more` : "") +
        "\nA pass is recorded for a commit, so the tests must run on exactly that commit.\n" +
        "Commit, stash, or list files that are not part of the project in .gitignore.",
    );
  }
  process.stdout.write(`guardrails: running "${testCommand}" on ${head.slice(0, 8)}\n`);
  const started = Date.now();
  const run = spawnSync(testCommand, { cwd: root, stdio: "inherit", shell: true });
  const seconds = Math.round((Date.now() - started) / 1000);
  if (run.status !== 0) fail(`tests failed (exit ${run.status ?? "none"}) after ${seconds}s. Nothing recorded.`);
  if (commitOf("HEAD", root) !== head || tryGit(["status", "--porcelain", "--untracked-files=no"], root) !== "")
    fail("the code changed while the tests ran. Nothing recorded: run it again.");
  writeRecord(root, "tests", head, { head, command: testCommand, seconds });
  process.stdout.write(`guardrails: tests passed in ${seconds}s. Recorded for ${head.slice(0, 8)}.\n`);
}

function reviewStamp() {
  needRepo();
  const reportPath = option("report");
  if (!reportPath) fail("usage: guardrails review-stamp --report <file> [--head <ref>] [--reviewer <name>]");
  if (!fs.existsSync(reportPath) || !fs.statSync(reportPath).isFile()) fail(`no report file at ${reportPath}`);
  const head = headOf();
  const report = fs.readFileSync(reportPath, "utf8");
  if (!report.includes(head.slice(0, 8)))
    fail(`the report never names the commit ${head.slice(0, 8)}: it is not a review of this code`);
  const trailer = reviewTrailer(report);
  if (!trailer)
    fail("the report must end with three lines:\n  VERDICT: PASS\n  OPEN-CRITICAL: 0\n  OPEN-HIGH: 0");
  if (trailer.verdict !== "PASS" || trailer.openCritical > 0 || trailer.openHigh > 0)
    fail(
      `not recorded: verdict ${trailer.verdict}, open critical ${trailer.openCritical}, open high ${trailer.openHigh}.\n` +
        "Fix them, commit, and review the new commit.",
    );
  const saved = path.join(stateDir(cwd), "reports", `${head.slice(0, 8)}.md`);
  fs.mkdirSync(path.dirname(saved), { recursive: true });
  fs.copyFileSync(reportPath, saved);
  writeRecord(cwd, "review", head, { head, ...trailer, reviewer: option("reviewer") ?? "unspecified", report: saved });
  process.stdout.write(`guardrails: review recorded for ${head.slice(0, 8)}. Report kept at ${saved}\n`);
}

async function approve() {
  needRepo();
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    fail(
      "approve needs a real terminal with a person at it. An agent's shell has none.\n" +
        "In a chat, type the approval line instead (see the guard's message)." +
        (process.platform === "win32" ? "\nIn a Git Bash window, run it from PowerShell or Windows Terminal instead." : ""),
    );
  const config = loadConfig(cwd);
  const head = headOf();
  const subject = tryGit(["log", "-1", "--format=%s", head], cwd) ?? "";
  process.stdout.write(`\nYou are approving this commit for production:\n  ${head.slice(0, 8)}  ${subject}\n\n`);
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) =>
    prompt.question(`Type ${head.slice(0, 8)} to approve, anything else to cancel: `, resolve),
  );
  prompt.close();
  if (answer.trim().toLowerCase() !== head.slice(0, 8)) fail("cancelled. Nothing recorded.");
  const minutes = config.approval.maxAgeMinutes;
  writeRecord(cwd, "approval", head, {
    head,
    expiresAt: new Date(Date.now() + minutes * 60000).toISOString(),
    via: "terminal",
  });
  process.stdout.write(`Approved for ${minutes} minutes. The agent can now send the push again.\n`);
}

function check() {
  // Everything after "check" is the command to judge. Only --transcript <file> is ours.
  const words = [...rest];
  const at = words.indexOf("--transcript");
  const transcriptPath = at === -1 ? undefined : words[at + 1];
  if (at !== -1) words.splice(at, 2);
  const text = words.join(" ");
  if (!text) fail('usage: guardrails check "<shell command>"');
  // Shown only: `live` stays off, so nothing is written.
  const verdict = judgeCommand({ command: text, cwd, transcriptPath });
  process.stdout.write(`${verdict.decision.toUpperCase()}\n${verdict.reason ? `${verdict.reason}\n` : ""}`);
  process.exit(verdict.decision === "allow" ? 0 : 2);
}

function init() {
  const root = needRepo();
  const file = path.join(root, CONFIG_FILE);
  if (fs.existsSync(file)) fail(`${CONFIG_FILE} already exists`);
  const { onGuardError, ...defaults } = DEFAULTS;
  const config = { ...defaults, tests: { ...defaults.tests, command: detectTestCommand(root) }, onGuardError };
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  process.stdout.write(`guardrails: wrote ${file}\nEdit the branch lists and add your deploy commands under productionCommands.\n`);
  if (!config.tests.command)
    process.stdout.write(
      'No test command was found. Set "tests": { "command": "..." }, or "tests": { "required": false } for a project without tests.\n',
    );
  process.stdout.write("Next: guardrails install-hook, so that git itself checks every push a second time.\n");
}

function installPushHook() {
  needRepo();
  try {
    const { file, state } = installHook(cwd);
    process.stdout.write(
      state === "present"
        ? `guardrails: ${file} already runs the push check. Nothing to do.\n`
        : state === "linked"
          ? `guardrails: ${file} holds the lines of the push check. This clone now points them to this copy of the plugin.\n`
          : `guardrails: wrote ${file}\n` +
            "git now runs the push checks itself, with the commit and the branch it really sends.\n" +
            "To remove it, delete that file.\n",
    );
  } catch (error) {
    fail(error.message);
  }
}

const ZERO = /^0+$/;

/**
 * Called by git's pre-push hook: `gate <remote> <url>`, with one line per branch on the standard
 * input: <local ref> <local commit> <remote ref> <remote commit>.
 * Exit 0 lets the push go. Exit 1 stops it.
 */
async function gate() {
  // The check is for the agent, and the agent's shell carries a marker. A person decides for
  // themselves, at a terminal or with the push button of an editor: they get a note, and the push goes.
  // (`--terminal <0|1>`, sent by the hook of version 0.2.0, is not used any more.)
  const person = !isAgentShell();
  const stop = (lines) => {
    if (person) {
      const what = lines[0].replace(/^BLOCKED by guardrails: /, "");
      process.stderr.write(`guardrails: note: ${what} This check is for the agent, so it is your call.\n`);
      return;
    }
    process.stderr.write(`${lines.join("\n")}\n`);
    process.exit(1);
  };
  const root = repoRoot(cwd);
  if (!root) return;
  try {
    await gateRows(root, stop);
  } catch (error) {
    // A check that failed has not passed. One line says so, and a person is not locked out by it.
    stop([`BLOCKED by guardrails: the push check failed (${error?.message ?? error}), so this push was not checked.`]);
  }
}

async function gateRows(root, stop) {
  const config = loadConfig(cwd);
  if (config.error) return stop([`BLOCKED by guardrails: ${config.file ?? CONFIG_FILE} has a problem: ${config.error}`]);
  const rows = (await readStdin())
    .split("\n")
    .map((row) => row.trim().split(/\s+/))
    .filter((row) => row.length >= 4);
  for (const [, head, remoteRef, base] of rows) {
    if (!remoteRef.startsWith("refs/heads/")) continue;
    const dst = remoteRef.slice("refs/heads/".length);
    if (!isGuarded(dst, config)) continue;
    if (!ZERO.test(base) && !ZERO.test(head) && spawnSync("git", ["cat-file", "-e", `${base}^{commit}`], { cwd }).status !== 0) {
      // Without the commit the remote is on, nothing can be compared. Plain git refuses such a push too.
      stop([
        `BLOCKED by guardrails: the branch "${dst}" on the remote has commits that are not in this clone, so this push cannot be checked.`,
        "Fetch and bring them in first. Then send the push again.",
      ]);
      continue;
    }
    const forward = ZERO.test(base) || spawnSync("git", ["merge-base", "--is-ancestor", base, head], { cwd }).status === 0;
    if (ZERO.test(head) || !forward) {
      stop([
        `BLOCKED by guardrails: this would rewrite or delete the protected branch "${dst}".`,
        "History on a protected branch only moves forward. Push a new commit that fixes or reverts.",
      ]);
      continue;
    }
    if (head === base) continue;
    const names = ZERO.test(base)
      ? null
      : tryGit([...PLAIN_DIFF, "diff", "--name-only", "--no-renames", base, head], cwd);
    const changed = names === null ? null : names.split("\n").filter(Boolean);
    const state = pushGate({ folder: cwd, head, dst, changed, config });
    if (state.open) stop(notReady({ gate: state, head, dst, folder: root, config, cli: `node "${CLI_FILE}"` }));
  }
}

const commands = {
  status,
  test: runTests,
  "review-stamp": reviewStamp,
  approve,
  check,
  init,
  "install-hook": installPushHook,
  gate,
};
if (!command || !commands[command]) {
  process.stdout.write(USAGE);
  process.exit(command ? 1 : 0);
}
await commands[command]();
