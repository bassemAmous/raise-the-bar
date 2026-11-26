#!/usr/bin/env node
// PreToolUse hook for shell commands. One process checks everything: secrets at commit, the
// push gates, the production lock, destructive commands.
import { decide, loadConfig, readStdin } from "../lib/core.mjs";
import { judgeCommand } from "../lib/judge.mjs";

let cwd = process.cwd();
try {
  const payload = JSON.parse((await readStdin()) || "{}");
  cwd = payload.cwd || cwd;
  const verdict = judgeCommand({
    command: payload.tool_input?.command,
    cwd,
    transcriptPath: payload.transcript_path,
  });
  decide(verdict.decision, verdict.reason);
} catch (error) {
  // A bug in the guard must not freeze every session, unless the project asked for strict.
  let strict = false;
  try {
    strict = loadConfig(cwd).onGuardError === "deny";
  } catch {
    // An unreadable config cannot ask for strict mode.
  }
  process.stderr.write(`guardrails: the guard itself failed: ${error?.message ?? error}\n`);
  if (strict) decide("deny", `guardrails could not check this command (${error?.message ?? error}).`);
  process.exit(0);
}
