#!/usr/bin/env node
// Prints what the guard says in a few common situations, on a throwaway repository.
// Nothing is pushed anywhere and nothing destructive runs: every line goes through
// `guardrails check`, which only judges a command. Run: node plugins/guardrails/scripts/demo.mjs
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "cli.mjs");
const base = fs.mkdtempSync(path.join(os.tmpdir(), "guardrails-demo-"));
const repo = path.join(base, "shop");
const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });

execFileSync("git", ["init", "-q", "--bare", "-b", "main", path.join(base, "origin.git")]);
execFileSync("git", ["init", "-q", "-b", "main", repo]);
git("config", "user.email", "demo@example.com");
git("config", "user.name", "Demo");
git("config", "commit.gpgsign", "false");
git("remote", "add", "origin", path.join(base, "origin.git"));
fs.writeFileSync(
  path.join(repo, "package.json"),
  `${JSON.stringify({ name: "shop", scripts: { test: 'node -e "console.log(\'12 tests passed\')"' } }, null, 2)}\n`,
);
fs.writeFileSync(path.join(repo, "cart.js"), "export const total = (items) => items.reduce((sum, item) => sum + item.price, 0);\n");
git("add", ".");
git("commit", "-q", "-m", "Add cart total");

function show(label, args, { hideFolder = true } = {}) {
  const run = spawnSync("node", [CLI, ...args], { cwd: repo, encoding: "utf8" });
  let out = `${run.stdout}${run.stderr}`.trimEnd();
  if (hideFolder) {
    const where = repo.split("\\").join("/");
    out = out.split(where).join("~/shop").split(CLI.split("\\").join("/")).join("<plugin>/cli.mjs");
  }
  out = out
    .split("\n")
    .filter((line) => !line.startsWith(">") && line.trim() !== "")
    .join("\n");
  process.stdout.write(`$ ${label}\n${out}\n\n`);
}

try {
  show('guardrails check "git push origin main"', ["check", "git push origin main"]);
  show("guardrails test", ["test"]);
  show('guardrails check "git push --force origin main"', ["check", "git push --force origin main"]);
  fs.appendFileSync(path.join(repo, "cart.js"), `const paymentKey = "${"sk_" + "live_"}${"a1b2c3d4e5f6g7h8i9j0k1l2"}";\n`);
  git("add", ".");
  show('guardrails check "git commit -m wip"', ["check", "git commit -m wip"]);
} finally {
  fs.rmSync(base, { recursive: true, force: true });
}
