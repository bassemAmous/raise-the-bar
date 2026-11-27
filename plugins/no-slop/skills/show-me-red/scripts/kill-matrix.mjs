#!/usr/bin/env node
/**
 * kill-matrix: reads Playwright JSON reports and says which tests a break turned red.
 *
 * Usage:
 *   node kill-matrix.mjs --base a.json,b.json --change c.json,d.json --break <label>=<report.json> ...
 *
 *   --base     reports of the same spec run on the base (comma separated)
 *   --change   reports of the same spec run on the change (comma separated)
 *   --break    one report per break, labelled; may be given several times
 *
 * A report is Playwright's JSON reporter output (--reporter=json).
 *
 * It prints:
 *   1. whether base and change agree, test by test;
 *   2. one row per test: the breaks that killed it and at which line, the breaks that turned it
 *      red without a kill (a timeout, a crash, an error before any assertion), and the breaks it
 *      stayed green on;
 *   3. the tests no break killed.
 *
 * A kill is a failed expect(). A timeout or a setup error only shows that the test broke.
 *
 * Exit codes: 0 = the table was printed, 2 = bad usage or a report that could not be read.
 * Read-only. No dependencies. Node 20 or later.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ANSI_COLOUR = /\u001b\[[0-9;]*m/g;

function* testsIn(suite, titles) {
  for (const spec of suite.specs ?? []) {
    const title = [...titles, spec.title].join(" › ");
    for (const test of spec.tests ?? []) yield { name: `${spec.file} › ${title} [${test.projectName}]`, test };
  }
  for (const child of suite.suites ?? []) yield* testsIn(child, [...titles, child.title]);
}

/** Why a test went red, and whether that counts as a kill. Undefined for a test that did not fail. */
export function failureOf(test) {
  const last = (test.results ?? []).at(-1);
  if (test.status !== "unexpected" || !last) return undefined;
  const lines = (last.error?.message ?? "").replace(ANSI_COLOUR, "").split("\n");
  const location = last.error?.location;
  const where = location ? `${path.basename(location.file)}:${location.line}` : "no location";
  if (last.status === "timedOut") return { isKill: false, where, why: "test timeout" };
  // A custom expect message comes before the matcher line, so every line is searched.
  if (lines.some((line) => /^\s*(Error: )?expect\(/.test(line))) return { isKill: true, where };
  const first = lines.find((line) => line.trim() !== "") ?? "";
  return { isKill: false, where, why: first.slice(0, 80) };
}

/** Map of test name to { status, failure } for one parsed Playwright JSON report. */
export function outcomesOf(report) {
  const outcomes = new Map();
  for (const fileSuite of report.suites ?? [])
    for (const { name, test } of testsIn(fileSuite, []))
      outcomes.set(name, { status: test.status, failure: failureOf(test) });
  return outcomes;
}

const statusesOf = (runs, name) => runs.map(({ outcomes }) => outcomes.get(name)?.status ?? "missing");

/** The tests whose status differs between any two of the base and change runs. */
export function disagreements(baseRuns, changeRuns, names) {
  const runs = [...baseRuns, ...changeRuns];
  return names.filter((name) => new Set(statusesOf(runs, name)).size > 1);
}

/** For one test: which breaks killed it, which turned it red without a kill, which left it green. */
export function breaksFor(breakRuns, name) {
  const killedBy = [];
  const notKills = [];
  const stayedGreenOn = [];
  for (const { label, outcomes } of breakRuns) {
    const outcome = outcomes.get(name);
    if (outcome?.status === "expected") stayedGreenOn.push(label);
    else if (outcome?.failure?.isKill) killedBy.push(`${label} (${outcome.failure.where})`);
    else if (outcome?.failure) notKills.push(`${label}: ${outcome.failure.why} at ${outcome.failure.where}`);
    else notKills.push(`${label}: ${outcome?.status ?? "not in this run"}`);
  }
  return { killedBy, notKills, stayedGreenOn };
}

/** The whole printout, as text. */
export function render({ baseRuns, changeRuns, breakRuns }) {
  const all = [...baseRuns, ...changeRuns, ...breakRuns];
  const names = [...new Set(all.flatMap(({ outcomes }) => [...outcomes.keys()]))].sort();
  const out = [];
  if (baseRuns.length + changeRuns.length > 0) {
    const labels = [...baseRuns, ...changeRuns].map(({ label }) => label).join(", ");
    const differing = disagreements(baseRuns, changeRuns, names);
    if (differing.length === 0) out.push(`same in all ${baseRuns.length + changeRuns.length} runs (${labels})`);
    else {
      out.push(`DIFFER in ${differing.length} tests (${labels}):`);
      for (const name of differing)
        out.push(`  ${name}: base ${statusesOf(baseRuns, name).join(",")} · change ${statusesOf(changeRuns, name).join(",")}`);
    }
  }
  if (breakRuns.length === 0) return out.join("\n");
  out.push("", "| Test | Base | Change | Killed by (at) | Red, but not a kill | Stayed green on |", "|---|---|---|---|---|---|");
  const neverKilled = [];
  for (const name of names) {
    const { killedBy, notKills, stayedGreenOn } = breaksFor(breakRuns, name);
    if (killedBy.length === 0) neverKilled.push(name);
    const cells = [
      name,
      statusesOf(baseRuns, name).join(", ") || "—",
      statusesOf(changeRuns, name).join(", ") || "—",
      killedBy.join("; ") || "—",
      notKills.join("; ") || "—",
      stayedGreenOn.join(", ") || "—",
    ];
    out.push(`| ${cells.join(" | ")} |`);
  }
  out.push("", `Killed by no break (${neverKilled.length}): ${neverKilled.length ? `\n  ${neverKilled.join("\n  ")}` : "none"}`);
  return out.join("\n");
}

function readRun(file, label = path.basename(file)) {
  return { label, outcomes: outcomesOf(JSON.parse(fs.readFileSync(file, "utf8"))) };
}

function main() {
  const { values } = parseArgs({
    options: { base: { type: "string" }, change: { type: "string" }, break: { type: "string", multiple: true } },
  });
  const list = (value) => (value ? value.split(",").filter(Boolean) : []);
  const breakRuns = (values.break ?? []).map((pair) => {
    const at = pair.indexOf("=");
    if (at < 1) throw new Error(`--break needs <label>=<report.json>, got "${pair}"`);
    return readRun(pair.slice(at + 1), pair.slice(0, at));
  });
  const baseRuns = list(values.base).map((file) => readRun(file));
  const changeRuns = list(values.change).map((file) => readRun(file));
  if (baseRuns.length + changeRuns.length + breakRuns.length === 0)
    throw new Error("usage: node kill-matrix.mjs --base a.json --change b.json --break <label>=c.json");
  process.stdout.write(`${render({ baseRuns, changeRuns, breakRuns })}\n`);
}

// Real paths on both sides: a folder reached through a link (macOS /var, a Windows junction) would
// otherwise make the script exit 0 without running.
if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`kill-matrix could not run: ${error?.message ?? error}\n`);
    process.exit(2);
  }
}
