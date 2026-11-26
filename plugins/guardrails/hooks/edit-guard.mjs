#!/usr/bin/env node
// PreToolUse hook for file edits: the guard's own records and config are not for the agent.
import { decide, loadConfig, readStdin } from "../lib/core.mjs";
import { judgeEdit } from "../lib/judge.mjs";

// Paths the guard protects. When the guard itself fails, an edit to one of them is refused.
const PROTECTED_PLACE = /guardrails|[\\/]\.git[\\/]|\.jsonl$/i;

let cwd = process.cwd();
let filePath = "";
try {
  const payload = JSON.parse((await readStdin()) || "{}");
  const input = payload.tool_input ?? {};
  cwd = payload.cwd || cwd;
  filePath = String(input.file_path ?? input.notebook_path ?? "");
  const verdict = judgeEdit({ filePath, transcriptPath: payload.transcript_path });
  decide(verdict.decision, verdict.reason);
} catch (error) {
  const why = `the edit guard failed: ${error?.message ?? error}`;
  process.stderr.write(`guardrails: ${why}\n`);
  let strict = PROTECTED_PLACE.test(filePath);
  try {
    strict ||= loadConfig(cwd).onGuardError === "deny";
  } catch {
    strict = true;
  }
  if (strict) decide("deny", `BLOCKED by guardrails: ${why}.\nThis edit was not checked, so it is not let through.`);
  process.exit(0);
}
