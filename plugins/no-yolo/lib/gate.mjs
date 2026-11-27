// The push gate: what a commit needs before it may land on a protected branch.
// It is asked twice. The hook that reads the command asks it before the push runs, and the git
// pre-push hook asks it again with the commit and the branch git is really sending.
import { approvalFor } from "./approval.mjs";
import { CONFIG_FILE, matchesAny, repoRoot } from "./core.mjs";
import { readRecord, writeRecord } from "./records.mjs";
import { testCommandFor } from "./testcommand.mjs";

const short = (sha) => sha.slice(0, 8);

export const isGuarded = (branch, config) =>
  matchesAny(branch, [...config.protectedBranches, ...config.productionBranches]);

/**
 * The state of each check for `head` going to the branch `dst`:
 * { tests, review, approval, production, testCommand, open }.
 * A check reads "yes", "NO", or "not required (why)". `approval` is null off production.
 * `changed` lists the files the push changes on the remote branch, or is null when unknown.
 * `open` is true when at least one check says NO.
 */
export function pushGate({ folder, head, dst, changed, config, transcriptPath }) {
  const root = repoRoot(folder) ?? folder;
  const codeChanged = changed === null || changed.some((file) => !matchesAny(file, config.ignorePaths));
  const production = matchesAny(dst, config.productionBranches);
  const testCommand = testCommandFor(config, root);

  const check = (required, kind, canRun) => {
    if (!required) return "not required (switched off in the config)";
    if (!codeChanged) return "not required (docs only)";
    // A check that cannot run has not passed. Only a person switches a check off, in the config.
    if (!canRun) return "NO";
    return readRecord(folder, kind, head) ? "yes" : "NO";
  };
  const tests = check(config.tests.required, "tests", testCommand !== null);
  const review = check(config.review.required, "review", true);
  const given = production ? approvalFor({ cwd: folder, head, transcriptPath, config }) : null;
  const approval = production ? (given ? "yes" : "NO") : null;
  const open = tests === "NO" || review === "NO" || approval === "NO";

  // An approval typed in the chat lives in the session log, which git's own hook cannot read.
  // Once every check has passed, it is kept as a record with the same end time.
  if (!open && given?.via === "chat") {
    const expiresAt = new Date(Date.parse(given.at) + config.approval.maxAgeMinutes * 60000).toISOString();
    try {
      writeRecord(folder, "approval", head, { head, expiresAt, via: "chat" });
    } catch {
      // Without the record the second check asks again. It never opens anything.
    }
  }
  return { tests, review, approval, production, testCommand, open };
}

/** The message for a commit that is not ready: what is missing, and the steps in order. */
export function notReady({ gate, head, dst, folder, config, cli }) {
  const lines = [
    `BLOCKED by guardrails: commit ${short(head)} is not ready for "${dst}".`,
    "",
    `  tests passed for this exact code: ${gate.tests}`,
    `  review passed for this exact code: ${gate.review}`,
  ];
  if (gate.production) lines.push(`  approved by a human: ${gate.approval}`);
  lines.push("", `Do these in order, from ${folder}:`);
  let step = 1;
  if (gate.tests === "NO" && !gate.testCommand)
    lines.push(
      `  ${step++}. No test command was found, so the tests cannot run. A human sets one in ${CONFIG_FILE}:`,
      '       "tests": { "command": "<the command that runs your tests>" }',
      '     A project with no tests says so on purpose: "tests": { "required": false }',
    );
  else if (gate.tests === "NO")
    lines.push(
      `  ${step++}. Run the tests through the guard, so the pass is on record:`,
      `       guardrails test        (or: ${cli} test)`,
      "     Red: fix, commit, run it again. Tests run any other way leave no record.",
    );
  if (gate.review === "NO")
    lines.push(
      `  ${step++}. Run the skill no-yolo:you-shall-not-push. A read-only reviewer reads the diff,`,
      "     and the pass is recorded with:  guardrails review-stamp --report <file>",
      "     Test before you review: a fix after the review means a second review.",
    );
  if (gate.approval === "NO")
    lines.push(
      `  ${step++}. Production is locked until a human approves this commit. You cannot do this step.`,
      "     Stop, say what will ship, and ask the human to send this line as a message of its own:",
      `       ${config.approval.phrase} ${short(head)}`,
    );
  lines.push("", "Then send this exact push again, as its own command.");
  return lines;
}
