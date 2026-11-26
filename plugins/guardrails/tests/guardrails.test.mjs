// End-to-end tests on real temporary git repositories.
// Run: node --test plugins/guardrails/tests/guardrails.test.mjs
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { isTypedByHuman, typedApproval } from "../lib/approval.mjs";
import { globToRegExp, loadConfig } from "../lib/core.mjs";
import { dangerIn } from "../lib/danger.mjs";
import { judgeCommand, judgeEdit } from "../lib/judge.mjs";
import { gitCalls, pushesIn } from "../lib/push.mjs";
import { reviewTrailer } from "../lib/records.mjs";
import { scanDiff, scanText, secretFiles } from "../lib/secrets.mjs";
import { callsIn } from "../lib/shell.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "cli.mjs");
const HOOK = path.join(ROOT, "hooks", "command-guard.mjs");
const made = [];

// Fake keys are built at run time, so this file never holds something that looks like a key.
const FAKE_AWS = "AKIA" + "ABCDEFGHIJKLMNOP";
const FAKE_STRIPE = "sk_" + "live_" + "a1b2c3d4e5f6g7h8i9j0k1l2";
const FAKE_PASSWORD = "S3cr3t" + "Passw0rd";

const sh = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const unix = (file) => file.split("\\").join("/");

function tempDir() {
  // realpath: on macOS the temp folder is a link, and git reports the real path.
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "guardrails-test-")));
  made.push(base);
  return base;
}

function makeRepo(config = {}, { name = "repo" } = {}) {
  const base = tempDir();
  const remote = path.join(base, "remote.git");
  const repo = path.join(base, name);
  execFileSync("git", ["init", "--bare", "-b", "main", remote]);
  execFileSync("git", ["init", "-b", "main", repo]);
  sh(repo, "config", "user.email", "test@example.com");
  sh(repo, "config", "user.name", "Test");
  sh(repo, "config", "commit.gpgsign", "false");
  sh(repo, "remote", "add", "origin", remote);
  fs.writeFileSync(
    path.join(repo, "guardrails.config.json"),
    JSON.stringify({ tests: { command: 'node -e "process.exit(0)"' }, ...config }),
  );
  fs.writeFileSync(path.join(repo, "app.js"), "export const answer = 41;\n");
  sh(repo, "add", ".");
  sh(repo, "commit", "-m", "first");
  sh(repo, "push", "origin", "main");
  return repo;
}

function commit(repo, file, content, message = "change") {
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  fs.writeFileSync(path.join(repo, file), content);
  sh(repo, "add", ".");
  sh(repo, "commit", "-m", message);
  return sh(repo, "rev-parse", "HEAD");
}

const cli = (repo, ...args) => spawnSync("node", [CLI, ...args], { cwd: repo, encoding: "utf8" });
const judge = (repo, command, transcriptPath) => judgeCommand({ command, cwd: repo, transcriptPath });
const judgePs = (repo, command) => judgeCommand({ command, cwd: repo, shell: "powershell" });
const verdictOf = (repo, command, transcriptPath) => judge(repo, command, transcriptPath).decision;

function transcript(repo, rows) {
  const file = path.join(path.dirname(repo), `transcript-${Math.random().toString(16).slice(2)}.jsonl`);
  fs.writeFileSync(file, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  return file;
}

const typed = (text, at = new Date()) => ({
  type: "user",
  promptSource: "typed",
  turnOrigin: "human",
  timestamp: at.toISOString(),
  message: { role: "user", content: text },
});

function passingReport(repo, head) {
  const file = path.join(path.dirname(repo), "report.md");
  fs.writeFileSync(file, `Review of ${head.slice(0, 8)}\n\nNo findings.\n\nVERDICT: PASS\nOPEN-CRITICAL: 0\nOPEN-HIGH: 0\n`);
  return file;
}

/** A repository whose newest commit has everything on record: tests, review and a typed approval. */
function readyRepo(config) {
  const repo = makeRepo(config);
  const head = commit(repo, "app.js", "export const answer = 42;\n");
  assert.equal(cli(repo, "test").status, 0);
  assert.equal(cli(repo, "review-stamp", "--report", passingReport(repo, head)).status, 0);
  const approved = transcript(repo, [typed(`approve production ${head.slice(0, 8)}`)]);
  assert.equal(verdictOf(repo, "git push origin main", approved), "allow");
  return { repo, head, approved };
}

const NOT_READY = /is not ready for "main"/;

after(() => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});

test("globs: * stays inside one path part, ** crosses them", () => {
  assert.ok(globToRegExp("release/*").test("release/1.2"));
  assert.ok(!globToRegExp("release/*").test("release/1.2/hotfix"));
  assert.ok(globToRegExp("**/*.md").test("README.md"));
  assert.ok(globToRegExp("**/*.md").test("docs/guide/intro.md"));
  assert.ok(!globToRegExp("docs/**").test("src/docs.js"));
});

test("command reader: quotes, heredocs, redirects and other shells", () => {
  const programs = (line, options) => callsIn(line, "/work", options).map((call) => [call.program, ...call.args].join(" "));
  assert.deepEqual(programs('echo "a && git push" ; ls'), ["echo a && git push", "ls"]);
  assert.deepEqual(programs("git push origin main >/dev/null 2>&1"), ["git push origin main"]);
  assert.deepEqual(programs("git push \\\n  origin main"), ["git push origin main"]);
  assert.deepEqual(programs("git status # git push origin main"), ["git status"]);
  assert.deepEqual(programs('bash -lc "cd x && git push"'), ["cd x", "git push"]);
  assert.deepEqual(programs("FOO=1 sudo -u me /usr/bin/git.exe status"), ["git status"]);
  assert.deepEqual(programs("if true; then git fetch; fi"), ["true", "git fetch"]);
  const [doc] = callsIn("psql <<'EOF'\nselect 1; git push\nEOF\n", "/work");
  assert.equal(doc.program, "psql");
  assert.equal(doc.heredocs[0], "select 1; git push\n");
  // A commit message written the way agents write it: a heredoc inside $( ) inside quotes.
  const message = 'git commit -m "$(cat <<\'EOF\'\nfix: don\'t "quote" (this) && git push origin main\nEOF\n)"';
  assert.deepEqual(
    callsIn(message, "/work").map((call) => call.program),
    ["cat", "git"],
  );
  // PowerShell: the backtick escapes, the backslash does not.
  assert.deepEqual(programs('Write-Host "say `"git push`" later"; git status', { shell: "powershell" }), [
    'write-host say "git push" later',
    "git status",
  ]);
  // The folder follows cd, pushd and popd, and a part in brackets keeps its cd to itself.
  const folders = callsIn("(cd a && ls) ; pushd b ; ls ; popd ; ls", "/work")
    .filter((call) => call.program === "ls")
    .map((call) => call.folder.replace(/^[A-Za-z]:/, ""));
  assert.deepEqual(folders, ["/work/a", "/work/b", "/work"]);
  assert.equal(callsIn('cd "$SOMEWHERE" && ls', "/work")[1].folder, null);
});

test("push reader: refspecs, cd, -C and flags", () => {
  const repo = makeRepo();
  const [plain] = pushesIn("git push origin HEAD:staging", repo);
  assert.deepEqual(plain.targets[0], { src: "HEAD", dst: "staging", forced: false, deletes: false });
  const [current] = pushesIn("git push", repo);
  assert.equal(current.targets[0].dst, "main");
  assert.equal(current.implicit, true);
  const [forced] = pushesIn("git push -f origin main", repo);
  assert.equal(forced.force, true);
  const [lease] = pushesIn("git push --force-with-lease origin +feature:main", repo);
  assert.equal(lease.force, true);
  assert.equal(lease.targets[0].forced, true);
  const [deleting] = pushesIn("git push origin :main", repo);
  assert.equal(deleting.targets[0].deletes, true);
  const [variable] = pushesIn('git push origin "$BRANCH"', repo);
  assert.equal(variable.unreadable, true);
  const [full] = pushesIn("git push origin refs/heads/topic:refs/heads/main heads/x:heads/staging", repo);
  assert.deepEqual(
    full.targets.map((target) => target.dst),
    ["main", "staging"],
  );
  assert.equal(pushesIn("git push origin tag v1.0", repo)[0].targets.length, 0);
  assert.equal(pushesIn("git push --tags", repo)[0].targets.length, 0);
  assert.equal(pushesIn("git push -n origin main", repo)[0].dryRun, true);
  const calls = gitCalls(`cd sub && git status ; git -C ${unix(repo)} push origin main`, repo);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].folder.endsWith("/repo/sub"));
  assert.ok(calls[1].folder.endsWith("/repo"));
});

test("secret scan: added lines only, placeholders and pragma pass, value is never printed", () => {
  const diff = [
    "diff --git a/config.js b/config.js",
    "--- a/config.js",
    "+++ b/config.js",
    "@@ -1,2 +1,9 @@",
    `-const old = "${FAKE_AWS}";`,
    `+const key = "${FAKE_AWS}";`,
    `+const pay = "${FAKE_STRIPE}";`,
    '+const password = "your_password_here";',
    `+const fixture = "${FAKE_AWS}"; // guardrails:allow-secret`,
    `+const db = "postgres://app:${FAKE_PASSWORD}@db.internal:5432/app";`,
    '+const local = "postgres://app:${DB_PASSWORD}@localhost/app";',
    '+const compose = "postgres://postgres:postgres@db:5432/app";',
    '+const tutorial = "mysql://user:password@db.internal/app";',
    `+const laptop = "redis://app:${FAKE_PASSWORD}@localhost:6379";`,
  ].join("\n");
  const findings = scanDiff(diff);
  assert.deepEqual(
    findings.map((finding) => [finding.line, finding.rule]),
    [
      [1, "aws-access-key"],
      [2, "stripe-live-key"],
      [5, "url-with-password"],
    ],
  );
  assert.ok(findings.every((finding) => !finding.shown.includes(FAKE_AWS.slice(6))));
  assert.ok(!findings[2].shown.includes("Passw0rd"));
  assert.deepEqual(scanDiff(diff, { allowPaths: ["config.js"] }), []);
  assert.deepEqual(
    secretFiles([
      ".env",
      ".env.production",
      ".env.example",
      "src/env.ts",
      "certs/public.pem",
      "certs/server.p12",
      ".envrc",
      "deploy/prod.env",
      "infra/terraform.tfstate",
      "infra/prod.tfvars",
      "infra/variables.tf",
    ]),
    [".env", ".env.production", "certs/server.p12", ".envrc", "deploy/prod.env", "infra/terraform.tfstate", "infra/prod.tfvars"],
  );
});

test("commit with a staged secret is refused, a clean commit is not", () => {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, "app.js"), `export const key = "${FAKE_AWS}";\n`);
  assert.equal(verdictOf(repo, 'git commit -m "x"'), "allow", "not staged yet");
  const all = judge(repo, 'git commit -am "x"');
  assert.equal(all.decision, "deny");
  assert.match(all.reason, /app\.js:1\s+aws-access-key/);
  assert.equal(verdictOf(repo, 'git commit -m "x" app.js'), "deny", "a commit that names the file takes it");
  assert.equal(verdictOf(repo, 'git commit --dry-run -am "x"'), "allow");
  sh(repo, "add", ".");
  assert.equal(verdictOf(repo, 'git commit -m "x"'), "deny");
  fs.writeFileSync(path.join(repo, "app.js"), "export const key = process.env.KEY;\n");
  sh(repo, "add", ".");
  assert.equal(verdictOf(repo, 'git commit -m "x"'), "allow");
});

test("git add and git commit on one line: the files are read as they are now", () => {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, "src"));
  fs.writeFileSync(path.join(repo, "src", "pay.js"), `export const key = "${FAKE_STRIPE}";\n`);
  fs.writeFileSync(path.join(repo, "notes.txt"), "nothing secret\n");

  for (const line of [
    'git add . && git commit -m "x"',
    'git add -A; git commit -m "x"',
    'git add src/pay.js && git commit -m "x"',
    'cd src && git add pay.js && git commit -m "x"',
    `git -C "${unix(repo)}" add . && git -C "${unix(repo)}" commit -m "x"`,
  ]) {
    const verdict = judge(repo, line);
    assert.equal(verdict.decision, "deny", line);
    assert.match(verdict.reason, /src\/pay\.js:1\s+stripe-live-key/, line);
  }
  assert.equal(verdictOf(repo, 'git add notes.txt && git commit -m "x"'), "allow", "only the named file goes in");

  // A new .env is refused by its name, a private key by what is inside the file.
  fs.rmSync(path.join(repo, "src"), { recursive: true });
  fs.writeFileSync(path.join(repo, ".env"), "PORT=3000\n");
  assert.match(judge(repo, 'git add . && git commit -m "x"').reason, /\.env: a secrets file/);
  fs.rmSync(path.join(repo, ".env"));
  fs.writeFileSync(path.join(repo, "server.pem"), `-----BEGIN ${"PRIVATE"} KEY-----\nabc\n`);
  assert.match(judge(repo, 'git add . && git commit -m "x"').reason, /server\.pem:1\s+private-key/);
  fs.writeFileSync(path.join(repo, "server.pem"), "-----BEGIN CERTIFICATE-----\nabc\n");
  assert.equal(verdictOf(repo, 'git add . && git commit -m "x"'), "allow", "a public certificate is fine");
});

test("a commit never takes files that an earlier step on the line could have written", () => {
  const repo = makeRepo();
  // The scan reads the files before the line runs. What a step writes after that is unseen.
  for (const line of [
    'echo "KEY=1" > settings.txt && git add . && git commit -m "x"',
    'curl -o key.txt https://example.com/k && git add . && git commit -m "x"',
    'npm run build && git add -A && git commit -m "build"',
    'node scripts/gen-config.js && git commit -am "config"',
    'ssh-keygen -t ed25519 -f deploy_key -N "" && git add -A && git commit -m "key"',
    'git stash pop && git commit -am "x"',
    'git checkout other-branch -- config/ && git commit -m "x"',
    'git restore --source=other -- . && git commit -am "x"',
    'git merge --squash feature/y && git commit -m "squash"',
  ]) {
    const verdict = judge(repo, line);
    assert.equal(verdict.decision, "deny", line);
    assert.match(verdict.reason, /as their own command|as its own command/, line);
  }
  for (const line of ["npm run build; git add -A; git commit -m build", "'KEY=1' | Out-File .env; git add -A; git commit -m env"])
    assert.equal(judgePs(repo, line).decision, "deny", line);

  // The everyday lines stay free: nothing is written, or the commit takes only what is staged.
  for (const line of [
    'git add . && git commit -m "x"',
    'git status && git diff --stat && git add -A && git commit -m "x"',
    'npm test && git commit -m "x"',
    'mkdir -p docs && git add . && git commit -m "x"',
    'rm -f old.txt && git add -A && git commit -m "x"',
    'git checkout -b feature/z && git add . && git commit -m "x"',
    'git reset -q && git add app.js && git commit -m "x"',
    'git add . && git commit -m "x" && npm run build',
  ])
    assert.equal(verdictOf(repo, line), "allow", line);
});

test("an ignored file, another encoding, or a comment do not hide a secret", () => {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, ".gitignore"), "local/\n");
  fs.mkdirSync(path.join(repo, "local"));
  fs.writeFileSync(path.join(repo, "local", "keys.js"), `export const key = "${FAKE_AWS}";\n`);
  assert.equal(verdictOf(repo, 'git add . && git commit -m "x"'), "allow", "git leaves an ignored file out");
  for (const line of ['git add -f local/keys.js && git commit -m "x"', 'git add --force . && git commit -m "x"']) {
    assert.match(judge(repo, line).reason ?? "allowed", /local\/keys\.js:1\s+aws-access-key/, line);
  }
  fs.rmSync(path.join(repo, "local"), { recursive: true });

  // A file saved by Windows tools as UTF-16 is still text.
  const wide = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`key = "${FAKE_AWS}"\r\n`, "utf16le")]);
  fs.writeFileSync(path.join(repo, "settings.ps1"), wide);
  assert.match(judge(repo, 'git add . && git commit -m "x"').reason ?? "allowed", /settings\.ps1:1\s+aws-access-key/);
  fs.rmSync(path.join(repo, "settings.ps1"));

  // The agent can write the allow comment itself, so the comment asks a human. It does not pass alone.
  fs.writeFileSync(path.join(repo, "fixture.js"), `export const key = "${FAKE_AWS}"; // guardrails:allow-secret\n`);
  const waived = judge(repo, 'git add . && git commit -m "x"');
  assert.equal(waived.decision, "ask");
  assert.match(waived.reason, /fixture\.js:1\s+aws-access-key/);
  assert.ok(!waived.reason.includes(FAKE_AWS.slice(6)), "the value is never printed");
  fs.appendFileSync(path.join(repo, "fixture.js"), `export const other = "${FAKE_STRIPE}";\n`);
  assert.equal(verdictOf(repo, 'git add . && git commit -m "x"'), "deny", "one unmarked secret is enough");
});

test("secret rules: the common key shapes are found, the common look-alikes are not", () => {
  const rules = (text, file = "src/config.js") => scanText(text, file).map((finding) => finding.rule);
  const random = "q7Rz2Lk9Xv4Tn8Wb3Yc6Hd1Jm5Pf0GsAe";
  const found = [
    [`aws_secret_access_key = "${random}${"Zx81"}${"Qw"}"`, "src/config.js"],
    [`const hook = "https://hooks.slack.com/${"services"}/T00000000/B00000000/${random.slice(0, 24)}";`, "src/notify.js"],
    [`const slack = "${"xox"}b-123456789012-123456789012-${random.slice(0, 24)}";`, "src/notify.js"],
    [`const gitlab = "${"glpat"}-${random.slice(0, 20)}";`, "src/ci.js"],
    [`const mail = "${"SG"}.${random.slice(0, 22)}.${random}${random.slice(0, 10)}";`, "src/mail.js"],
    [`SECRET_KEY = '${random}${random.slice(0, 17)}'`, "settings.py"],
    [`Authorization: Bearer ${random}${random}`, "docs/api.http"],
    [`const cache = "redis://:${random.slice(0, 16)}@cache.internal:6379";`, "src/cache.js"],
    [`DB_PASSWORD=${random.slice(0, 20)}`, ".env.production"],
    [`  password: ${random.slice(0, 20)}`, "config/app.yml"],
    [`curl -u deploy:${random.slice(0, 14)} https://build.internal/run`, "scripts/run.sh"],
  ];
  for (const [text, file] of found) assert.ok(rules(text, file).length > 0, `should find: ${text.slice(0, 40)}… in ${file}`);

  const quiet = [
    ['const password = "correct-horse-battery-staple";', "tests/login.test.js"],
    ['password: "string | undefined | null",', "src/types.ts"],
    ["const token = process.env.API_TOKEN;", "src/api.js"],
    ['const apiKey = "YOUR_API_KEY_HERE";', "README.md"],
    ["DB_PASSWORD=${DB_PASSWORD}", "deploy/app.env"],
    ["  password: ${{ secrets.DB_PASSWORD }}", ".github/workflows/ci.yml"],
    ['const url = "postgres://postgres:postgres@localhost:5432/app";', "src/db.js"],
    ["curl -u admin:$PASSWORD https://build.internal/run", "scripts/run.sh"],
    ['const PASSWORD_FIELD = "PASSWORD_CONFIRMATION";', "src/form.js"],
    ['"integrity": "sha512-q7Rz2Lk9Xv4Tn8Wb3Yc6Hd1Jm5Pf0GsAeq7Rz2Lk9Xv4Tn8Wb3Yc6Hd1Jm5Pf0GsAe=="', "package-lock.json"],
  ];
  for (const [text, file] of quiet) assert.deepEqual(rules(text, file), [], `should stay quiet: ${text}`);
});

test("the secret scan does not go blind: big diffs and a first commit", () => {
  const repo = makeRepo();
  const filler = `${"const filler = 'this line is only here to make the diff large';\n".repeat(30000)}`;
  fs.writeFileSync(path.join(repo, "big.js"), `${filler}export const key = "${FAKE_AWS}";\n`);
  assert.ok(fs.statSync(path.join(repo, "big.js")).size > 1024 * 1024);
  sh(repo, "add", ".");
  assert.match(judge(repo, 'git commit -m "x"').reason, /big\.js:30001\s+aws-access-key/);

  const fresh = path.join(tempDir(), "fresh");
  execFileSync("git", ["init", "-b", "main", fresh]);
  fs.writeFileSync(path.join(fresh, "app.js"), `export const key = "${FAKE_AWS}";\n`);
  assert.equal(verdictOf(fresh, 'git add . && git commit -m "first"'), "deny", "no commit yet");
  sh(fresh, "add", ".");
  assert.equal(verdictOf(fresh, 'git commit -am "first"'), "deny");
  assert.equal(verdictOf(fresh, 'git commit -m "first"'), "deny");

  const nowhere = path.join(tempDir(), "new");
  fs.mkdirSync(nowhere);
  const created = judge(nowhere, 'git init && git add . && git commit -m "first"');
  assert.equal(created.decision, "deny");
  assert.match(created.reason, /creates a folder or a repository/);
  // An empty first commit has nothing in it to scan.
  assert.equal(verdictOf(nowhere, "mkdir demo && cd demo && git init && git commit --allow-empty -m init"), "allow");
});

test("the full path to production: tests, review, then a human", () => {
  const repo = makeRepo();
  const head = commit(repo, "app.js", "export const answer = 42;\n");
  const push = "git push origin main";

  assert.equal(verdictOf(repo, "git push origin HEAD:feature/x"), "allow", "feature branches are free");

  let verdict = judge(repo, push);
  assert.equal(verdict.decision, "deny");
  assert.match(verdict.reason, /tests passed for this exact code: NO/);
  assert.match(verdict.reason, /review passed for this exact code: NO/);
  assert.match(verdict.reason, /approved by a human: NO/);

  assert.equal(cli(repo, "test").status, 0);
  verdict = judge(repo, push);
  assert.match(verdict.reason, /tests passed for this exact code: yes/);
  assert.match(verdict.reason, /review passed for this exact code: NO/);

  const noTrailer = path.join(path.dirname(repo), "bad.md");
  fs.writeFileSync(noTrailer, `Looks fine, ${head.slice(0, 8)}.\n`);
  assert.equal(cli(repo, "review-stamp", "--report", noTrailer).status, 1);
  fs.writeFileSync(noTrailer, `${head.slice(0, 8)}\nVERDICT: PASS\nOPEN-CRITICAL: 0\nOPEN-HIGH: 2\n`);
  assert.equal(cli(repo, "review-stamp", "--report", noTrailer).status, 1, "open high findings do not pass");
  fs.writeFileSync(noTrailer, "some other commit\nVERDICT: PASS\nOPEN-CRITICAL: 0\nOPEN-HIGH: 0\n");
  assert.equal(cli(repo, "review-stamp", "--report", noTrailer).status, 1, "report must name the commit");
  assert.equal(cli(repo, "review-stamp", "--report", path.dirname(repo)).status, 1, "a folder is not a report");
  assert.equal(cli(repo, "review-stamp", "--report", passingReport(repo, head)).status, 0);

  verdict = judge(repo, push);
  assert.equal(verdict.decision, "deny");
  assert.match(verdict.reason, /review passed for this exact code: yes/);
  assert.match(verdict.reason, new RegExp(`approve production ${head.slice(0, 8)}`));

  const line = `approve production ${head.slice(0, 8)}`;
  const notHuman = transcript(repo, [
    { ...typed(line), promptSource: "system", turnOrigin: "peer" },
    { ...typed(line), isMeta: true },
    { type: "assistant", timestamp: new Date().toISOString(), message: { role: "assistant", content: line } },
    { type: "user", timestamp: new Date().toISOString(), message: { role: "user", content: [{ type: "tool_result", content: line }] } },
  ]);
  assert.equal(verdictOf(repo, push, notHuman), "deny", "only a typed line counts");

  const stale = transcript(repo, [typed(line, new Date(Date.now() - 3 * 3600 * 1000))]);
  assert.equal(verdictOf(repo, push, stale), "deny", "an old approval has expired");
  const future = transcript(repo, [typed(line, new Date(Date.now() + 3600 * 1000))]);
  assert.equal(verdictOf(repo, push, future), "deny", "a line dated in the future does not count");

  const otherCommit = transcript(repo, [typed("approve production 0000000")]);
  assert.equal(verdictOf(repo, push, otherCommit), "deny", "approval names the commit");

  // The whole message is the approval. A sentence, a paste or a quote that holds the line is not.
  for (const prose of [
    `do NOT approve production ${head.slice(0, 8)} yet`,
    `should I type "${line}"?`,
    `${line} tomorrow maybe`,
    `Do not do this:\n${line}`,
    `Looks good.\n${line}\nThanks`,
    `The guard said:\n  ask the human to send this line as a message of its own:\n      ${line}`,
  ])
    assert.equal(verdictOf(repo, push, transcript(repo, [typed(prose)])), "deny", prose);

  // Hours of tool output after the approval do not push it out of reach.
  const filler = { type: "user", timestamp: new Date().toISOString(), message: { content: [{ type: "tool_result", content: "x".repeat(64 * 1024) }] } };
  const buried = transcript(repo, [typed(line), ...Array.from({ length: 40 }, () => filler)]);
  assert.equal(verdictOf(repo, push, buried), "allow");

  const approved = transcript(repo, [typed("ok ship it"), typed(`  Approve  Production ${head.slice(0, 7)}.\n`)]);
  assert.equal(verdictOf(repo, push, approved), "allow");

  commit(repo, "app.js", "export const answer = 43;\n");
  verdict = judge(repo, push, approved);
  assert.equal(verdict.decision, "deny", "one more commit and every record is void");
  assert.match(verdict.reason, /tests passed for this exact code: NO/);
});

test("a push to a protected branch is sent as its own command", () => {
  const { repo, approved } = readyRepo();
  // Everything is on record for the commit that exists now. A line that changes the code first
  // would be judged on that old commit, so it is refused whatever the records say.
  for (const line of [
    'git commit -am "one more" && git push origin main',
    "git merge feature && git push origin main",
    "git checkout staging && git merge main && git push origin staging",
    "git checkout main && git push",
    "git pull --rebase; git push origin main",
    "git reset --hard HEAD~1 && git push origin main",
    "npm version patch && git push origin main",
    "./release.sh; git push origin main",
  ]) {
    const verdict = judge(repo, line, approved);
    assert.equal(verdict.decision, "deny", line);
    assert.match(verdict.reason, /as its own command/, line);
  }
  // Reading first is fine, and so is the folder.
  assert.equal(verdictOf(repo, "git status && git log -1 && git push origin main", approved), "allow");
  assert.equal(verdictOf(repo, `cd "${unix(repo)}" && git fetch && git push origin main`, approved), "allow");
  // Feature branches stay free, also right after a commit.
  assert.equal(verdictOf(repo, 'git commit -am "wip" && git push origin HEAD:feature/x'), "allow");
  assert.equal(verdictOf(repo, 'git checkout -b feature/y && git commit -am "wip" && git push -u origin feature/y'), "allow");
  // A push that names no branch, after a switch the guard cannot follow.
  assert.equal(verdictOf(repo, "git checkout - && git push"), "deny");
  assert.equal(verdictOf(repo, "git switch - && git push"), "deny");
});

test("a push stays a push behind an alias, a script block or a new process", () => {
  const repo = makeRepo();
  commit(repo, "app.js", "export const answer = 42;\n");
  sh(repo, "config", "alias.pom", "push origin main");
  sh(repo, "config", "alias.p", "push");
  sh(repo, "config", "alias.ship", "!git push origin main");
  for (const line of [
    "git pom",
    "git p origin main",
    "git p",
    "git ship",
    "git -c alias.x=push x origin main",
    'echo "git push origin main" | bash',
    "printf 'git push origin main\\n' | sh",
    "bash <<'EOF'\ngit push origin main\nEOF",
    "cat <<'EOF' | bash\ngit push origin main\nEOF",
    "git push origin $(git branch --show-current)",
  ])
    assert.match(judge(repo, line).reason ?? "allowed", NOT_READY, line);
  for (const line of [
    "try { git push origin main } catch { }",
    "& { git push origin main }",
    "Start-Process git -ArgumentList 'push','origin','main' -Wait",
    "Start-Process -FilePath git -ArgumentList 'push origin main'",
    "git push origin main,feature/x",
    "echo 'git push origin main' | powershell -Command -",
  ])
    assert.match(judgePs(repo, line).reason ?? "allowed", NOT_READY, line);

  // Behind a condition the guard cannot weigh, the push is still seen and still refused.
  for (const line of [
    "if ($LASTEXITCODE -eq 0) { git push origin main }",
    "1..3 | ForEach-Object { git push origin main }",
    "'git push origin main' | powershell -Command -",
  ])
    assert.equal(judgePs(repo, line).decision, "deny", line);
  // A git word the guard cannot name is not waved through.
  assert.equal(verdictOf(repo, 'git "$VERB" origin main'), "deny");
  // An alias that only reads stays free, and so does text that is only printed.
  sh(repo, "config", "alias.lg", "log --oneline -5");
  assert.equal(verdictOf(repo, "git lg"), "allow");
  assert.equal(verdictOf(repo, 'echo "git push origin main" | cat'), "allow");
  assert.equal(verdictOf(repo, 'echo "git push origin main" | grep push'), "allow");
});

test("the guard follows the folder, or refuses", () => {
  const repo = makeRepo({}, { name: "my repo" });
  commit(repo, "app.js", "export const answer = 42;\n");
  const outside = path.dirname(repo);
  const here = unix(repo);

  for (const line of [
    `cd "${here}" && git push origin main`,
    `git -C "${here}" push origin main`,
    `pushd "${here}"; git push origin main`,
    `cd "${unix(outside)}" && cd "my repo" && git push origin main`,
    `cd my\\ repo && git push origin main`,
  ])
    assert.match(judge(outside, line).reason ?? "allowed", NOT_READY, line);
  assert.match(judgePs(outside, `Set-Location "${repo}"; git push origin main`).reason ?? "allowed", NOT_READY);
  assert.match(judgePs(outside, `Set-Location -Path '${repo}'\ngit push origin main`).reason ?? "allowed", NOT_READY);
  if (process.platform === "win32") {
    const gitBash = `/${here[0].toLowerCase()}${here.slice(2)}`;
    assert.match(judge(outside, `cd "${gitBash}" && git push origin main`).reason ?? "allowed", NOT_READY);
  }

  for (const line of [
    'cd "$REPO" && git push origin main',
    'git -C "$REPO" push origin main',
    "cd ~/no-such-folder-9f2c && git push origin main",
    `GIT_DIR="${here}/.git" git push origin main`,
    `git --git-dir="${here}/.git" push origin main`,
    'cd "$REPO" && git commit -m "x"',
  ]) {
    const verdict = judge(outside, line);
    assert.equal(verdict.decision, "deny", line);
    assert.match(verdict.reason, /cannot tell which folder/, line);
  }
  // Outside any repository git fails by itself: nothing to guard.
  assert.equal(verdictOf(outside, "git push origin main"), "allow");
});

test("a push stays a push behind another shell, a wrapper or a redirect", () => {
  const repo = makeRepo();
  commit(repo, "app.js", "export const answer = 42;\n");
  for (const line of [
    'bash -c "git push origin main"',
    "sh -c 'git push origin main'",
    'bash -lc "cd . && git push origin main"',
    'cmd /c "git push origin main"',
    'powershell -NoProfile -Command "git push origin main"',
    `powershell -EncodedCommand ${Buffer.from("git push origin main", "utf16le").toString("base64")}`,
    'eval "git push origin main"',
    "(git push origin main)",
    "echo $(git push origin main)",
    "echo `git push origin main`",
    "git --no-pager push origin main",
    "git.exe push origin main",
    "/usr/bin/git push origin main",
    '"C:/Program Files/Git/cmd/git.exe" push origin main',
    'git -c "user.name=A B" push origin main',
    "GIT_TRACE=1 git push origin main",
    "sudo git push origin main",
    "if true; then git push origin main; fi",
    "git push origin main >/dev/null 2>&1",
    "git push origin main > push.log",
    "git push > push.log 2>&1",
    "git push 2>&1 | tee push.log",
    "git push \\\n  origin \\\n  main",
    "git push origin main:",
    "git push origin HEAD",
    "git push origin @:refs/heads/main",
    "git push --all origin",
    "git push origin 'refs/heads/*:refs/heads/*'",
    "git push origin :",
  ])
    assert.match(judge(repo, line).reason ?? "allowed", NOT_READY, line);
  // A runner the reader does not know still leads to a refusal.
  assert.equal(verdictOf(repo, "timeout 60 git push origin main"), "deny");
  assert.match(judgePs(repo, 'git push origin main; Write-Host "done"').reason, NOT_READY);
});

test("text that only mentions a push or a wipe is not a command", () => {
  const repo = makeRepo();
  commit(repo, "app.js", "export const answer = 42;\n");
  for (const line of [
    'echo "next step: git push origin main"',
    'gh pr create --title "Release" --body "after the review: git push --force origin main"',
    'git commit --allow-empty -m "docs: never git push --force origin main, and no DROP DATABASE"',
    'git commit --allow-empty -m "$(cat <<\'EOF\'\ndocs: why `git push --force origin main` is refused (see rm -rf /)\nEOF\n)"',
    "cat <<'EOF'\ngit push --force origin main\nEOF",
    'grep -rn "git push origin main" docs',
    "git status # then git push origin main",
    "git log --grep='guardrails approve'",
    'rg "guardrails approve" README.md',
    "git push --dry-run origin main",
    "git push -n origin main",
    "git push --tags",
    "git push origin tag v1.0",
    "git push origin v1.0",
  ])
    assert.equal(verdictOf(repo, line), "allow", line);
  assert.equal(
    judgePs(repo, "git commit --allow-empty -m @'\nnever git push --force origin main\n'@").decision,
    "allow",
  );
  assert.equal(judgePs(repo, 'Write-Host "say `"git push --force origin main`" later"').decision, "allow");

  const upToDate = makeRepo();
  assert.equal(verdictOf(upToDate, "git push origin main"), "allow", "the remote already has this commit");
});

test("docs-only changes skip tests and review, never the production approval", () => {
  const repo = makeRepo();
  sh(repo, "push", "origin", "main:staging");
  sh(repo, "fetch", "origin");
  commit(repo, "README.md", "# Hello\n");
  assert.equal(verdictOf(repo, "git push origin HEAD:staging"), "allow");
  const verdict = judge(repo, "git push origin main");
  assert.equal(verdict.decision, "deny");
  assert.match(verdict.reason, /tests passed for this exact code: not required \(docs only\)/);
  assert.match(verdict.reason, /approved by a human: NO/);

  // Renaming code to a docs name is still a code change.
  sh(repo, "mv", "app.js", "app.md");
  sh(repo, "commit", "-m", "rename");
  assert.match(judge(repo, "git push origin HEAD:staging").reason ?? "allowed", /tests passed for this exact code: NO/);
});

test("the message says why a check is not required", () => {
  const repo = makeRepo({ tests: { command: null } });
  commit(repo, "app.js", "export const answer = 42;\n");
  const verdict = judge(repo, "git push origin main");
  assert.match(verdict.reason, /tests passed for this exact code: not required \(no test command found\)/);
  assert.match(verdict.reason, /review passed for this exact code: NO/);
  const off = makeRepo({ review: { required: false }, productionBranches: [] });
  commit(off, "app.js", "export const answer = 42;\n");
  assert.match(judge(off, "git push origin main").reason, /review passed for this exact code: not required \(switched off/);
});

test("protected history only moves forward", () => {
  const repo = makeRepo();
  sh(repo, "push", "origin", "main:staging");
  sh(repo, "fetch", "origin");
  for (const command of [
    "git push --force origin main",
    "git push -f origin main",
    "git push -fu origin main",
    "git push -uf origin main",
    "git push -qf origin main",
    "git push --force-with-lease origin main",
    "git push --force-if-includes --force-with-lease origin main",
    "git push origin +HEAD:main",
    "git push origin :main",
    "git push origin --delete main",
    "git push -d origin main",
    "git push -fd origin main",
    "git push --mirror origin",
    "git push --prune origin",
    "git push origin '+refs/heads/*:refs/heads/*'",
  ])
    assert.match(judge(repo, command).reason ?? "allowed", /rewrite or delete the protected branch/, command);
  assert.equal(verdictOf(repo, "git push --force origin HEAD:feature/mine"), "allow");
  assert.match(judge(repo, 'git push origin "$TARGET"').reason, /shell variable/);
  assert.match(judge(repo, "git push origin no-such-branch:main").reason, /cannot find the commit/);
});

test("git push with no branch follows the upstream setting", () => {
  const repo = makeRepo();
  sh(repo, "checkout", "-q", "-b", "hotfix", "--track", "origin/main");
  sh(repo, "config", "push.default", "upstream");
  commit(repo, "app.js", "export const answer = 42;\n");
  assert.match(judge(repo, "git push").reason ?? "allowed", NOT_READY);
  assert.match(judge(repo, "git push origin").reason ?? "allowed", NOT_READY);
});

test("destructive commands: the catastrophe is refused, the everyday twin is not", () => {
  const refused = [
    "rm -rf /",
    "rm -rf ~",
    "rm -rf ~/",
    "sudo rm -fr /*",
    "rm -r -f /",
    "rm --recursive --force /",
    'rm -rf "$HOME/"',
    "rm -rf ${HOME}",
    "rm -rf .git",
    "rm -rf ./.git",
    "rm -rf .git/",
    "rm -rf /usr",
    "Remove-Item -Recurse -Force .git",
    "Remove-Item -Recurse -Force C:\\",
    "rd /s /q C:\\",
    'git commit --no-verify -m "x"',
    'git commit -n -m "x"',
    'git commit -nm "x"',
    'git -c core.hooksPath=/dev/null commit -m "x"',
    "git push --no-verify origin feature",
    'psql -c "DROP DATABASE app"',
    'psql -c "DELETE FROM users;"',
    'psql -c "DELETE FROM users WHERE 1=1"',
    'mysql -e "TRUNCATE TABLE orders"',
    'echo "DROP DATABASE app;" | psql',
    "psql <<EOF\nDROP DATABASE app;\nEOF",
    "mongosh --eval 'db.users.deleteMany({})'",
    "mongosh --eval 'db.dropDatabase()'",
    "git filter-branch --tree-filter x HEAD",
    "git filter-repo --path secrets --invert-paths",
    "git reflog expire --expire=now --all",
  ];
  const fine = [
    "rm -rf node_modules",
    "rm -rf ./dist /tmp/build",
    "cd dist && rm -rf *",
    "rm -rf ./build/.cache",
    "rm -f .gitignore",
    'git commit -m "explain why --no-verify is banned"',
    'git commit -m "truncate table names in the log, delete from cache when stale"',
    "git push -n origin main",
    'psql -c "DELETE FROM users WHERE id = 7;"',
    "mongosh --eval 'db.users.deleteMany({ old: true })'",
    'grep -r "DROP DATABASE" migrations',
    'echo "never run DROP DATABASE on the live server"',
    "pip install git-filter-repo",
    "truncate -s 0 app.log",
    "npm test",
  ];
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, "dist"));
  fs.mkdirSync(path.join(repo, "vendor", "lib", ".git"), { recursive: true });
  const danger = (command, shell) => dangerIn(callsIn(command, unix(repo), { shell }));
  for (const command of refused) assert.ok(danger(command), `should refuse: ${command}`);
  for (const command of fine) assert.equal(danger(command), null, `should allow: ${command}`);

  // The repository the command stands in is history too, however the path is written.
  for (const command of [
    "rm -rf .",
    "rm -rf ./",
    "rm -rf .*",
    'rm -rf "$(pwd)"',
    'rm -rf "$PWD"',
    "rm -rf ../repo",
    `rm -rf "${unix(repo)}"`,
    "cd dist && rm -rf ../.git",
    "cd dist && rm -rf ..",
  ])
    assert.ok(danger(command), `should refuse: ${command}`);
  for (const command of [
    "Remove-Item -Recurse:$true -Force .git",
    "Remove-Item * -Recurse -Force",
    "cmd /c rd /s /q C:\\",
    "cmd /c del /s /q C:\\*",
  ])
    assert.ok(danger(command, "powershell"), `should refuse: ${command}`);
  // A .git folder below the repository (a fresh clone, a template) is the caller's to remove.
  for (const command of ["rm -rf vendor/lib/.git", "rm -rf vendor", "rm -rf *", "cd dist && rm -rf .", "rm -rf ./.cache"])
    assert.equal(danger(command), null, `should allow: ${command}`);
  assert.equal(danger("Remove-Item dist -Recurse -Force", "powershell"), null);

  // Windows can spell the same folder with short names (RUNNER~1). It is still the repository.
  if (process.platform === "win32") {
    const short = unix(execFileSync("cmd", ["/c", "for %I in (.) do @echo %~sI"], { cwd: repo, encoding: "utf8" }).trim());
    assert.ok(dangerIn(callsIn("rm -rf .", short)), `should refuse: rm -rf . in ${short}`);
    assert.equal(dangerIn(callsIn("rm -rf vendor/lib/.git", short)), null);
  }
});

test("the agent cannot approve, forge a record, or quietly change the rules", () => {
  const repo = makeRepo();
  const cliPath = unix(CLI);
  for (const line of [
    "guardrails approve",
    `node "${cliPath}" approve --head HEAD`,
    `echo abc1234 | node "${cliPath}" approve`,
    'script -qc "guardrails approve" /dev/null',
    'bash -c "guardrails approve"',
    `cd "${path.posix.dirname(cliPath)}" && node cli.mjs approve`,
    `cd "${path.posix.dirname(cliPath)}" && script -qc "node ./cli.mjs approve" /dev/null`,
    "GR=guardrails; $GR approve",
    "echo '{}' > .git/guardrails/approval/abc.json",
    "ls; echo '{}' >> .git/guardrails/audit.log",
    "rm -rf .git/modules/lib/guardrails",
    "python -c \"open('.git/guardrails/tests/x.json','w').write('{}')\"",
  ])
    assert.equal(verdictOf(repo, line), "deny", line);
  for (const line of [
    "sed -i s/main/x/ guardrails.config.json",
    "cat other.json > guardrails.config.json",
    "cp other.json guardrails.config.json",
    "git checkout other -- guardrails.config.json",
  ])
    assert.equal(verdictOf(repo, line), "ask", line);
  for (const line of [
    "cat guardrails.config.json",
    "git add guardrails.config.json",
    "git diff guardrails.config.json",
    "cp guardrails.config.json backup.json",
    "ls .git/guardrails",
    "cat .git/guardrails/audit.log",
    'grep -rn "guardrails approve" .',
    "guardrails status",
  ])
    assert.equal(verdictOf(repo, line), "allow", line);
  // A deny wins over a question on the same line.
  assert.equal(verdictOf(repo, "sed -i s/a/b/ guardrails.config.json; rm -rf /"), "deny");

  assert.equal(judgeEdit({ filePath: `${repo}\\.git\\guardrails\\tests\\abc.json` }).decision, "deny");
  assert.equal(judgeEdit({ filePath: `${repo}/.git/modules/lib/guardrails/review/abc.json` }).decision, "deny");
  assert.equal(judgeEdit({ filePath: `${repo}/guardrails.config.json` }).decision, "ask");
  assert.equal(judgeEdit({ filePath: `${repo}/src/app.js` }).decision, "allow");
  assert.equal(judgeEdit({ filePath: `${repo}/plugins/guardrails/lib/core.mjs` }).decision, "allow");

  const log = "C:\\Users\\me\\.claude\\projects\\shop\\0a1b2c3d-session.jsonl";
  const withLog = (command, shell) => judgeCommand({ command, cwd: repo, transcriptPath: log, shell }).decision;
  assert.equal(withLog(`echo '{}' >> "${log}"`), "deny");
  assert.equal(withLog("echo x >> /tmp/0a1b2c3d-session.jsonl"), "deny");
  assert.equal(withLog(`cp fake.jsonl "${log}"`), "deny");
  assert.equal(withLog(`tail -5 "${log}"`), "allow");
  assert.equal(withLog(`cp "${log}" copy-of-log.txt`), "allow");
  assert.equal(withLog(`Get-Content "${log}" | Select-String approve`, "powershell"), "allow");
  assert.equal(judgeEdit({ filePath: log, transcriptPath: log }).decision, "deny");
  assert.equal(judgeEdit({ filePath: "/home/me/.claude/projects/shop/other.jsonl" }).decision, "deny");
  assert.equal(judgeEdit({ filePath: `${repo}/data/events.jsonl` }).decision, "allow");
  const approve = cli(repo, "approve");
  assert.equal(approve.status, 1, "no terminal, no approval");
  assert.match(approve.stderr, /real terminal/);
});

test("a config that cannot be used closes the guard, it does not open it", () => {
  const repo = makeRepo();
  commit(repo, "app.js", "export const answer = 42;\n");
  const file = path.join(repo, "guardrails.config.json");
  const write = (text) => fs.writeFileSync(file, text);

  write('{ "protectedBranches": ["main"], }');
  assert.match(loadConfig(repo).error, /not valid JSON/);
  assert.match(judge(repo, "git push origin HEAD:feature/x").reason, /has a problem/);
  assert.match(judge(repo, 'git commit --allow-empty -m "x"').reason, /has a problem/);
  assert.equal(verdictOf(repo, "npm run deploy"), "ask", "it could be a production command");
  assert.equal(verdictOf(repo, "git status"), "allow");
  assert.equal(verdictOf(repo, "cat guardrails.config.json"), "allow");
  assert.match(cli(repo, "status").stdout, /config PROBLEM/);

  write("");
  assert.ok(loadConfig(repo).error);
  write('{ "protectedBranches": "main" }');
  assert.match(loadConfig(repo).error, /"protectedBranches" must be a list/);
  assert.deepEqual(loadConfig(repo).protectedBranches.includes("main"), true, "the defaults stay in force");
  write('{ "productionCommands": ["deploy --prod", "("] }');
  assert.match(loadConfig(repo).error, /does not compile/);
  assert.equal(verdictOf(repo, "deploy --prod"), "deny", "the patterns that do compile still lock");
  write('{ "secretScan": true }');
  assert.match(loadConfig(repo).error, /"secretScan" must be an object/);

  write(`\uFEFF${JSON.stringify({ protectedBranches: ["trunk"], productionBranches: [] })}`);
  assert.equal(loadConfig(repo).error, null, "a byte order mark is not an error");
  assert.deepEqual(loadConfig(repo).protectedBranches, ["trunk"]);

  // The rules of the repository that is pushed apply, not those of the folder the session sits in.
  const outside = path.dirname(repo);
  assert.equal(verdictOf(outside, `git -C "${unix(repo)}" push origin HEAD:main`), "allow");
  assert.match(judge(outside, `git -C "${unix(repo)}" push origin HEAD:trunk`).reason, /is not ready for "trunk"/);
});

test("production commands are locked until a human types the approval", () => {
  const repo = makeRepo({ productionCommands: ["deploy\\s+.*--prod\\b"] });
  const head = sh(repo, "rev-parse", "HEAD");
  assert.equal(verdictOf(repo, "deploy --preview"), "allow");
  assert.equal(verdictOf(repo, 'git commit --allow-empty -m "docs: how deploy --prod is locked"'), "allow");
  assert.equal(verdictOf(repo, 'echo "run deploy --prod after the review"'), "allow");
  const verdict = judge(repo, "deploy --prod");
  assert.equal(verdict.decision, "deny");
  assert.match(verdict.reason, new RegExp(`approve production ${head.slice(0, 8)}`));
  assert.equal(verdictOf(repo, 'bash -c "npm run deploy -- --prod"'), "deny");
  const approved = transcript(repo, [typed(`approve production ${head.slice(0, 8)}`)]);
  assert.equal(verdictOf(repo, "deploy --prod", approved), "allow");
});

test("typed approval outside a repository uses the word now and expires fast", () => {
  const file = path.join(tempDir(), "t.jsonl");
  const args = { transcriptPath: file, phrase: "approve production", head: "", maxAgeMinutes: 60 };
  fs.writeFileSync(file, `${JSON.stringify(typed("approve production now"))}\n`);
  assert.ok(typedApproval(args));
  fs.writeFileSync(file, `${JSON.stringify(typed("approve production now", new Date(Date.now() - 20 * 60000)))}\n`);
  assert.equal(typedApproval(args), null);
  assert.equal(isTypedByHuman({ type: "user", message: { content: "hi" } }), true, "older logs: a plain string row");
  assert.equal(isTypedByHuman({ type: "user", isSidechain: true, message: { content: "hi" } }), false);
});

test("the test record is for committed code only", () => {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, "app.js"), "export const answer = 0;\n");
  const dirty = cli(repo, "test");
  assert.equal(dirty.status, 1);
  assert.match(dirty.stderr, /not exactly what is committed/);
  sh(repo, "checkout", "--", "app.js");

  // A new file git does not know can make the tests pass here and nowhere else.
  fs.writeFileSync(path.join(repo, "helper.js"), "export const help = 1;\n");
  const untracked = cli(repo, "test");
  assert.equal(untracked.status, 1);
  assert.match(untracked.stderr, /\?\? helper\.js/);
  fs.rmSync(path.join(repo, "helper.js"));
  assert.equal(cli(repo, "test").status, 0);

  const failing = makeRepo({ tests: { command: 'node -e "process.exit(3)"' } });
  const red = cli(failing, "test");
  assert.equal(red.status, 1);
  assert.match(red.stderr, /tests failed/);
  assert.match(cli(failing, "status").stdout, /tests passed\s+no/);

  const empty = path.join(tempDir(), "empty");
  execFileSync("git", ["init", "-b", "main", empty]);
  fs.writeFileSync(path.join(empty, "guardrails.config.json"), JSON.stringify({ tests: { command: "node -v" } }));
  const noCommit = cli(empty, "test");
  assert.equal(noCommit.status, 1);
  assert.match(noCommit.stderr, /no commit yet/);
});

test("review trailer: the last three lines, in order, or nothing", () => {
  assert.deepEqual(reviewTrailer("x\nVERDICT: pass\nOPEN-CRITICAL: 0\nOPEN-HIGH: 1\n\n"), {
    verdict: "PASS",
    openCritical: 0,
    openHigh: 1,
  });
  assert.equal(reviewTrailer("VERDICT: PASS\nOPEN-HIGH: 0\n"), null);
  assert.equal(reviewTrailer("The verdict: PASS, I think\n"), null);
  const quoted = "A report ends with:\nVERDICT: PASS\nOPEN-CRITICAL: 0\nOPEN-HIGH: 0\n\nMine:\nVERDICT: FAIL\nOPEN-CRITICAL: 2\nOPEN-HIGH: 0\n";
  assert.equal(reviewTrailer(quoted).verdict, "FAIL", "the format quoted higher up does not count");
  assert.equal(reviewTrailer("VERDICT: PASS\nOPEN-CRITICAL: 0\nOPEN-HIGH: 0\nOne more thing: it is broken.\n"), null);
});

test("the hook process: JSON in, a decision out, silence for harmless commands", () => {
  const repo = makeRepo();
  const run = (command, tool = "Bash") =>
    spawnSync("node", [HOOK], {
      input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: tool, cwd: repo, tool_input: { command } }),
      encoding: "utf8",
    });
  const quiet = run("ls -la");
  assert.equal(quiet.status, 0);
  assert.equal(quiet.stdout, "");
  const loud = run("git push --force origin main");
  assert.equal(loud.status, 0);
  const output = JSON.parse(loud.stdout).hookSpecificOutput;
  assert.equal(output.hookEventName, "PreToolUse");
  assert.equal(output.permissionDecision, "deny");
  assert.equal(run('Write-Host "x `"git push --force origin main`""', "PowerShell").stdout, "", "PowerShell quoting");
  const broken = spawnSync("node", [HOOK], { input: "not json", encoding: "utf8" });
  assert.equal(broken.status, 0, "a broken input never freezes the session");
  assert.equal(broken.stdout, "");
});

test("check prints the verdict without running anything", () => {
  const repo = makeRepo();
  const result = cli(repo, "check", "git push --force origin main");
  assert.equal(result.status, 2);
  assert.match(result.stdout, /^DENY\n/);
  assert.equal(cli(repo, "check", "git", "push", "--force", "origin", "main").status, 2, "flags are part of the command");
  assert.equal(cli(repo, "check", "npm run build").status, 0);
});

test("typed approval: row shapes seen in real session logs", () => {
  const at = new Date().toISOString();
  const queued = (origin, extra = {}) => ({
    type: "attachment",
    timestamp: at,
    attachment: { type: "queued_command", commandMode: "prompt", prompt: "approve production now", origin, ...extra },
  });
  const user = (extra, content = "approve production now") => ({ type: "user", timestamp: at, message: { content }, ...extra });

  const counted = [
    user({ promptSource: "typed", turnOrigin: "human" }),
    user({ promptSource: "queued", turnOrigin: "human" }),
    user({ promptSource: "sdk", turnOrigin: "human" }), // typed in an editor extension
    queued({ kind: "human" }),
  ];
  const ignored = [
    user({ turnOrigin: "human", isCompactSummary: true }),
    user({ promptSource: "system", turnOrigin: "peer", isMeta: true }),
    user({ promptSource: "queued", turnOrigin: "peer" }),
    user({ promptSource: "sdk", turnOrigin: "sdk" }), // a program driving the session
    user({ promptSource: "sdk" }),
    user({ rowSource: "command" }, "<local-command-stdout>approve production now</local-command-stdout>"),
    user({}, "<command-name>/x</command-name> approve production now"),
    queued({ kind: "peer" }, { isMeta: true }),
    queued({ kind: "task-notification" }),
    { ...queued({ kind: "human" }), isSidechain: true },
    { type: "queue-operation", timestamp: at, content: "approve production now" },
  ];
  for (const row of counted) assert.equal(isTypedByHuman(row), true, JSON.stringify(row));
  for (const row of ignored) assert.equal(isTypedByHuman(row), false, JSON.stringify(row));

  const file = path.join(tempDir(), "t.jsonl");
  const args = { transcriptPath: file, phrase: "approve production", head: "", maxAgeMinutes: 60 };
  fs.writeFileSync(file, ignored.map((row) => JSON.stringify(row)).join("\n"));
  assert.equal(typedApproval(args), null, "nothing a person typed");
  fs.appendFileSync(file, `\n${JSON.stringify(queued({ kind: "human" }))}\n`);
  assert.ok(typedApproval(args), "a line typed while the agent was busy counts");
});

test("a very long command line is judged in good time", () => {
  const repo = makeRepo();
  const started = Date.now();
  assert.equal(verdictOf(repo, `echo "${"git commit -m x && git push origin main; ".repeat(5000)}"`), "allow");
  assert.equal(verdictOf(repo, `git commit --allow-empty -m "${"a ".repeat(200000)} --no-verify"`), "allow");
  assert.equal(verdictOf(repo, "git commit --allow-empty -m x; ".repeat(300)), "allow");
  assert.ok(Date.now() - started < 15000, `took ${Date.now() - started} ms`);
});

test("a line the guard cannot read to the end is refused, not waved through", () => {
  const repo = makeRepo();
  commit(repo, "app.js", "export const answer = 42;\n");
  // Commands inside commands, deeper than the reader follows: a push could hide at the bottom.
  const deep = (levels, inner) => `${'bash -c "'.repeat(1)}${"$(".repeat(levels)}${inner}${")".repeat(levels)}"`;
  assert.match(judge(repo, deep(40, "git push origin main")).reason, /deeper than the guard reads/);
  assert.match(judge(repo, `${"(".repeat(500)}git status${")".repeat(500)}`).reason, /deeper than the guard reads/);
  assert.match(judge(repo, deep(4, "git push origin main")).reason, NOT_READY);
  // More checks than one line can pay for.
  const many = Array.from({ length: 25 }, (_, index) => `git push origin HEAD:feature/${index}`).join("; ");
  assert.match(judge(repo, many).reason, /more than 20 different commits and pushes/);
});
