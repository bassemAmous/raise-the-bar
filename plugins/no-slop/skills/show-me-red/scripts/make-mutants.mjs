#!/usr/bin/env node
/**
 * make-mutants: builds broken copies of one npm package, each from one exact text swap in its
 * shipped bundle, so an app installs a break the way it installs the real package.
 *
 * Usage:
 *   node make-mutants.mjs <config.json>
 *
 * The config (paths may be absolute, or relative to the config file):
 *   {
 *     "package": "unpacked/package",          the build under test, unpacked
 *     "bundle": "dist/index.js",              the file the swaps apply to, inside the package
 *     "out": "mutants",                       where the mutants go
 *     "listed": [{ "name": "new", "package": "unpacked/package", "tarball": "new.tgz" }],
 *     "mutants": [{ "name": "markup", "breaks": "markup stays as sent", "from": "exact text", "to": "replacement" }]
 *   }
 *
 * For each mutant it writes <out>/<name>/package with the swap applied and a marker line
 * (globalThis.__MUTANT_BUILD__ = "mutant-<name>") at the end of the bundle, packs it as
 * <out>/mutant-<name>.tgz, and lists every build with its fingerprint (the first 16 hex digits
 * of the bundle's sha256) in <out>/builds.tsv. The "listed" builds come first, unchanged.
 *
 * A swap whose "from" text does not match exactly once is refused: zero or two matches mean the
 * swap is wrong.
 *
 * Exit codes: 0 = all mutants built, 2 = bad config, a refused swap, or a failed pack.
 * No dependencies. Needs `tar` on the PATH. Node 20 or later.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The first 16 hex digits of the sha256 of a file's bytes. */
export const fingerprintOf = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 16);

/** The text with `from` replaced by `to`; throws unless `from` occurs exactly once. */
export function replaceExactlyOnce(text, { name, from, to }) {
  if (!from) throw new Error(`mutant-${name}: "from" is empty`);
  const parts = text.split(from);
  if (parts.length !== 2) throw new Error(`mutant-${name}: expected 1 match of "from", found ${parts.length - 1}`);
  return parts.join(to);
}

/** True when `child` is strictly inside `parent` (both resolved). */
const isInside = (parent, child) => {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
};

function buildMutant(config, mutant) {
  const root = path.join(config.out, mutant.name);
  if (!isInside(config.out, root)) throw new Error(`mutant-${mutant.name}: its folder must stay inside "out"`);
  const copy = path.join(root, "package");
  fs.rmSync(root, { recursive: true, force: true });
  fs.cpSync(config.package, copy, { recursive: true });
  const bundle = path.join(copy, config.bundle);
  const broken = replaceExactlyOnce(fs.readFileSync(bundle, "utf8"), mutant);
  // A runner looks for this line in the file the dev server served, to prove which build ran.
  fs.writeFileSync(bundle, `${broken}\nglobalThis.__MUTANT_BUILD__ = "mutant-${mutant.name}";\n`);
  const tarball = `mutant-${mutant.name}.tgz`;
  // Relative paths only: GNU tar reads "C:" in an absolute Windows path as a remote host.
  execFileSync("tar", ["-czf", tarball, "-C", mutant.name, "package"], { cwd: config.out, stdio: "pipe" });
  return { name: `mutant-${mutant.name}`, fingerprint: fingerprintOf(bundle), tarball: path.join(config.out, tarball) };
}

/** Builds every mutant of a parsed config and returns the build list that builds.tsv holds. */
export function makeMutants(config) {
  for (const key of ["package", "bundle", "out"])
    if (typeof config[key] !== "string" || !config[key]) throw new Error(`config needs "${key}"`);
  if (!Array.isArray(config.mutants) || config.mutants.length === 0) throw new Error('config needs a non-empty "mutants" list');
  for (const { name } of config.mutants)
    // A name made only of dots ("." or "..") would point at the output folder or its parent.
    if (!/^(?!\.+$)[A-Za-z0-9._-]+$/.test(name ?? "")) throw new Error(`mutant name "${name}" must be letters, digits, dot, dash or underscore, and not only dots`);
  // The bundle is a path inside the package; a "../" path would edit a file outside the copy.
  if (!isInside("package", path.join("package", config.bundle))) throw new Error(`"bundle" must stay inside the package: "${config.bundle}"`);
  fs.mkdirSync(config.out, { recursive: true });
  const listed = (config.listed ?? []).map(({ name, package: dir, tarball }) => ({
    name,
    fingerprint: fingerprintOf(path.join(dir, config.bundle)),
    tarball,
  }));
  const builds = [...listed, ...config.mutants.map((mutant) => buildMutant(config, mutant))];
  fs.writeFileSync(path.join(config.out, "builds.tsv"), `${builds.map((b) => `${b.name}\t${b.fingerprint}\t${b.tarball}`).join("\n")}\n`);
  return builds;
}

function loadConfig(file) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const from = (p) => (p ? path.resolve(path.dirname(file), p) : p);
  return {
    ...raw,
    package: from(raw.package),
    out: from(raw.out),
    listed: (raw.listed ?? []).map((entry) => ({ ...entry, package: from(entry.package), tarball: from(entry.tarball) })),
  };
}

function main() {
  const file = process.argv[2];
  if (!file) throw new Error("usage: node make-mutants.mjs <config.json>");
  const config = loadConfig(file);
  const builds = makeMutants(config);
  for (const { name, breaks } of config.mutants) process.stdout.write(`mutant-${name}: ${breaks ?? ""}\n`);
  for (const { name, fingerprint } of builds) process.stdout.write(`${name} ${fingerprint}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`make-mutants could not run: ${error?.message ?? error}\n`);
    process.exit(2);
  }
}
