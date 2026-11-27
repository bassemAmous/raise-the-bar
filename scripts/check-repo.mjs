#!/usr/bin/env node
// Checks the repository itself, with no dependencies:
//   1. every skill description says what the skill is not for, and no two skills share a trigger phrase;
//   2. every plugin has a version, and the marketplace file lists the same plugins with the same words.
//      One more entry is allowed for an old name of a plugin: it points at that plugin and names it;
//   3. with --base <ref>: a plugin whose files changed since <ref> has a new version, and a plugin
//      that shipped hooks at <ref> is still listed under the name people installed.
// Run: node scripts/check-repo.mjs [--base origin/main]
// Exit code 0 means clean, 1 means a finding, 2 means the check itself could not run.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
// git's own error text is kept out of the output: a path that is missing at <ref> is an answer here.
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
/** "./plugins/no-yolo" -> "plugins/no-yolo". Null for a source that is not a folder of this repository. */
const folderOf = (source) => (typeof source === "string" && source.startsWith("./") ? source.replace(/^\.\/|\/+$/g, "") : null);

/** The `description` of a SKILL.md, whether it is written on one line or folded over several. */
export function descriptionOf(text) {
  const front = text.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---/);
  if (!front) return null;
  const rows = front[1].split("\n");
  const at = rows.findIndex((row) => row.startsWith("description:"));
  if (at === -1) return null;
  const parts = [rows[at].slice("description:".length).trim().replace(/^[>|][+-]?$/, "")];
  for (let i = at + 1; i < rows.length && /^\s+\S|^\s*$/.test(rows[i]); i++) parts.push(rows[i].trim());
  return parts.filter(Boolean).join(" ").replace(/^(["'])([\s\S]*)\1$/, "$2");
}

/** The phrases in double quotes: the words a user says that should start the skill. */
export const triggersOf = (description) =>
  [...description.matchAll(/"([^"]{3,})"/g)].map((match) => match[1].toLowerCase().trim());

function skills() {
  const found = [];
  const plugins = path.join(ROOT, "plugins");
  for (const plugin of fs.readdirSync(plugins)) {
    const dir = path.join(plugins, plugin, "skills");
    if (!fs.existsSync(dir)) continue;
    for (const skill of fs.readdirSync(dir)) {
      const file = path.join(dir, skill, "SKILL.md");
      if (fs.existsSync(file)) found.push({ id: `${plugin}:${skill}`, file });
    }
  }
  return found;
}

function checkSkills() {
  const all = skills().map((skill) => ({ ...skill, description: descriptionOf(fs.readFileSync(skill.file, "utf8")) }));
  for (const skill of all) {
    if (!skill.description) {
      problems.push(`${skill.id}: SKILL.md has no description`);
      continue;
    }
    if (!/(?:^|[.?!]\s+)Not for\b/.test(skill.description))
      problems.push(`${skill.id}: the description has no sentence that starts with "Not for"`);
  }
  // Two skills that answer to the same words leave the model to guess which one was meant.
  const described = all.filter((skill) => skill.description);
  for (const a of described)
    for (const b of described) {
      if (a.id >= b.id) continue;
      for (const one of triggersOf(a.description))
        for (const two of triggersOf(b.description))
          if (one.includes(two) || two.includes(one))
            problems.push(`${a.id} and ${b.id} share a trigger phrase: "${one}" and "${two}"`);
    }
  return all.length;
}

function plugins() {
  return fs
    .readdirSync(path.join(ROOT, "plugins"))
    .filter((name) => fs.existsSync(path.join(ROOT, "plugins", name, ".claude-plugin", "plugin.json")));
}

function checkManifests() {
  const market = readJson(path.join(ROOT, ".claude-plugin", "marketplace.json"));
  const listed = new Map(market.plugins.map((plugin) => [plugin.name, plugin]));
  for (const name of plugins()) {
    const manifest = readJson(path.join(ROOT, "plugins", name, ".claude-plugin", "plugin.json"));
    if (manifest.name !== name) problems.push(`plugins/${name}: plugin.json names it "${manifest.name}"`);
    if (!/^\d+\.\d+\.\d+$/.test(manifest.version ?? "")) problems.push(`plugins/${name}: version "${manifest.version}" is not x.y.z`);
    const entry = listed.get(name);
    if (!entry) problems.push(`plugins/${name}: not listed in .claude-plugin/marketplace.json`);
    else if (entry.description !== manifest.description)
      problems.push(`plugins/${name}: the marketplace file and plugin.json describe it with different words`);
    listed.delete(name);
  }
  // What is left has no folder of its own. It may be the old name of a plugin that was renamed.
  for (const [name, entry] of listed) {
    const target = path.posix.basename(folderOf(entry.source) ?? "");
    if (!plugins().includes(target) || folderOf(entry.source) !== `plugins/${target}`)
      problems.push(`marketplace.json lists "${name}", but plugins/${name} has no plugin.json`);
    else if (!entry.description?.includes(target))
      problems.push(`marketplace.json: "${name}" is an old name of plugins/${target}, and its description does not say "${target}"`);
  }
  return listed.size;
}

/**
 * Hooks protect people without a word, and they stop without a word too: Claude Code no longer
 * loads a plugin whose name left the marketplace file. So a name that shipped hooks stays listed.
 */
function checkHookNamesKept(base) {
  let before;
  try {
    before = JSON.parse(git("show", `${base}:.claude-plugin/marketplace.json`));
  } catch {
    return; // no marketplace file at <ref>: nobody installed from it
  }
  const listedNow = new Set(readJson(path.join(ROOT, ".claude-plugin", "marketplace.json")).plugins.map((plugin) => plugin.name));
  for (const entry of before.plugins ?? []) {
    const folder = folderOf(entry.source);
    const shippedHooks = folder !== null && git("ls-tree", "-r", "--name-only", base, "--", `${folder}/hooks/hooks.json`) !== "";
    if (shippedHooks && !listedNow.has(entry.name))
      problems.push(
        `"${entry.name}" shipped hooks at ${base} and is no longer listed in marketplace.json. Someone who installed it under that name ` +
          `loses the hooks on the next update. Keep an entry named "${entry.name}" whose source is the plugin that has the hooks now.`,
      );
  }
}

/** People who installed a plugin get a change only when its version is new. */
function checkVersionBumps(base) {
  for (const name of plugins()) {
    const manifest = `plugins/${name}/.claude-plugin/plugin.json`;
    const changed = git("diff", "--name-only", `${base}...HEAD`, "--", `plugins/${name}`);
    if (!changed) continue;
    let before = null;
    try {
      before = JSON.parse(git("show", `${base}:${manifest}`)).version;
    } catch {
      continue; // a new plugin has no earlier version
    }
    const now = readJson(path.join(ROOT, manifest)).version;
    if (before === now)
      problems.push(
        `plugins/${name} changed since ${base} (${changed.split("\n").length} files) but its version is still ${now}. ` +
          `Raise "version" in ${manifest}.`,
      );
  }
}

function main() {
  const at = process.argv.indexOf("--base");
  const base = at === -1 ? null : process.argv[at + 1];
  // A base that starts with "-" would reach git as an option, not a ref.
  if (at !== -1 && (!base || base.startsWith("-"))) {
    process.stderr.write("usage: node scripts/check-repo.mjs [--base <ref>]\n");
    process.exit(2);
  }
  const count = checkSkills();
  const oldNames = checkManifests();
  if (base) checkVersionBumps(base);
  if (base) checkHookNamesKept(base);
  if (problems.length) {
    process.stderr.write(`${problems.map((problem) => `- ${problem}`).join("\n")}\n${problems.length} problem(s).\n`);
    process.exit(1);
  }
  const kept = oldNames ? `, ${oldNames} old name(s) kept` : "";
  process.stdout.write(`check-repo: ${count} skills, ${plugins().length} plugins${kept}${base ? `, versions checked against ${base}` : ""}. Clean.\n`);
}

// Real paths on both sides: a folder reached through a link (macOS /var, a Windows junction) would
// otherwise make the script exit 0 without running.
if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`check-repo could not run: ${error?.message ?? error}\n`);
    process.exit(2);
  }
}
