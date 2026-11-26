#!/usr/bin/env node
// Prints what the guard says in a few common situations, on a throwaway repository.
// Nothing is pushed anywhere and nothing destructive runs: every line goes through
// `guardrails check`, which only judges a command. Run: node plugins/guardrails/scripts/demo.mjs
// The picture in the README is the first refusal: node plugins/guardrails/scripts/demo.mjs --svg
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
  return `$ ${label}\n${out}`;
}

/** The first refusal as a terminal picture, for the README. Colours follow the meaning of each line. */
function picture(text) {
  const rows = text.split("\n");
  const width = 860;
  const height = 78 + rows.length * 21;
  const escape = (row) => row.split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;");
  const style = (row) => {
    if (row.startsWith("$")) return 'fill="#e6edf3" font-weight="700"';
    if (row === "DENY") return 'fill="#ff7b72" font-weight="700"';
    if (row.startsWith("BLOCKED")) return 'fill="#ffa198"';
    if (row.trimEnd().endsWith(": NO")) return 'fill="#f2cc60"';
    if (row.trimStart().startsWith("approve production")) return 'fill="#7ee787" font-weight="700"';
    return 'fill="#9da7b3"';
  };
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Terminal: the guard refuses a push to main and lists what is missing: tests, review and a human approval">`,
    `  <rect width="${width}" height="${height}" rx="10" fill="#0d1117"/>`,
    `  <rect width="${width}" height="34" rx="10" fill="#161b22"/>`,
    `  <rect y="24" width="${width}" height="10" fill="#161b22"/>`,
    '  <circle cx="22" cy="17" r="6" fill="#ff5f57"/><circle cx="42" cy="17" r="6" fill="#febc2e"/><circle cx="62" cy="17" r="6" fill="#28c840"/>',
    `  <text x="${width / 2}" y="22" fill="#7d8590" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" text-anchor="middle">an agent tries to push to main</text>`,
    '  <g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="13">',
    ...rows.map((row, index) => `  <text x="24" y="${62 + index * 21}" ${style(row)} xml:space="preserve">${escape(row)}</text>`),
    "  </g>",
    "</svg>",
    "",
  ].join("\n");
}

const asPicture = process.argv.includes("--svg");
const print = (text) => asPicture || process.stdout.write(`${text}\n\n`);

try {
  const refusal = show('guardrails check "git push origin main"', ["check", "git push origin main"]);
  if (asPicture) process.stdout.write(picture(refusal));
  print(refusal);
  print(show("guardrails test", ["test"]));
  print(show('guardrails check "git push --force origin main"', ["check", "git push --force origin main"]));
  fs.appendFileSync(path.join(repo, "cart.js"), `const paymentKey = "${"sk_" + "live_"}${"a1b2c3d4e5f6g7h8i9j0k1l2"}";\n`);
  git("add", ".");
  print(show('guardrails check "git commit -m wip"', ["check", "git commit -m wip"]));
} finally {
  fs.rmSync(base, { recursive: true, force: true });
}
