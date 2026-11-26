// Commands that destroy work or data in one line. Each rule is narrow on purpose: it names one
// catastrophe, so normal work is never refused. The rules read the programs a line runs, not
// its raw text, so a commit message or a search that only mentions a dangerous command passes.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { repoRoot, slash } from "./core.mjs";
import { gitCall, readCommit, resolveFolder } from "./shell.mjs";

const DELETERS = new Set(["rm", "rmdir", "rd", "del", "erase", "remove-item", "ri"]);
const SYSTEM_FOLDERS = new Set([
  "/etc", "/usr", "/var", "/home", "/bin", "/sbin", "/lib", "/boot", "/root", "/opt", "/users", "/system",
  "/library", "/applications", "c:/windows", "c:/users", "c:/program files", "c:/program files (x86)",
]);

function isRecursive(arg) {
  const flag = arg.toLowerCase().replace(/:\$?true$/, ""); // PowerShell's -Recurse:$true
  if (flag === "--recursive" || flag === "/s") return true;
  if (/^-r(?:e(?:c(?:u(?:r(?:se?)?)?)?)?)?$/.test(flag)) return true; // -r, and PowerShell's -Recurse
  return /^-[a-z]{1,3}$/.test(flag) && flag.includes("r") && !flag.startsWith("-fo");
}

const same = (a, b) => a.toLowerCase() === b.toLowerCase();
const isBigPlace = (place) =>
  place === "/" || /^[a-z]:\/?$/i.test(place) || same(place, slash(os.homedir())) || SYSTEM_FOLDERS.has(place.toLowerCase());

/**
 * True when the target is the git folder of a repository whose history would be lost: the
 * repository the command runs in, or one outside it. A .git nested below (a fresh clone, a
 * vendored template) is the caller's to remove.
 */
function isHistory(target, folder) {
  const wanted = slash(target).replace(/\/+$/, "");
  if (!/(?:^|\/)\.git$/i.test(wanted)) return false;
  const full = resolveFolder(folder, wanted);
  if (!full) return true; // a variable, or a folder this reader could not follow: not a risk to take
  if (!fs.existsSync(full)) return false;
  const root = folder && fs.existsSync(folder) ? repoRoot(folder) : null;
  if (!root) return true;
  const owner = slash(path.dirname(full));
  return !owner.toLowerCase().startsWith(`${root.toLowerCase()}/`);
}

/** The top of the repository a folder is in, or null. */
const repoAt = (folder) => (folder && fs.existsSync(folder) ? repoRoot(folder) : null);

/** True for a path whose deletion takes the disk, the home folder, a system folder or the git history. */
function isCatastrophic(target, call, takesHidden) {
  let wanted = slash(target).replace(/^(?:\$\{?HOME\}?|\$env:(?:USERPROFILE|HOME)|%USERPROFILE%)/i, "~");
  if (/^(?:\$\(pwd\)|\$\{?PWD\}?)$/.test(wanted)) wanted = ".";
  // "everything here": . and ./, then *, ./*, and the hidden files: .*
  const itself = /^\.\/?$/.test(wanted);
  const here = itself || /^(?:\.\/)?\*$/.test(wanted);
  const hidden = /^(?:\.\/)?\.\*$/.test(wanted);
  wanted = wanted.replace(/\/\*$/, "").replace(/\/+$/, "") || "/";
  if (here || hidden) {
    if (!call.folder) return false;
    if (isBigPlace(call.folder)) return true;
    // Hidden files go with .* and with PowerShell's -Force: at the top of a repository, .git goes too.
    return (hidden || takesHidden || itself) && same(repoAt(call.folder) ?? "", call.folder);
  }
  if (wanted === "~" || isBigPlace(wanted)) return true;
  if (process.platform === "win32" && /^\/[a-z]$/i.test(wanted)) return true; // Git Bash drive root
  if (isHistory(wanted, call.folder)) return true;
  // The same place written another way: /c/Users/me, ../.., ~/..
  const full = resolveFolder(call.folder, wanted);
  if (full === null) return false;
  if (isBigPlace(full)) return true;
  // The repository the command runs in, or a folder above it: the history goes with it.
  const root = repoAt(call.folder);
  return root !== null && `${root.toLowerCase()}/`.startsWith(`${full.toLowerCase()}/`);
}

function deletesEverything(call) {
  if (!DELETERS.has(call.program)) return false;
  if (!call.args.some(isRecursive)) return false;
  const takesHidden = call.args.some((arg) => /^-fo(?:r(?:ce?)?)?$/i.test(arg));
  return call.args.some((arg) => !arg.startsWith("-") && !/^\/[sq]$/i.test(arg) && isCatastrophic(arg, call, takesHidden));
}

function skipsHooks(git) {
  if (!git || !["commit", "push", "merge"].includes(git.verb)) return false;
  if (git.globals.some((setting) => /^core\.hookspath=/i.test(setting))) return true;
  return git.verb === "commit" ? readCommit(git.args).noVerify : git.args.includes("--no-verify");
}

// Programs whose arguments are a message or a search pattern: text about a command, not a command.
const TAKES_PROSE = new Set(["git", "gh", "grep", "egrep", "fgrep", "rg", "ag", "findstr", "select-string", "sls", "man"]);
// These only print. What they print matters when it is piped into another program.
const PRINTERS = new Set(["echo", "printf", "cat", "type", "write-host", "write-output"]);

/** The text a call hands to a program that could run it as a query. */
function queryText(call) {
  if (TAKES_PROSE.has(call.program)) return [];
  if (PRINTERS.has(call.program) && !call.pipe) return [];
  return [...call.args, ...call.heredocs];
}

const DROPS = [/\bdrop\s+(?:database|schema)\b/i, /\bdropDatabase\s*\(/];
const WIPES = [
  // DELETE FROM a table with nothing after it. A WHERE on the next line is a filter like any other.
  /\bdelete\s+from\s+[\w."`[\]]+\s*(?:;|$)/i,
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

/** The first rule broken by the calls of a command line (see readLine in shell.mjs), or null. */
export function dangerIn(calls) {
  for (const call of calls) {
    const git = gitCall(call);
    const rule = DANGER_RULES.find((candidate) => candidate.test(call, git));
    if (rule) return rule;
  }
  return null;
}
