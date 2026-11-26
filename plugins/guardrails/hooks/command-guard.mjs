#!/usr/bin/env node
// PreToolUse hook for shell commands. One process checks everything: secrets at commit, the
// push gates, the production lock, destructive commands.
import { decide, loadConfig, readStdin, startTimeBudget } from "../lib/core.mjs";
import { judgeCommand } from "../lib/judge.mjs";

// The hook is stopped at 30 seconds (hooks.json), and a hook that is stopped blocks nothing.
// The checks get less, so a slow git ends in a refusal that arrives in time.
const TIME_BUDGET_MS = 24000;
// Words of a line that can put code into history, onto a remote or into production.
const MAY_SHIP_CODE = /(?<![\w-])(?:commit|push|merge|rebase|cherry-pick|revert|am|deploy|release|publish)(?![\w-])/i;

let cwd = process.cwd();
let command = "";
try {
  startTimeBudget(TIME_BUDGET_MS);
  const payload = JSON.parse((await readStdin()) || "{}");
  cwd = payload.cwd || cwd;
  command = String(payload.tool_input?.command ?? "");
  const verdict = judgeCommand({
    command,
    cwd,
    transcriptPath: payload.transcript_path,
    shell: payload.tool_name === "PowerShell" ? "powershell" : "bash",
  });
  decide(verdict.decision, verdict.reason);
} catch (error) {
  // A guard that crashed checked nothing. A line that cannot ship code stays free, so a bug here
  // never blocks `ls`. A line that can is refused until the guard works again.
  const why = `${error?.guardStage ? `the check "${error.guardStage}"` : "the guard"} failed: ${error?.message ?? error}`;
  process.stderr.write(`guardrails: ${why}\n`);
  let strict = MAY_SHIP_CODE.test(command);
  try {
    strict ||= loadConfig(cwd).onGuardError === "deny";
  } catch {
    strict = true;
  }
  if (strict)
    decide("deny", `BLOCKED by guardrails: ${why}.\nThis command was not checked, so it is not let through. Send it again, or ask a human to look.`);
  process.exit(0);
}
