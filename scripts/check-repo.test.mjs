// Tests for check-repo.mjs. Run: node --test scripts/check-repo.test.mjs
// Each test builds a small marketplace repository in the temp folder, copies the script into it
// and runs it there. Every plugin name below is invented.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "check-repo.mjs");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "check-repo-test-"));
let repoCount = 0;

after(() => fs.rmSync(ROOT, { recursive: true, force: true }));

function write(repo, file, content) {
  const full = path.join(repo, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`);
}

const git = (repo, ...args) =>
  execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" }).trim();

function newRepo() {
  repoCount += 1;
  const repo = path.join(ROOT, `repo-${repoCount}`);
  write(repo, "scripts/check-repo.mjs", fs.readFileSync(SCRIPT, "utf8"));
  git(repo, "init", "-q");
  return repo;
}

/** A plugin with one skill, and with a hook file when asked. */
function plugin(repo, name, { hooks = false } = {}) {
  write(repo, `plugins/${name}/.claude-plugin/plugin.json`, { name, version: "1.0.0", description: `The ${name} plugin.` });
  write(repo, `plugins/${name}/skills/${name}-skill/SKILL.md`, `---\nname: ${name}-skill\ndescription: Does the ${name} thing. Not for anything else.\n---\n`);
  if (hooks) write(repo, `plugins/${name}/hooks/hooks.json`, { hooks: {} });
}

const entry = (name) => ({ name, source: `./plugins/${name}`, description: `The ${name} plugin.` });
const oldName = (name, target, description = `Old name of ${target}.`) => ({ name, source: `./plugins/${target}`, description });
const market = (repo, entries) => write(repo, ".claude-plugin/marketplace.json", { name: "test-market", owner: { name: "test" }, plugins: entries });

/** Commits everything and returns the commit, to use as a later --base. */
function commit(repo, message) {
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", message);
  return git(repo, "rev-parse", "HEAD");
}

function check(repo, ...args) {
  const result = spawnSync(process.execPath, [path.join(repo, "scripts", "check-repo.mjs"), ...args], { encoding: "utf8" });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

/** A repository whose plugin was renamed from `before` to `after` in its second commit. */
function renamed(before, after, { hooks }) {
  const repo = newRepo();
  plugin(repo, before, { hooks });
  market(repo, [entry(before)]);
  const base = commit(repo, "first release");
  fs.rmSync(path.join(repo, "plugins", before), { recursive: true });
  plugin(repo, after, { hooks });
  market(repo, [entry(after)]);
  commit(repo, "rename");
  return { repo, base };
}

test("a marketplace file that lists every plugin is clean", () => {
  const repo = newRepo();
  plugin(repo, "keeper", { hooks: true });
  plugin(repo, "helper");
  market(repo, [entry("keeper"), entry("helper")]);
  const result = check(repo);
  assert.equal(result.code, 0, result.err);
  assert.match(result.out, /check-repo: 2 skills, 2 plugins\. Clean\./);
});

test("a plugin that shipped hooks cannot leave the marketplace file under its old name", () => {
  const { repo, base } = renamed("keeper", "watchdog", { hooks: true });
  const dropped = check(repo, "--base", base);
  assert.equal(dropped.code, 1, dropped.out);
  assert.match(dropped.err, /"keeper" shipped hooks at \w+ and is no longer listed in marketplace\.json/);

  market(repo, [entry("watchdog"), oldName("keeper", "watchdog")]);
  commit(repo, "keep the old name");
  const kept = check(repo, "--base", base);
  assert.equal(kept.code, 0, kept.err);
  assert.match(kept.out, /1 skills, 1 plugins, 1 old name\(s\) kept/);
});

test("a plugin with skills only may be renamed without keeping its old name", () => {
  const { repo, base } = renamed("helper", "sidekick", { hooks: false });
  const result = check(repo, "--base", base);
  assert.equal(result.code, 0, result.err);
});

test("an old name must point at a plugin that exists and must say its new name", () => {
  const repo = newRepo();
  plugin(repo, "watchdog", { hooks: true });
  market(repo, [entry("watchdog"), oldName("keeper", "nowhere")]);
  const nowhere = check(repo);
  assert.equal(nowhere.code, 1, nowhere.out);
  assert.match(nowhere.err, /marketplace\.json lists "keeper", but plugins\/keeper has no plugin\.json/);

  market(repo, [entry("watchdog"), oldName("keeper", "watchdog", "Guard hooks.")]);
  const silent = check(repo);
  assert.equal(silent.code, 1, silent.out);
  assert.match(silent.err, /"keeper" is an old name of plugins\/watchdog, and its description does not say "watchdog"/);
});

test("the script still runs when its folder is reached through a link", () => {
  const repo = newRepo();
  plugin(repo, "keeper");
  market(repo, [entry("keeper")]);
  // macOS hands out its temp folder through a link (/var -> /private/var); a junction does the same on Windows.
  const link = path.join(ROOT, `link-${repoCount}`);
  fs.symlinkSync(repo, link, process.platform === "win32" ? "junction" : "dir");
  const result = spawnSync(process.execPath, [path.join(link, "scripts", "check-repo.mjs")], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /check-repo: 1 skills, 1 plugins\. Clean\./, "the script must run, not exit 0 in silence");
});

test("a base that starts with a dash is refused before it reaches git", () => {
  const repo = newRepo();
  plugin(repo, "keeper");
  market(repo, [entry("keeper")]);
  const result = check(repo, "--base", "--output=x");
  assert.equal(result.code, 2, result.out);
  assert.match(result.err, /usage: node scripts\/check-repo\.mjs/);
  assert.equal(fs.existsSync(path.join(repo, "x")), false);
});
