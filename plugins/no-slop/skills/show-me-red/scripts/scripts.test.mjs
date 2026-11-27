// Tests for kill-matrix.mjs and make-mutants.mjs. Run: node --test scripts.test.mjs
// Every report, package and test name below is invented.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { breaksFor, disagreements, failureOf, outcomesOf, render } from "./kill-matrix.mjs";
import { fingerprintOf, makeMutants, replaceExactlyOnce } from "./make-mutants.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "show-me-red-test-"));
after(() => fs.rmSync(ROOT, { recursive: true, force: true }));

const passed = () => ({ status: "expected", results: [{ status: "passed" }] });
const assertionFailed = (line) => ({
  status: "unexpected",
  results: [{ status: "failed", error: { message: "Error: expect(locator).toHaveText(expected)\n\nExpected: \"Total: 12\"", location: { file: "/x/cart.spec.ts", line } } }],
});
const customMessageFailed = (line) => ({
  status: "unexpected",
  results: [{ status: "failed", error: { message: "\u001b[31mtotal shown\u001b[39m\n\nexpect(received).toBe(expected)", location: { file: "/x/cart.spec.ts", line } } }],
});
const timedOut = () => ({ status: "unexpected", results: [{ status: "timedOut", error: { message: "Test timeout of 30000ms exceeded." } }] });
const setupFailed = () => ({
  status: "unexpected",
  results: [{ status: "failed", error: { message: "Error: page.goto: net::ERR_CONNECTION_REFUSED", location: { file: "/x/cart.spec.ts", line: 4 } } }],
});

/** A Playwright-shaped JSON report: one file, one describe, one test per entry. */
function report(entries) {
  return {
    suites: [
      {
        title: "cart.spec.ts",
        specs: [],
        suites: [
          {
            title: "cart",
            specs: Object.entries(entries).map(([title, outcome]) => ({
              title,
              file: "cart.spec.ts",
              tests: [{ projectName: "chromium", ...outcome }],
            })),
          },
        ],
      },
    ],
  };
}
const run = (label, entries) => ({ label, outcomes: outcomesOf(report(entries)) });
const NAME = (title) => `cart.spec.ts › cart › ${title} [chromium]`;

test("a failed expect at a line is a kill, with the file and line", () => {
  assert.deepEqual(failureOf(assertionFailed(71)), { isKill: true, where: "cart.spec.ts:71" });
});

test("a custom expect message before the matcher line still counts as a kill", () => {
  assert.equal(failureOf(customMessageFailed(30)).isKill, true);
});

test("a timeout and a setup error are red but not kills", () => {
  assert.deepEqual(failureOf(timedOut()), { isKill: false, where: "no location", why: "test timeout" });
  const setup = failureOf(setupFailed());
  assert.equal(setup.isKill, false);
  assert.match(setup.why, /ERR_CONNECTION_REFUSED/);
});

test("a passing test has no failure", () => {
  assert.equal(failureOf(passed()), undefined);
});

test("base and change that agree are reported the same; a differing test is named", () => {
  const base = [run("base-1", { total: passed(), empty: passed() })];
  const same = [run("change-1", { total: passed(), empty: passed() })];
  const names = [NAME("empty"), NAME("total")];
  assert.deepEqual(disagreements(base, same, names), []);
  const differ = [run("change-1", { total: assertionFailed(12), empty: passed() })];
  assert.deepEqual(disagreements(base, differ, names), [NAME("total")]);
});

test("a test missing from one run counts as a difference", () => {
  const base = [run("base-1", { total: passed() })];
  const change = [run("change-1", {})];
  assert.deepEqual(disagreements(base, change, [NAME("total")]), [NAME("total")]);
});

test("breaks are sorted into killed, red-but-not-a-kill and stayed green", () => {
  const breaks = [
    run("markup", { total: assertionFailed(71) }),
    run("timeout", { total: timedOut() }),
    run("copy", { total: passed() }),
  ];
  const result = breaksFor(breaks, NAME("total"));
  assert.deepEqual(result.killedBy, ["markup (cart.spec.ts:71)"]);
  assert.deepEqual(result.notKills, ["timeout: test timeout at no location"]);
  assert.deepEqual(result.stayedGreenOn, ["copy"]);
});

test("the printout lists the tests no break killed", () => {
  const text = render({
    baseRuns: [run("base-1", { total: passed(), empty: passed() })],
    changeRuns: [run("change-1", { total: passed(), empty: passed() })],
    breakRuns: [run("markup", { total: assertionFailed(71), empty: passed() })],
  });
  assert.match(text, /same in all 2 runs/);
  assert.match(text, /\| cart\.spec\.ts › cart › total \[chromium\] \| expected \| expected \| markup \(cart\.spec\.ts:71\) \|/);
  assert.match(text, /Killed by no break \(1\): \n {2}cart\.spec\.ts › cart › empty \[chromium\]/);
});

test("the command line reads report files and exits 2 without arguments", () => {
  const file = path.join(ROOT, "markup.json");
  fs.writeFileSync(file, JSON.stringify(report({ total: assertionFailed(71) })));
  const ok = spawnSync(process.execPath, [path.join(HERE, "kill-matrix.mjs"), "--break", `markup=${file}`], { encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /markup \(cart\.spec\.ts:71\)/);
  const bad = spawnSync(process.execPath, [path.join(HERE, "kill-matrix.mjs")], { encoding: "utf8" });
  assert.equal(bad.status, 2);
});

test("a swap must match exactly once", () => {
  assert.equal(replaceExactlyOnce("a + b", { name: "op", from: "+", to: "-" }), "a - b");
  assert.throws(() => replaceExactlyOnce("a + b + c", { name: "op", from: "+", to: "-" }), /found 2/);
  assert.throws(() => replaceExactlyOnce("a * b", { name: "op", from: "+", to: "-" }), /found 0/);
  assert.throws(() => replaceExactlyOnce("a", { name: "op", from: "", to: "-" }), /empty/);
});

/** An invented package with one bundle file, written under the test folder. */
function fakePackage(name) {
  const dir = path.join(ROOT, name, "package");
  fs.mkdirSync(path.join(dir, "dist"), { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "acme-texts", version: "1.0.0" }));
  fs.writeFileSync(path.join(dir, "dist", "index.js"), 'export const lang = "de-DE";\nexport const nest = (k) => k.split(".");\n');
  return dir;
}

test("mutants are built, marked, packed and listed with fingerprints", () => {
  const pkg = fakePackage("build-under-test");
  const out = path.join(ROOT, "mutants");
  const builds = makeMutants({
    package: pkg,
    bundle: "dist/index.js",
    out,
    listed: [{ name: "new", package: pkg, tarball: "new.tgz" }],
    mutants: [{ name: "language", breaks: "every request asks for US English", from: '"de-DE"', to: '"en-US"' }],
  });
  assert.deepEqual(builds.map((b) => b.name), ["new", "mutant-language"]);
  const bundle = fs.readFileSync(path.join(out, "language", "package", "dist", "index.js"), "utf8");
  assert.match(bundle, /"en-US"/);
  assert.match(bundle, /globalThis\.__MUTANT_BUILD__ = "mutant-language";/);
  assert.equal(fs.readFileSync(path.join(pkg, "dist", "index.js"), "utf8").includes("en-US"), false, "the original is untouched");
  assert.ok(fs.statSync(path.join(out, "mutant-language.tgz")).size > 0);
  assert.equal(builds[0].fingerprint, fingerprintOf(path.join(pkg, "dist", "index.js")));
  assert.notEqual(builds[0].fingerprint, builds[1].fingerprint);
  const rows = fs.readFileSync(path.join(out, "builds.tsv"), "utf8").trim().split("\n");
  assert.equal(rows.length, 2);
  assert.match(rows[1], /^mutant-language\t[0-9a-f]{16}\t/);
});

test("a refused swap stops the build, and the command line exits 2", () => {
  const pkg = fakePackage("refused");
  const config = path.join(ROOT, "refused.json");
  fs.writeFileSync(config, JSON.stringify({ package: pkg, bundle: "dist/index.js", out: path.join(ROOT, "refused-out"), mutants: [{ name: "none", from: "not in the bundle", to: "x" }] }));
  const result = spawnSync(process.execPath, [path.join(HERE, "make-mutants.mjs"), config], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /expected 1 match/);
});

test("a mutant name that could escape the output folder is refused", () => {
  const pkg = fakePackage("bad-name");
  assert.throws(
    () => makeMutants({ package: pkg, bundle: "dist/index.js", out: path.join(ROOT, "bad-out"), mutants: [{ name: "../x", from: "de-DE", to: "x" }] }),
    /must be letters/,
  );
});
