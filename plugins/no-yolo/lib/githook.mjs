// The second check: git's own pre-push hook. git runs it with the commit and the branch it is
// really sending, after the shell and the git config have done their work. So a push is judged
// for what it does, however the command was written.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_MARKERS, slash, stateDir, tryGit } from "./core.mjs";

export const HOOK_MARK = "guardrails pre-push hook";
// The mark of the lines that go into another tool's hook.
export const BLOCK_MARK = "guardrails:gate";
export const CLI_FILE = slash(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "cli.mjs"));
// A small file next to the records. It says where this clone's copy of the guard is.
export const POINTER_NAME = "guard-path";

const quoted = (file) => file.replace(/[\\"$`]/g, "\\$&");
const unquoted = (text) => text.replace(/\\([\\"$`])/g, "$1");
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
// True in the agent's shell: it carries a marker that a person's shell does not have.
const IS_AGENT = `[ -n "${AGENT_MARKERS.map((name) => `$${name}`).join("")}" ]`;

/** The text of the hook. It names this copy of the guard, so it is written again after an update. */
export function hookText(cli = CLI_FILE) {
  return [
    "#!/bin/sh",
    `# ${HOOK_MARK}. Written by \`guardrails install-hook\`. Do not edit: it is written again when the plugin updates.`,
    "# git gives the guard the commit and the branch it is really sending.",
    `CLI="${quoted(cli)}"`,
    "problem=''",
    'command -v node >/dev/null 2>&1 || problem="node is not on the PATH of this shell"',
    '[ -f "$CLI" ] || problem="the guard has moved (a plugin update?). Run: guardrails install-hook"',
    'if [ -n "$problem" ]; then',
    '  echo "guardrails: $problem" >&2',
    "  # The check is for the agent, and its shell carries a marker. A broken install does not lock a person out.",
    `  ${IS_AGENT} || exit 0`,
    '  echo "guardrails: this push was not checked, so it is not sent." >&2',
    "  exit 1",
    "fi",
    'exec node "$CLI" gate "$@"',
    "",
  ].join("\n");
}

/** The hook as version 0.2.0 wrote it. A copy that nobody edited is replaced by the one above. */
function hookTextBefore(cli) {
  return [
    "#!/bin/sh",
    `# ${HOOK_MARK}. Written by \`guardrails install-hook\`. Do not edit: it is written again when the plugin updates.`,
    "# git gives the guard the commit and the branch it is really sending.",
    `CLI="${quoted(cli)}"`,
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

/**
 * The lines that run the check from inside another tool's hook (husky, git-lfs, a hook the team wrote).
 * git hands the list of branches to a hook once, on its standard input. The lines keep it, give it
 * to the guard, and hand it on, so the commands below them still read it.
 * They hold no path of this machine: where the guard is, is read from a small file inside the
 * clone's own git folder. So the lines can be committed with a shared hook, and a plugin update
 * only changes that small file. In a clone where the guard was never installed they do nothing.
 */
export function hookLines() {
  return [
    `# ${BLOCK_MARK}: the second check on a push. Keep these lines above every other command.`,
    "refs=$(cat)",
    `GUARD=$(cat "$(git rev-parse --git-common-dir)/guardrails/${POINTER_NAME}" 2>/dev/null)`,
    'if [ -n "$GUARD" ]; then',
    '  if [ -f "$GUARD" ] && command -v node >/dev/null 2>&1; then',
    `    printf '%s\\n' "$refs" | node "$GUARD" gate "$@" || exit 1`,
    `  elif ${IS_AGENT}; then`,
    '    echo "guardrails: the push check cannot run (node is missing, or the plugin has moved). Run: guardrails install-hook" >&2',
    "    exit 1",
    "  fi",
    "fi",
    "exec <<GUARDRAILS_REFS",
    "$refs",
    "GUARDRAILS_REFS",
    `# ${BLOCK_MARK}: end`,
  ];
}

/** The small file that tells the lines above where this clone's copy of the guard is, or null. */
function pointerFile(cwd) {
  const folder = stateDir(cwd);
  return folder ? `${folder}/${POINTER_NAME}` : null;
}

function pointsHere(cwd) {
  const file = pointerFile(cwd);
  return Boolean(file) && fs.existsSync(file) && same(fs.readFileSync(file, "utf8").trim(), CLI_FILE);
}

function writePointer(cwd) {
  const file = pointerFile(cwd);
  if (!file || pointsHere(cwd)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${CLI_FILE}\n`);
}

/** Where git looks for the pre-push hook of this repository (core.hooksPath is followed), or null. */
export function hookFile(cwd) {
  const folder = tryGit(["rev-parse", "--git-path", "hooks"], cwd);
  return folder ? slash(path.resolve(cwd, folder, "pre-push")) : null;
}

/**
 * The folder core.hooksPath names, when it is not the hooks folder inside this repository's own
 * git folder. Such a folder can serve every repository of the machine, or be committed with the project.
 */
function foreignHooksFolder(cwd) {
  if (!tryGit(["config", "core.hooksPath"], cwd)) return null;
  const used = tryGit(["rev-parse", "--git-path", "hooks"], cwd);
  const common = tryGit(["rev-parse", "--git-common-dir"], cwd);
  if (!used || !common) return null;
  const folder = slash(path.resolve(cwd, used));
  return same(folder, slash(path.resolve(cwd, common, "hooks"))) ? null : folder;
}

/**
 * What is in the place of the pre-push hook:
 *   "none"     nothing
 *   "current"  the guard's hook, written by this copy of the guard
 *   "stale"    the guard's hook, written by another copy or an older version, and not edited
 *   "edited"   the guard's hook, changed by hand
 *   "added"    another tool's hook that holds the guard's lines, and this clone points to this copy of the guard
 *   "moved"    another tool's hook that holds the guard's lines, and this clone points nowhere or to another copy
 *   "oldline"  another tool's hook that holds the one line version 0.2.0 advised
 *   "other"    another tool's hook, without the guard
 */
export function hookState(cwd) {
  const file = hookFile(cwd);
  if (!file || !fs.existsSync(file)) return "none";
  const text = fs.readFileSync(file, "utf8");
  if (text.includes(HOOK_MARK)) {
    if (text === hookText()) return "current";
    const cli = unquoted(text.match(/^CLI="(.*)"$/m)?.[1] ?? "");
    return text === hookText(cli) || text === hookTextBefore(cli) ? "stale" : "edited";
  }
  if (text.includes(BLOCK_MARK)) return pointsHere(cwd) ? "added" : "moved";
  // The one line that version 0.2.0 advised. It takes the list of branches away from the commands under it.
  return /cli\.mjs["']?\s+gate\b/.test(text) ? "oldline" : "other";
}

/**
 * Writes the hook: { file, state: "written" }. When the check already runs: { file, state: "present" }.
 * When another tool's hook holds the guard's lines and only the place of the guard had to be noted
 * again: { file, state: "linked" }. Throws, with what to do, when it must not write the hook.
 */
export function installHook(cwd) {
  const file = hookFile(cwd);
  if (!file) throw new Error("this folder is not inside a git repository");
  const state = hookState(cwd);
  if (state === "added" || state === "current") return { file, state: "present" };
  if (state === "moved") {
    writePointer(cwd);
    return { file, state: "linked" };
  }
  // No indent: the last lines must start in the first column.
  const lines = `\n\n${hookLines().join("\n")}\n\n`;
  if (state === "edited")
    throw new Error(
      `${file} is the guardrails hook, and it was changed by hand, so it is not written again.\n` +
        "For a fresh one, delete the file and run this command again. Lines you added will be gone: copy them first.",
    );
  if (state === "oldline") {
    writePointer(cwd);
    throw new Error(
      `${file} holds the one line that guardrails 0.2.0 advised. It takes the list of branches away from the commands under it.\n` +
        `Replace that line with these, at the top of the file, under the first line:${lines}` +
        "They keep the list of branches git sends, so the other commands in that file still get it.",
    );
  }
  if (state === "other") {
    // The lines read where the guard is from this small file, so it is written before they are added.
    writePointer(cwd);
    throw new Error(
      `${file} holds another tool's hook. It is kept as it is.\n` +
        `Put these lines at its top, under the first line (with husky: in .husky/pre-push):${lines}` +
        "They keep the list of branches git sends, so the other commands in that file still get it.\n" +
        "They hold no path of this machine, so they can be committed with a shared hook.",
    );
  }
  const shared = foreignHooksFolder(cwd);
  if (shared) {
    writePointer(cwd);
    throw new Error(
      `git runs the hooks of this repository from ${shared} (core.hooksPath).\n` +
        "That folder can serve other repositories too, or be committed with the project, so guardrails does not write there by itself.\n" +
        `Make ${file} yourself: "#!/bin/sh" as the first line, these lines under it, and make it executable:${lines}`.trimEnd(),
    );
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, hookText(), { mode: 0o755 });
  fs.chmodSync(file, 0o755);
  return { file, state: "written" };
}

/**
 * After a plugin update the hook still names the old copy. The guard writes it again, but only a
 * hook that nobody changed: lines a person added are theirs. Inside another tool's hook nothing
 * is written: only the small file that says where the guard is. Never throws.
 */
export function refreshHook(cwd) {
  try {
    const state = hookState(cwd);
    if (state === "stale" || state === "moved") installHook(cwd);
  } catch {
    // A hook that cannot be written again fails closed on its own.
  }
}
