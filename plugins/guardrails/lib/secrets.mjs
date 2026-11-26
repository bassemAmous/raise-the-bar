// Finds secrets in the lines a commit adds. Only public, well-known key formats and a few
// careful generic rules: a scanner that cries wolf gets switched off.
import fs from "node:fs";
import path from "node:path";
import { commitOf, matchesAny, repoRoot, tryGit } from "./core.mjs";

export const ALLOW_PRAGMA = "guardrails:allow-secret";

const PLACEHOLDER =
  /(example|placeholder|changeme|change-me|your[_-]?|dummy|sample|redacted|xxxx|\*\*\*\*|<[^>]*>|\$\{|\{\{|%\(|process\.env|os\.environ|import\.meta)/i;

// Passwords that every tutorial and every local docker-compose file uses.
const DEV_PASSWORDS = new Set([
  "postgres", "password", "passwd", "secret", "root", "admin", "test", "testing", "guest", "mysql", "mongo",
  "mongodb", "redis", "rabbitmq", "docker", "user", "username", "localdev", "development", "123456", "12345678",
]);
const LOCAL_HOSTS = /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|host\.docker\.internal)$/i;

function entropy(text) {
  const counts = new Map();
  for (const ch of text) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let bits = 0;
  for (const count of counts.values()) {
    const p = count / text.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

export const RULES = [
  { id: "private-key", pattern: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY(?: BLOCK)?-----/ },
  { id: "aws-access-key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: "github-token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/ },
  { id: "anthropic-key", pattern: /\bsk-ant-[A-Za-z0-9_-]{24,}/ },
  { id: "openai-key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}/ },
  { id: "stripe-live-key", pattern: /\b[sr]k_live_[A-Za-z0-9]{20,}\b/ },
  { id: "slack-token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{20,}/ },
  { id: "google-api-key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  {
    id: "url-with-password",
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/([^\s:/@'"]+):([^\s:/@'"]{6,})@([^\s/'":?#]+)/i,
    shown: 2,
    accept: ([, user, password, host]) =>
      !PLACEHOLDER.test(password) &&
      password !== user &&
      !DEV_PASSWORDS.has(password.toLowerCase()) &&
      !LOCAL_HOSTS.test(host),
  },
  {
    id: "hardcoded-secret",
    pattern:
      /(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key)["']?\s*[:=]\s*["']([^"'\s]{16,})["']/i,
    shown: 1,
    accept: (match) => !PLACEHOLDER.test(match[1]) && entropy(match[1]) >= 3.6,
  },
];

// Files that are secrets by their name alone. A .pem can be a public certificate, so it is
// judged by what is inside it (the private-key rule), not by its name.
const SECRET_FILE =
  /(^|\/)(\.env(\.(?!example$|sample$|template$|dist$)[^/]+)?|id_rsa|id_dsa|id_ecdsa|id_ed25519|[^/]+\.(p12|pfx|keystore|jks))$/i;

const mask = (text) => `${text.slice(0, 4)}…(${text.length} chars)`;

function scanLine(text, file, line, allowPaths, findings) {
  if (text.includes(ALLOW_PRAGMA) || matchesAny(file, allowPaths)) return;
  for (const rule of RULES) {
    const match = text.match(rule.pattern);
    if (!match || (rule.accept && !rule.accept(match))) continue;
    findings.push({ file, line, rule: rule.id, shown: mask(match[rule.shown ?? 0]) });
    return;
  }
}

/** Findings in a unified diff: added lines only, with the file and line they will have. */
export function scanDiff(diff, { allowPaths = [] } = {}) {
  const findings = [];
  let file = null;
  let line = 0;
  for (const row of diff.split("\n")) {
    if (row.startsWith("+++ ")) {
      file = row.slice(4).replace(/^b\//, "").trim();
      if (file === "/dev/null") file = null;
      continue;
    }
    const hunk = row.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunk) {
      line = Number(hunk[1]);
      continue;
    }
    if (!file || !row.startsWith("+") || row.startsWith("+++")) continue;
    scanLine(row.slice(1), file, line++, allowPaths, findings);
  }
  return findings;
}

/** Findings in a whole new file: every line counts as added. */
export function scanText(text, file, { allowPaths = [] } = {}) {
  const findings = [];
  text.split("\n").forEach((row, index) => scanLine(row, file, index + 1, allowPaths, findings));
  return findings;
}

export function secretFiles(names, { allowPaths = [] } = {}) {
  return names.filter((name) => SECRET_FILE.test(name) && !matchesAny(name, allowPaths));
}

const MAX_NEW_FILES = 5000;
const MAX_NEW_FILE_BYTES = 2 * 1024 * 1024;
const INTERACTIVE_ADD = new Set(["-p", "-i", "-e", "--patch", "--interactive", "--edit"]);
const rows = (text) => (text ?? "").split("\n").filter(Boolean);

/** The files not yet known to git that these `git add` calls would add, as paths from the root. */
function newFilesFor(adds, root) {
  const untracked = new Set(rows(tryGit(["-c", "core.quotePath=false", "ls-files", "-o", "--exclude-standard"], root)));
  if (untracked.size === 0) return [];
  const wanted = new Set();
  for (const add of adds) {
    const args = add.args.filter((arg) => !INTERACTIVE_ADD.has(arg));
    const out = add.folder
      ? tryGit(["-c", "core.quotePath=false", "add", "--dry-run", "--ignore-missing", ...args], add.folder)
      : null;
    // A dry run that fails tells us nothing, so every new file is taken as going in.
    if (out === null) return [...untracked];
    for (const row of rows(out)) {
      const match = row.match(/^add '(.*)'$/);
      if (match && untracked.has(match[1])) wanted.add(match[1]);
    }
  }
  return [...wanted];
}

/**
 * What `git commit` in this folder is about to record.
 *   tree: false  the commit takes what is staged now.
 *   tree: true   the commit also takes changes that are not staged yet (-a, named paths, or a
 *                `git add` earlier on the same command line), so the working files are read.
 *   adds         the `git add` calls that run first: [{ folder, args }]. Their new files are read too.
 * Returns { findings, files } or { error } when git could not say what the commit adds.
 */
export function scanCommit(folder, { tree = false, adds = [], allowPaths = [] } = {}) {
  let against = ["--cached"];
  if (tree) {
    // On a repository with no commit yet, compare with the empty tree.
    const base = commitOf("HEAD", folder) ?? tryGit(["hash-object", "-t", "tree", "--stdin"], folder);
    if (!base) return { error: "git could not name the commit to compare with" };
    against = [base];
  }
  const quiet = ["-c", "core.quotePath=false", "diff", ...against, "--no-color", "--no-ext-diff", "--no-renames"];
  const diff = tryGit([...quiet, "-U0", "--no-textconv"], folder);
  const changed = tryGit([...quiet, "--name-only", "--diff-filter=AM"], folder);
  if (diff === null || changed === null) return { error: "git could not list what this commit adds" };

  const findings = scanDiff(diff, { allowPaths });
  const files = rows(changed);
  if (adds.length) {
    const root = repoRoot(folder);
    const fresh = root ? newFilesFor(adds, root) : [];
    if (fresh.length > MAX_NEW_FILES)
      return {
        error: `${fresh.length} new files would be added, too many to read in one go. Add generated folders to .gitignore, or commit in smaller parts`,
      };
    for (const name of fresh) {
      files.push(name);
      try {
        const file = path.join(root, name);
        if (fs.statSync(file).size > MAX_NEW_FILE_BYTES) continue;
        const text = fs.readFileSync(file, "utf8");
        if (text.includes("\u0000")) continue; // binary
        findings.push(...scanText(text, name, { allowPaths }));
      } catch {
        // A file that vanished or cannot be read will not be committed either.
      }
    }
  }
  return { findings, files: secretFiles(files, { allowPaths }) };
}
