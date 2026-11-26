// Commands that destroy work or data in one line. Each rule is narrow on purpose: it names one
// catastrophe, so normal work is never refused. The rules read the programs a line runs, not
// its raw text, so a commit message or a search that only mentions a dangerous command passes.
import os from "node:os";
import { slash } from "./core.mjs";
import { callsIn, gitCall, readCommit } from "./shell.mjs";

const DELETERS = new Set(["rm", "rmdir", "rd", "del", "erase", "remove-item", "ri"]);
const SYSTEM_FOLDERS = new Set([
  "/etc", "/usr", "/var", "/home", "/bin", "/sbin", "/lib", "/boot", "/root", "/opt", "/users", "/system",
  "/library", "/applications", "c:/windows", "c:/users", "c:/program files", "c:/program files (x86)",
]);

function isRecursive(arg) {
  const flag = arg.toLowerCase();
  if (flag === "--recursive" || flag === "/s") return true;
  if (/^-r(?:e(?:c(?:u(?:r(?:se?)?)?)?)?)?$/.test(flag)) return true; // -r, and PowerShell's -Recurse
  return /^-[a-z]{1,3}$/.test(flag) && flag.includes("r") && !flag.startsWith("-fo");
}

/** True for a path whose deletion takes the disk, the home folder, a system folder or the git history. */
function isCatastrophic(target) {
  let wanted = slash(target).replace(/^(?:\$\{?HOME\}?|\$env:(?:USERPROFILE|HOME)|%USERPROFILE%)/i, "~");
  wanted = wanted.replace(/\/\*$/, "").replace(/\/+$/, "") || "/";
  if (wanted === "/" || wanted === "~" || /^[a-z]:$/i.test(wanted)) return true;
  if (process.platform === "win32" && /^\/[a-z]$/i.test(wanted)) return true; // Git Bash drive root
  if (wanted === ".git" || wanted.endsWith("/.git")) return true;
  if (wanted.toLowerCase() === slash(os.homedir()).toLowerCase()) return true;
  return SYSTEM_FOLDERS.has(wanted.toLowerCase());
}

function deletesEverything(call) {
  if (!DELETERS.has(call.program)) return false;
  if (!call.args.some(isRecursive)) return false;
  return call.args.some((arg) => !arg.startsWith("-") && !/^\/[sq]$/i.test(arg) && isCatastrophic(arg));
}

function skipsHooks(git) {
  if (!git || !["commit", "push", "merge"].includes(git.verb)) return false;
  if (git.globals.some((setting) => /^core\.hookspath=/i.test(setting))) return true;
  return git.verb === "commit" ? readCommit(git.args).noVerify : git.args.includes("--no-verify");
}

// Programs whose arguments are a message or a search pattern: text about a command, not a command.
const MESSAGE_PROGRAMS = new Set(["git", "gh", "grep", "egrep", "fgrep", "rg", "ag", "findstr", "select-string", "sls", "man"]);
// These only print. What they print matters when it is piped into another program.
const PRINTERS = new Set(["echo", "printf", "cat", "type", "write-host", "write-output"]);

/** The text a call hands to a program that could run it as a query. */
function queryText(call) {
  if (MESSAGE_PROGRAMS.has(call.program)) return [];
  if (PRINTERS.has(call.program) && !call.pipe) return [];
  return [...call.args, ...call.heredocs];
}

const DROPS = [/\bdrop\s+(?:database|schema)\b/i, /\bdropDatabase\s*\(/];
const WIPES = [
  /\bdelete\s+from\s+[\w."`[\]]+\s*(?:;|$)/im,
  /\bdelete\s+from\s+[\w."`[\]]+\s+where\s+(?:1\s*=\s*1|true)\b/i,
  /\btruncate\s+table\s+[\w."`[\]]+/i,
  /\b(?:deleteMany|updateMany|remove)\s*\(\s*\{\s*\}\s*[,)]/,
];
const matchesOneOf = (patterns) => (call) => queryText(call).some((text) => patterns.some((pattern) => pattern.test(text)));

function wipesHistory(call, git) {
  if (call.program === "git-filter-repo") return true;
  if (!git) return false;
  if (git.verb === "filter-branch" || git.verb === "filter-repo") return true;
  if (git.verb !== "reflog" || git.args[0] !== "expire") return false;
  return git.args.some(
    (arg, index) =>
      /^--expire(?:-unreachable)?=(?:now|all)$/.test(arg) ||
      (/^--expire(?:-unreachable)?$/.test(arg) && /^(?:now|all)$/.test(git.args[index + 1] ?? "")),
  );
}

export const DANGER_RULES = [
  {
    id: "delete-everything",
    test: deletesEverything,
    why: "This deletes the whole disk, your home folder, a system folder or the git history.",
  },
  {
    id: "skip-hooks",
    test: (call, git) => skipsHooks(git),
    why: "This skips the checks that protect this repository (--no-verify, -n, or a replaced hooks folder).",
  },
  { id: "drop-database", test: matchesOneOf(DROPS), why: "This drops a whole database." },
  {
    id: "delete-all-rows",
    test: matchesOneOf(WIPES),
    why: "This deletes or rewrites every row, with no filter.",
  },
  { id: "wipe-history", test: wipesHistory, why: "This rewrites or erases git history." },
];

/** The first rule a command line breaks, or null. `calls` can be passed when already read. */
export function dangerIn(command, calls = callsIn(command, null)) {
  for (const call of calls) {
    const git = gitCall(call);
    const rule = DANGER_RULES.find((candidate) => candidate.test(call, git));
    if (rule) return rule;
  }
  return null;
}
