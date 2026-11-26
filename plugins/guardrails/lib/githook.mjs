// The second check: git's own pre-push hook. git runs it with the commit and the branch it is
// really sending, after the shell and the git config have done their work. So a push is judged
// for what it does, however the command was written.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { slash, tryGit } from "./core.mjs";

export const HOOK_MARK = "guardrails pre-push hook";
export const CLI_FILE = slash(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "cli.mjs"));

/** The text of the hook. It names this copy of the guard, so it is written again after an update. */
export function hookText(cli = CLI_FILE) {
  const quoted = cli.replace(/[\\"$`]/g, "\\$&");
  return [
    "#!/bin/sh",
    `# ${HOOK_MARK}. Written by \`guardrails install-hook\`. Do not edit: it is written again when the plugin updates.`,
    "# git gives the guard the commit and the branch it is really sending.",
    `CLI="${quoted}"`,
    "# A person at their own terminal decides for themselves. An agent's shell has no terminal.",
    "terminal=0",
    "[ -t 2 ] && terminal=1",
    "problem=''",
    'command -v node >/dev/null 2>&1 || problem="node is not on the PATH of this shell"',
    '[ -f "$CLI" ] || problem="the guard has moved (a plugin update?). Run: guardrails install-hook"',
    'if [ -n "$problem" ]; then',
    '  echo "guardrails: $problem" >&2',
    "  # A broken install does not lock a person out. Anything else is refused.",
    '  [ "$terminal" = 1 ] && exit 0',
    '  echo "guardrails: this push was not checked, so it is not sent." >&2',
    "  exit 1",
    "fi",
    'exec node "$CLI" gate --terminal "$terminal" "$@"',
    "",
  ].join("\n");
}

/** Where git looks for the pre-push hook of this repository (core.hooksPath is followed), or null. */
export function hookFile(cwd) {
  const folder = tryGit(["rev-parse", "--git-path", "hooks"], cwd);
  return folder ? slash(path.resolve(cwd, folder, "pre-push")) : null;
}

/** "none", "current", "stale" (ours, written by another copy of the guard) or "other" (not ours). */
export function hookState(cwd) {
  const file = hookFile(cwd);
  if (!file || !fs.existsSync(file)) return "none";
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes(HOOK_MARK)) return "other";
  return text === hookText() ? "current" : "stale";
}

/** Writes the hook. Returns the file, or throws when another tool's hook is in the way. */
export function installHook(cwd) {
  const file = hookFile(cwd);
  if (!file) throw new Error("this folder is not inside a git repository");
  if (hookState(cwd) === "other")
    throw new Error(
      `${file} already holds another hook. Keep it, and add this line to it (with husky: to .husky/pre-push):\n` +
        `  node "${CLI_FILE}" gate "$@" || exit 1`,
    );
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, hookText(), { mode: 0o755 });
  fs.chmodSync(file, 0o755);
  return file;
}

/** After a plugin update the hook still names the old copy. The guard writes it again. Never throws. */
export function refreshHook(cwd) {
  try {
    if (hookState(cwd) === "stale") installHook(cwd);
  } catch {
    // A hook that cannot be written again fails closed on its own.
  }
}
