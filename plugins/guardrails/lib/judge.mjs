// The decisions. Pure enough to test: a command or a file path goes in, a verdict comes out.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { approvalFor } from "./approval.mjs";
import { CONFIG_FILE, commitOf, loadConfig, matchesAny, repoRoot, slash } from "./core.mjs";
import { dangerIn } from "./danger.mjs";
import { gitCalls, pushesIn, resolveTarget } from "./push.mjs";
import { readRecord } from "./records.mjs";
import { scanCommit } from "./secrets.mjs";

const PLUGIN_ROOT = slash(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
const CLI = `node "${PLUGIN_ROOT}/cli.mjs"`;

const ALLOW = { decision: "allow" };
const deny = (lines) => ({ decision: "deny", reason: lines.join("\n") });
const ask = (lines) => ({ decision: "ask", reason: lines.join("\n") });

const RECORD_FOLDER = /\.git[\\/]+guardrails\b/;
const APPROVE_COMMAND = /\bguardrails(?:\.cmd)?["']?\s+approve\b|\bcli\.mjs["']?\s+approve\b/;
const READ_ONLY_START = /^\s*(?:cat|type|less|more|head|tail|grep|rg|bat|wc|ls|dir|stat|file|jq|git\s+(?:diff|log|show|status|blame))\b/;

export function detectTestCommand(root) {
  const has = (name) => fs.existsSync(path.join(root, name));
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
  if (has("pytest.ini") || has("tox.ini") || (has("pyproject.toml") && has("tests"))) return "python -m pytest";
  if (has("gradlew")) return "./gradlew test";
  if (has("pom.xml")) return "mvn -q test";
  return null;
}

export function testCommandFor(config, root) {
  return config.tests.command ?? detectTestCommand(root);
}

const short = (sha) => sha.slice(0, 8);

// The session log is where a typed approval is read from, so the agent may read it, not write it.
const SESSION_LOG = /[\\/]\.claude[\\/]+projects[\\/][^\s"']*\.jsonl\b/;

function touchesSessionLog(text, transcriptPath) {
  if (SESSION_LOG.test(text)) return true;
  const name = transcriptPath ? path.posix.basename(slash(transcriptPath)) : "";
  return name.length > 8 && text.includes(name);
}

function judgeSelfProtection(command, transcriptPath) {
  if (APPROVE_COMMAND.test(command))
    return deny([
      "BLOCKED by guardrails: the approval is the one step an agent may not do.",
      "Stop here and ask the human to approve. Tell them the exact line to type in the chat.",
    ]);
  if (RECORD_FOLDER.test(command))
    return deny([
      "BLOCKED by guardrails: the record folder is written only by the guardrails command.",
      `To see what is on record, run: guardrails status   (or: ${CLI} status)`,
    ]);
  if (touchesSessionLog(command, transcriptPath) && !READ_ONLY_START.test(command))
    return deny([
      "BLOCKED by guardrails: the session log is the record of what the human typed.",
      "An agent may read it. It is never written or changed by a command.",
    ]);
  if (command.includes(CONFIG_FILE) && !READ_ONLY_START.test(command))
    return ask([
      `This command touches ${CONFIG_FILE}, the file that sets what the guardrails protect.`,
      "A human should confirm a change to it.",
    ]);
  return null;
}

function judgeCommit(command, cwd, config) {
  if (!config.secretScan.enabled) return null;
  for (const call of gitCalls(command, cwd)) {
    if (call.verb !== "commit") continue;
    const all = /(?:^|\s)-[a-zA-Z]*a[a-zA-Z]*(?:\s|$)|--all\b/.test(call.rest);
    const { findings, files } = scanCommit(call.folder, { all, allowPaths: config.secretScan.allowPaths });
    if (findings.length === 0 && files.length === 0) continue;
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
  return null;
}

function judgePush(push, config, transcriptPath) {
  const guarded = [...config.protectedBranches, ...config.productionBranches];
  if (push.unreadable)
    return deny([
      "BLOCKED by guardrails: this push names its branch or commit through a shell variable,",
      "so the guard cannot see where it goes. Write the branch and the commit id themselves,",
      "for example: git push origin 3f2a9c1e:staging",
    ]);

  for (const target of push.targets) {
    if (!matchesAny(target.dst, guarded)) continue;

    if (push.force || target.forced || target.deletes)
      return deny([
        `BLOCKED by guardrails: this would rewrite or delete the protected branch "${target.dst}".`,
        "History on a protected branch only moves forward. Push a new commit that fixes or reverts.",
        "A human who really means it can run the command in their own terminal.",
      ]);

    const resolved = resolveTarget(push, target);
    if (!resolved) continue;
    const { head, changed } = resolved;
    const root = repoRoot(push.folder) ?? push.folder;
    const codeChanged = changed === null || changed.some((file) => !matchesAny(file, config.ignorePaths));
    const production = matchesAny(target.dst, config.productionBranches);

    const needsTests =
      codeChanged && config.tests.required && testCommandFor(config, root) && !readRecord(push.folder, "tests", head);
    const needsReview = codeChanged && config.review.required && !readRecord(push.folder, "review", head);
    const needsApproval =
      production && !approvalFor({ cwd: push.folder, head, transcriptPath, config });
    if (!needsTests && !needsReview && !needsApproval) continue;

    const lines = [
      `BLOCKED by guardrails: commit ${short(head)} is not ready for "${target.dst}".`,
      "",
      `  tests passed for this exact code: ${needsTests ? "NO" : "yes"}`,
      `  review passed for this exact code: ${needsReview ? "NO" : "yes"}`,
    ];
    if (production) lines.push(`  approved by a human: ${needsApproval ? "NO" : "yes"}`);
    lines.push("", `Do these in order, from ${push.folder}:`);
    let step = 1;
    if (needsTests)
      lines.push(
        `  ${step++}. Run the tests through the guard, so the pass is on record:`,
        `       guardrails test        (or: ${CLI} test)`,
        "     Red: fix, commit, run it again. Tests run any other way leave no record.",
      );
    if (needsReview)
      lines.push(
        `  ${step++}. Run the skill guardrails:push-review. A read-only reviewer reads the diff,`,
        "     and the pass is recorded with:  guardrails review-stamp --report <file>",
        "     Test before you review: a fix after the review means a second review.",
      );
    if (needsApproval)
      lines.push(
        `  ${step++}. Production is locked until a human approves this commit. You cannot do this step.`,
        "     Stop, say what will ship, and ask the human to type this line in the chat:",
        `       ${config.approval.phrase} ${short(head)}`,
      );
    lines.push("", "Then send this exact push again.");
    return deny(lines);
  }
  return null;
}

function judgeProductionCommand(command, cwd, config, transcriptPath) {
  const pattern = (config.productionCommands ?? []).find((source) => new RegExp(source, "i").test(command));
  if (!pattern) return null;
  const head = commitOf("HEAD", cwd);
  if (approvalFor({ cwd, head: head ?? "", transcriptPath, config })) return null;
  return deny([
    "BLOCKED by guardrails: this command reaches production, and production is locked.",
    `  matched: ${pattern}`,
    "",
    "You cannot approve this yourself. Stop, say exactly what the command will change,",
    "and ask the human to type this line in the chat:",
    `  ${config.approval.phrase} ${head ? short(head) : "now"}`,
    "Then send the same command again.",
  ]);
}

/** Verdict for a shell command: { decision: "allow" | "deny" | "ask", reason? } */
export function judgeCommand({ command, cwd, transcriptPath }) {
  const text = String(command ?? "");
  if (!text.trim()) return ALLOW;
  const config = loadConfig(cwd);

  const self = judgeSelfProtection(text, transcriptPath);
  if (self) return self;

  if (config.dangerGuard.enabled) {
    const danger = dangerIn(text);
    if (danger)
      return deny([
        `BLOCKED by guardrails (${danger.id}): ${danger.why}`,
        "If a human really wants this, they run it in their own terminal.",
      ]);
  }

  if (/\bgit\b/.test(text)) {
    const commit = judgeCommit(text, cwd, config);
    if (commit) return commit;
    for (const push of pushesIn(text, cwd)) {
      const verdict = judgePush(push, config, transcriptPath);
      if (verdict) return verdict;
    }
  }

  return judgeProductionCommand(text, cwd, config, transcriptPath) ?? ALLOW;
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
