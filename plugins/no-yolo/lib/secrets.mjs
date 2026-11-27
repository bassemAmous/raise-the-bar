// Finds secrets in the lines a commit adds. Only public, well-known key formats and a few
// careful generic rules: a scanner that cries wolf gets switched off.
import fs from "node:fs";
import path from "node:path";
import { PLAIN_DIFF, commitOf, gitBytes, matchesAny, repoRoot, tryGit } from "./core.mjs";

export const ALLOW_PRAGMA = "guardrails:allow-secret";

// Text that stands where a secret will be at run time.
const PLACEHOLDER =
  /(example|placeholder|changeme|change-me|your[_-]?|dummy|sample|redacted|xxxx|\*\*\*\*|<[^>]*>|\$\{|\{\{|#\{|%\(|%s|process\.env|os\.environ|import\.meta)/i;
const NOT_A_VALUE = [
  /^\$[A-Za-z_]/, // $DB_PASSWORD: a variable
  /^\{[^{}]*\}$/, // {password}: a field of a format string
  /^[A-Z]+(?:_[A-Z0-9]+)+$|^[A-Z]+\d{0,3}$/, // NEXT_PUBLIC_API_KEY, TOKEN123: a name
  /^(?:arn:|vault:|op:\/\/|ssm:|env:|file:|projects\/|\/run\/secrets)/i, // a pointer into a secrets store
  /^\$(?:2[abxy]|argon2|scrypt|pbkdf2)/, // a password hash
  /^\^|\(\?[=!:]|\\[dws]/, // a regular expression
];
const isNotAValue = (value) => NOT_A_VALUE.some((shape) => shape.test(value));

// Passwords that every tutorial and every local docker-compose file uses.
const DEV_PASSWORDS = new Set([
  "postgres", "password", "passwd", "secret", "root", "admin", "test", "testing", "guest", "mysql", "mongo",
  "mongodb", "redis", "rabbitmq", "docker", "user", "username", "localdev", "development", "123456", "12345678",
]);
const WEAK_WORDS = /pass|test|example|demo|secret|admin|change|welcome|qwerty|1234/i;
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

/** True for a value that reads as generated, not as words: my-app-database-credentials is a name. */
function looksRandom(value) {
  if (/\d/.test(value)) return entropy(value) >= 3.5;
  return value.length >= 24 && entropy(value) >= 4.1;
}

/** A short password still counts when it mixes three kinds of characters and is not a common word. */
function isStrongShort(value) {
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((kind) => kind.test(value)).length;
  return kinds >= 3 && !WEAK_WORDS.test(value);
}

// The web config of Firebase holds a key that is public by design.
const FIREBASE_WEB_KEY = /\bapiKey["']?\s*:/;
const FIREBASE_APP_FILE = /(?:^|\/)(?:google-services\.json|GoogleService-Info\.plist)$/;

// Each rule: a pattern, the group to show (masked), and an optional `accept(match, file, text)`
// that looks closer. `files` limits a rule to file names where its shape means a setting.
// `generic` marks a rule that knows a secret by the name next to it, not by its own format:
// there a variable, a name in capitals or a pointer into a store is not a value.
export const RULES = [
  // The header of a key file. A sentence that only quotes the header is not a key.
  { id: "private-key", pattern: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY(?: BLOCK)?-----(?=\s*$|\\[rn]|\s*[A-Za-z0-9+/=]{24,})/ },
  { id: "aws-access-key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: "aws-secret-key", pattern: /aws_?secret_?access_?key["']?\s*[:=]\s*["']?([A-Za-z0-9/+]{40})(?![A-Za-z0-9/+])/i, shown: 1 },
  { id: "github-token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/ },
  { id: "gitlab-token", pattern: /\bglpat-[A-Za-z0-9_-]{20,}/ },
  { id: "anthropic-key", pattern: /\bsk-ant-[A-Za-z0-9_-]{24,}/ },
  {
    id: "openai-key",
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}/,
    // A long CSS class name can start with sk- too. A key has digits and capitals.
    accept: (match) => /\d/.test(match[0]) && /[A-Z]/.test(match[0]),
  },
  { id: "stripe-live-key", pattern: /\b[sr]k_live_[A-Za-z0-9]{20,}\b/ },
  { id: "stripe-webhook-secret", pattern: /\bwhsec_[A-Za-z0-9]{24,}/ },
  { id: "slack-token", pattern: /\bxox[abeprs]-[A-Za-z0-9-]{20,}|\bxapp-\d-[A-Za-z0-9-]{20,}/ },
  { id: "slack-webhook", pattern: /https:\/\/hooks\.slack\.com\/services\/T\w+\/B\w+\/\w{16,}/ },
  { id: "sendgrid-key", pattern: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/ },
  {
    id: "google-api-key",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/,
    accept: (match, file, text) => !FIREBASE_WEB_KEY.test(text) && !FIREBASE_APP_FILE.test(file),
  },
  { id: "azure-storage-key", pattern: /\bAccountKey=([A-Za-z0-9+/]{40,}={0,2})/, shown: 1 },
  { id: "json-web-token", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  {
    id: "bearer-token",
    generic: true,
    pattern: /\bBearer\s+([A-Za-z0-9._~+/-]{24,}=*)/,
    shown: 1,
    accept: (match) => looksRandom(match[1]),
  },
  {
    id: "url-with-password",
    generic: true,
    // The scheme is short on purpose: an open-ended one makes a very long line slow to read.
    pattern: /\b[a-z][a-z0-9+.-]{1,30}:\/\/([^\s:/@'"]*):([^\s:/@'"]{6,})@([^\s/'":?#]+)/i,
    shown: 2,
    accept: ([, user, password, host]) =>
      password !== user && !DEV_PASSWORDS.has(password.toLowerCase()) && !LOCAL_HOSTS.test(host),
  },
  {
    id: "hardcoded-secret",
    generic: true,
    pattern:
      /(password|passwd|pwd|secret(?:[_-]?key)?|secret[_-]?access[_-]?key|api[_-]?(?:key|token)|(?:access|auth|refresh)[_-]?token|private[_-]?key|client[_-]?secret|token)["']?\s*(?:=>|[:=])\s*["']([^"'\s]{8,})["']/i,
    shown: 2,
    accept: ([, name, value], file, text) => {
      if (value.startsWith("AIza") && FIREBASE_WEB_KEY.test(text)) return false;
      if (value.length >= 16) return looksRandom(value);
      return /^p/i.test(name) && !name.toLowerCase().startsWith("private") && isStrongShort(value);
    },
  },
  {
    // key: value and KEY=value with no quotes, in the file types where that is a setting.
    id: "config-secret",
    generic: true,
    files: /(?:\.(?:ya?ml|env|properties|ini|conf|cfg|toml)|(?:^|\/)\.env[^/]*)$/i,
    pattern:
      /^\s*(?:export\s+)?[\w.-]*(?:password|passwd|pwd|secret|secret[_-]?key|api[_-]?key|access[_-]?key|token)\s*[:=]\s*([^\s"']\S{11,})(?:\s+#.*)?\s*$/i,
    shown: 1,
    accept: (match) => /\d/.test(match[1]) && /[A-Za-z]/.test(match[1]) && entropy(match[1]) >= 3,
  },
  {
    // curl -u name:password
    id: "basic-auth",
    generic: true,
    pattern: /\bcurl\b.*\s(?:-u|--user)\s+["']?[^\s:"']+:([^\s"']{8,})/,
    shown: 1,
    accept: (match) => /\d/.test(match[1]) && /[A-Za-z]/.test(match[1]),
  },
];

// Files that are secrets by their name alone. A .pem or a .key can be a public certificate (or
// a slide deck), so those are judged by what is inside them: the private-key rule.
const SECRET_FILE =
  /(^|\/)(\.env(\.(?!example$|sample$|template$|dist$|defaults$)[^/]+)?|\.envrc|(?!example\.|sample\.|template\.)[^/]+\.env|id_rsa|id_dsa|id_ecdsa|id_ed25519|[^/]+\.(p12|pfx|keystore|jks|tfstate|tfvars)|[^/]+\.tfstate\.backup|[^/]+\.tfvars\.json)$/i;

const mask = (text) => `${text.slice(0, 4)}…(${text.length} chars)`;

/** The first rule a line breaks: { rule, shown }, or null. */
function hitIn(text, file) {
  for (const rule of RULES) {
    if (rule.files && !rule.files.test(file)) continue;
    const match = text.match(rule.pattern);
    if (!match) continue;
    const value = match[rule.shown ?? 0];
    if (PLACEHOLDER.test(value) || (rule.generic && isNotAValue(value))) continue;
    if (rule.accept && !rule.accept(match, file, text)) continue;
    return { rule: rule.id, shown: mask(value) };
  }
  return null;
}

const newReport = () => ({ findings: [], waived: [] });

/**
 * A hit goes to `findings`. A hit on a line that carries the allow comment goes to `waived`:
 * the comment can be written by anyone, so the caller asks a human instead of trusting it.
 */
function scanLine(text, file, line, allowPaths, report) {
  if (matchesAny(file, allowPaths)) return;
  const hit = hitIn(text, file);
  if (hit) (text.includes(ALLOW_PRAGMA) ? report.waived : report.findings).push({ file, line, ...hit });
}

function readDiff(diff, allowPaths, report) {
  const binaries = [];
  let file = null;
  let line = 0;
  let header = false; // between "diff --git" and the first "@@": the only place file names are
  for (const row of diff.split("\n")) {
    if (row.startsWith("diff --git ")) {
      header = true;
      file = null;
      continue;
    }
    if (header) {
      if (row.startsWith("+++ ")) {
        file = row.slice(4).replace(/^b\//, "").trim();
        if (file === "/dev/null") file = null;
        continue;
      }
      const binary = row.match(/^Binary files .* and b\/(.+) differ$/);
      if (binary) binaries.push(binary[1]);
    }
    const hunk = row.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunk) {
      header = false;
      line = Number(hunk[1]);
      continue;
    }
    if (header || !file || !row.startsWith("+")) continue;
    scanLine(row.slice(1), file, line++, allowPaths, report);
  }
  return binaries;
}

function readText(text, file, allowPaths, report) {
  text.split("\n").forEach((row, index) => scanLine(row, file, index + 1, allowPaths, report));
}

/** Findings in a unified diff: added lines only, with the file and line they will have. */
export function scanDiff(diff, { allowPaths = [] } = {}) {
  const report = newReport();
  readDiff(diff, allowPaths, report);
  return report.findings;
}

/** Findings in a whole new file: every line counts as added. */
export function scanText(text, file, { allowPaths = [] } = {}) {
  const report = newReport();
  readText(text, file, allowPaths, report);
  return report.findings;
}

export const COMMIT_MESSAGE = "(commit message)";

/** A commit message goes into history like any file: { findings, waived } for its text. */
export function scanMessage(text) {
  const report = newReport();
  readText(String(text ?? ""), COMMIT_MESSAGE, [], report);
  return report;
}

export function secretFiles(names, { allowPaths = [] } = {}) {
  return names.filter((name) => SECRET_FILE.test(name) && !matchesAny(name, allowPaths));
}

/**
 * The text in a file's bytes, or null for a real binary. Windows PowerShell writes UTF-16 with
 * `>`, which git and a plain read both take for binary: it is text, and it is read.
 */
export function textIn(bytes) {
  const swapped = () => Buffer.from(bytes.subarray(0, bytes.length - (bytes.length % 2))).swap16();
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString("utf16le");
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return swapped().toString("utf16le").slice(1);
  const sample = bytes.subarray(0, 8192);
  if (!sample.includes(0)) return bytes.toString("utf8");
  let even = 0;
  let odd = 0;
  sample.forEach((byte, index) => {
    if (byte === 0) index % 2 ? odd++ : even++;
  });
  const half = sample.length / 2;
  if (odd > half * 0.6 && even < half * 0.1) return bytes.toString("utf16le");
  if (even > half * 0.6 && odd < half * 0.1) return swapped().toString("utf16le");
  return null;
}

const MAX_NEW_FILES = 5000;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const INTERACTIVE_ADD = new Set(["-p", "-i", "-e", "--patch", "--interactive", "--edit"]);
const FORCED_ADD = /^(?:--force|-[a-zA-Z]*f[a-zA-Z]*)$/;
// A path the shell rewrites before git sees it: a variable, a command, or a brace list ({a,b}.js).
const UNREADABLE_PATH = /[$`{}]/;
const rows = (text) => (text ?? "").split("\n").filter(Boolean);
// File names as they are, and a diff in one fixed form whatever the person's own diff settings say.
const QUIET = PLAIN_DIFF;

/** The files not yet known to git that these `git add` calls would add, as paths from the root. */
function newFilesFor(adds, root) {
  // `git add -f` also takes files that .gitignore hides, so those are listed too.
  const forced = adds.some((add) => add.args.some((arg) => FORCED_ADD.test(arg)));
  const listing = [...QUIET, "ls-files", "-o", ...(forced ? [] : ["--exclude-standard"])];
  const listed = tryGit(listing, root);
  // A listing that failed is not an empty one: the caller refuses the commit instead of reading nothing.
  if (listed === null) return null;
  const untracked = new Set(rows(listed));
  if (untracked.size === 0) return [];
  const wanted = new Set();
  for (const add of adds) {
    const args = add.args.filter((arg) => !INTERACTIVE_ADD.has(arg));
    // A path the shell rewrites first cannot be tried here, so every new file is taken as going in.
    if (args.some((arg) => !arg.startsWith("-") && UNREADABLE_PATH.test(arg))) return [...untracked];
    const out = add.folder ? tryGit([...QUIET, "add", "--dry-run", "--ignore-missing", ...args], add.folder) : null;
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
 *   scope: null             the commit takes what is staged now.
 *   scope: [{ folder, paths }]  it also takes these paths as they are on disk (named on the
 *                           commit, or by a `git add` earlier on the same command line).
 *   scope: "all"            it takes every changed file as it is on disk (-a, git add -A).
 *   adds                    the `git add` calls that run first: [{ folder, args }]. Files git
 *                           does not know yet are read from disk.
 * Returns { findings, waived, files } or { error } when the commit could not be read.
 */
export function scanCommit(folder, { scope = null, adds = [], allowPaths = [] } = {}) {
  const root = repoRoot(folder);
  if (!root) return { error: "git could not find the repository" };
  const report = newReport();
  const names = new Set();
  const failed = { error: "git could not list what this commit adds" };

  // Reads one diff: `against` is ["--cached"] (staged) or [commit] (the files on disk).
  const read = (against, where, paths) => {
    const diff = [...QUIET, "diff", "--no-color", "--no-ext-diff", "--no-renames", ...against];
    const only = paths.length ? ["--", ...paths] : [];
    const text = tryGit([...diff, "-U0", "--no-textconv", "--src-prefix=a/", "--dst-prefix=b/", ...only], where);
    const changed = tryGit([...diff, "--name-only", "--diff-filter=AM", ...only], where);
    if (text === null || changed === null) return false;
    for (const name of rows(changed)) names.add(name);
    for (const name of readDiff(text, allowPaths, report)) {
      // git calls a UTF-16 file binary and shows no lines for it. Read it whole.
      const staged = against[0] === "--cached";
      let bytes = null;
      if (staged) bytes = gitBytes(["show", `:${name}`], root);
      else if (fs.existsSync(path.join(root, name))) bytes = fs.readFileSync(path.join(root, name));
      const content = bytes && bytes.length <= MAX_FILE_BYTES ? textIn(bytes) : null;
      if (content !== null) readText(content, name, allowPaths, report);
    }
    return true;
  };

  const parts = scope === "all" ? [] : (scope ?? []);
  let whole = scope === "all" || parts.some((part) => !part.folder || part.paths.some((p) => UNREADABLE_PATH.test(p)));
  let base = null;
  if (scope) {
    // On a repository with no commit yet, compare with the empty tree.
    base = commitOf("HEAD", folder) ?? tryGit(["hash-object", "-t", "tree", "--stdin"], folder);
    if (!base) return { error: "git could not name the commit to compare with" };
  }
  if (!whole) {
    if (!read(["--cached"], folder, [])) return failed;
    // A path git cannot follow from there: read every changed file instead of guessing.
    whole = parts.some((part) => !read([base], part.folder, part.paths));
  }
  if (whole && !read([base], folder, [])) return failed;

  if (adds.length) {
    const fresh = newFilesFor(adds, root);
    if (fresh === null) return failed;
    if (fresh.length > MAX_NEW_FILES)
      return {
        error: `${fresh.length} new files would be added, too many to read in one go. Add generated folders to .gitignore, or commit in smaller parts`,
      };
    for (const name of fresh) {
      names.add(name);
      let bytes;
      try {
        const file = path.join(root, name);
        if (fs.statSync(file).size > MAX_FILE_BYTES) {
          const start = Buffer.alloc(8192);
          const fd = fs.openSync(file, "r");
          const size = fs.readSync(fd, start, 0, start.length, 0);
          fs.closeSync(fd);
          if (textIn(start.subarray(0, size)) === null) continue; // a large binary: a picture, a video
          return {
            error: `${name} is a new text file over 20 MB, too large to read here. Stage it with git add as its own command, then commit`,
          };
        }
        bytes = fs.readFileSync(file);
      } catch {
        continue; // a file that vanished or cannot be read will not be committed either
      }
      const content = textIn(bytes);
      if (content !== null) readText(content, name, allowPaths, report);
    }
  }

  const once = (list) => [...new Map(list.map((item) => [`${item.file}:${item.line}:${item.rule}`, item])).values()];
  return {
    findings: once(report.findings),
    waived: once(report.waived),
    files: secretFiles([...names], { allowPaths }),
  };
}

/**
 * What patch files hand to `git am`: the lines they add, and the messages of the commits they make.
 * Returns { findings, waived, files } or { error } when a file cannot be read.
 */
export function scanPatches(files, { allowPaths = [] } = {}) {
  const report = newReport();
  const names = [];
  for (const file of files) {
    let text = null;
    try {
      if (fs.statSync(file).size <= MAX_FILE_BYTES) text = textIn(fs.readFileSync(file));
    } catch {
      text = null;
    }
    if (text === null) return { error: `the patch file ${file} is missing, too large, or not text` };
    const plain = text.replace(/\r\n/g, "\n");
    readDiff(plain, allowPaths, report);
    // Everything outside the diffs is mail: the subject and the message of each commit.
    const said = [];
    let inDiff = false;
    for (const row of plain.split("\n")) {
      if (row.startsWith("diff --git ")) inDiff = true;
      else if (/^From [0-9a-f]{40,64} /.test(row)) inDiff = false;
      if (!inDiff) said.push(row);
      else if (row.startsWith("+++ b/")) names.push(row.slice(6).trim());
    }
    readText(said.join("\n"), COMMIT_MESSAGE, [], report);
  }
  return { findings: report.findings, waived: report.waived, files: secretFiles(names, { allowPaths }) };
}
