#!/usr/bin/env node
// PreToolUse hook for file edits: the guard's own records and config are not for the agent.
import { decide, readStdin } from "../lib/core.mjs";
import { judgeEdit } from "../lib/judge.mjs";

try {
  const payload = JSON.parse((await readStdin()) || "{}");
  const input = payload.tool_input ?? {};
  const verdict = judgeEdit({
    filePath: input.file_path ?? input.notebook_path,
    transcriptPath: payload.transcript_path,
  });
  decide(verdict.decision, verdict.reason);
} catch (error) {
  process.stderr.write(`guardrails: the edit guard failed: ${error?.message ?? error}\n`);
  process.exit(0);
}
