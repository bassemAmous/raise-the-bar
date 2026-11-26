// Finds secrets in the lines a commit adds. Only public, well-known key formats and a few
// careful generic rules: a scanner that cries wolf gets switched off.
import { matchesAny, tryGit } from "./core.mjs";

export const ALLOW_PRAGMA = "guardrails:allow-secret";

const PLACEHOLDER =
  /(example|placeholder|changeme|change-me|your[_-]?|dummy|sample|redacted|xxxx|\*\*\*\*|<[^>]*>|\$\{|\{\{|%\(|process\.env|os\.environ|import\.meta)/i;

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
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@'"]+:([^\s:/@'"]{6,})@[^\s/'"]+/i,
    accept: (match) => !PLACEHOLDER.test(match[1]),
  },
  {
    id: "hardcoded-secret",
    pattern:
      /(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key)["']?\s*[:=]\s*["']([^"'\s]{16,})["']/i,
    accept: (match) => !PLACEHOLDER.test(match[1]) && entropy(match[1]) >= 3.6,
  },
];

const SECRET_FILE =
  /(^|\/)(\.env(\.(?!example$|sample$|template$|dist$)[^/]+)?|id_rsa|id_dsa|id_ecdsa|id_ed25519|[^/]+\.(pem|p12|pfx|keystore|jks))$/i;

const mask = (text) => `${text.slice(0, 4)}…(${text.length} chars)`;

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
    const text = row.slice(1);
    const here = line++;
    if (text.includes(ALLOW_PRAGMA) || matchesAny(file, allowPaths)) continue;
    for (const rule of RULES) {
      const match = text.match(rule.pattern);
      if (!match || (rule.accept && !rule.accept(match))) continue;
      findings.push({ file, line: here, rule: rule.id, shown: mask(match[1] ?? match[0]) });
      break;
    }
  }
  return findings;
}

export function secretFiles(names, { allowPaths = [] } = {}) {
  return names.filter((name) => SECRET_FILE.test(name) && !matchesAny(name, allowPaths));
}

/** What `git commit` in this folder is about to record. `all` = the -a flag. */
export function scanCommit(folder, { all = false, allowPaths = [] } = {}) {
  const range = all ? ["HEAD"] : ["--cached"];
  const diff = tryGit(["diff", ...range, "-U0", "--no-color", "--no-ext-diff"], folder);
  if (diff === null) return { findings: [], files: [] };
  const names = tryGit(["diff", ...range, "--name-only", "--diff-filter=AM"], folder) ?? "";
  return {
    findings: scanDiff(diff, { allowPaths }),
    files: secretFiles(names.split("\n").filter(Boolean), { allowPaths }),
  };
}
