// Tests for check-numbers.mjs. Run: node --test check-numbers.test.mjs
// Each test writes a small session folder to the temp folder and runs the script on it as a
// child process. Every company, price and count below is invented.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "check-numbers.mjs");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "check-numbers-test-"));
let folderCount = 0;

after(() => fs.rmSync(ROOT, { recursive: true, force: true }));

const BRIEF = [
  "# Brief (invented example)",
  "Fake Widgets Ltd sells a made-up plan at $1,234 a month (user).",
  "It has 56 pretend customers (assumed).",
  "",
].join("\n");

const ROUND = [
  "## money",
  "OPTION SCORES: A 8/10, B 4/10",
  "## buyer",
  "OPTION SCORES: A 7/10, B 6/10",
  "",
].join("\n");

function verdict(lines) {
  return ["# Council: the made-up plan", "Seat runs: 4", "", ...lines, ""].join("\n");
}

// Writes the files into a new folder and runs the script on it.
function run(files, extraArgs = []) {
  folderCount += 1;
  const folder = path.join(ROOT, `session-${folderCount}`);
  fs.mkdirSync(folder);
  for (const [name, text] of Object.entries(files)) {
    fs.writeFileSync(path.join(folder, name), text);
  }
  return runScript([folder, ...extraArgs]);
}

function runScript(args) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

const RIGHT_MATH = "Math A: (3x8 + 2x7) / 5 = 7.6";
const WRONG_MATH = "Math A: (3x8 + 2x7) / 5 = 9.6";
const INVENTED = "The plan would bring in $987,654 a year.";

test("a clean verdict passes", () => {
  const result = run({
    "brief.md": BRIEF,
    "round-2.md": ROUND,
    "verdict.md": verdict([
      "The plan costs $1,234 a month and 56 customers pay it.",
      "Option scores: A 7.6, B 4.8",
      RIGHT_MATH,
      "Math B: (3x4 + 2x6) / 5 = 4.8",
      "1. Review on 2031-04-15.",
    ]),
  });
  assert.equal(result.code, 0, result.out + result.err);
  assert.match(result.out, /traced: 2, marked assumed: 0, unverified: 0/);
  assert.match(result.out, /Math lines checked: 2, wrong: 0/);
});

test("an invented figure fails", () => {
  const result = run({
    "brief.md": BRIEF,
    "verdict.md": verdict(["The plan costs $1,234 a month.", INVENTED]),
  });
  assert.equal(result.code, 1, result.out + result.err);
  assert.match(result.out, /UNVERIFIED\s+\$987,654/);
});

test("the same invented figure inside a markdown fence still fails", () => {
  const result = run({
    "brief.md": BRIEF,
    "verdict.md": ["```markdown", verdict(["The plan costs $1,234 a month.", INVENTED]), "```", ""].join("\n"),
  });
  assert.equal(result.code, 1, result.out + result.err);
  assert.match(result.out, /UNVERIFIED\s+\$987,654/);
});

test("an invented figure inside a fence with another language still fails", () => {
  const result = run({
    "brief.md": BRIEF,
    "verdict.md": ["```js", INVENTED, "```", "~~~", INVENTED, "~~~", ""].join("\n"),
  });
  assert.equal(result.code, 1, result.out + result.err);
  assert.match(result.out, /unverified: 2/);
});

test("a figure marked (assumed) passes and is listed", () => {
  const result = run({
    "brief.md": BRIEF,
    "verdict.md": verdict(["Churn would stay near 12% (assumed)."]),
  });
  assert.equal(result.code, 0, result.out + result.err);
  assert.match(result.out, /ASSUMED\s+12%/);
});

test("a wrong weighted average fails", () => {
  const result = run({
    "brief.md": BRIEF,
    "verdict.md": verdict(["The plan costs $1,234 a month.", WRONG_MATH]),
  });
  assert.equal(result.code, 1, result.out + result.err);
  assert.match(result.out, /MATH\s+says 9\.6, but the sum gives 7\.6/);
});

test("a wrong weighted average fails inside a fence and inside a code span", () => {
  const result = run({
    "brief.md": BRIEF,
    "verdict.md": ["```markdown", WRONG_MATH, "`" + WRONG_MATH + "`", "```", ""].join("\n"),
  });
  assert.equal(result.code, 1, result.out + result.err);
  assert.match(result.out, /Math lines checked: 2, wrong: 2/);
});

test("a right weighted average passes", () => {
  const result = run({
    "brief.md": BRIEF,
    "verdict.md": verdict([RIGHT_MATH, "Math B: (3x6 + 2x7 + 2x8 + 2x6) / 9 = 6.7"]),
  });
  assert.equal(result.code, 0, result.out + result.err);
  assert.match(result.out, /Math lines checked: 2, wrong: 0/);
});

test("a euro sign, a space as thousands separator and a times sign are read", () => {
  const euro = String.fromCharCode(0x20ac);
  const hardSpace = String.fromCharCode(0xa0);
  const times = String.fromCharCode(0xd7);
  const result = run({
    "brief.md": `${BRIEF}The pretend budget is ${euro}9${hardSpace}876.\n`,
    "verdict.md": verdict([
      `The budget is ${euro}9,876.`,
      `Math A: (3${times}8 + 2${times}7) / 5 = 7.6`,
      `It could reach ${euro}5${hardSpace}432.`,
    ]),
  });
  assert.equal(result.code, 1, result.out + result.err);
  assert.match(result.out, /traced: 1, marked assumed: 0, unverified: 1, Math lines checked: 1, wrong: 0/);
});

test("a divisor that is not the sum of the weights fails", () => {
  const result = run({
    "brief.md": BRIEF,
    "verdict.md": verdict(["Math A: (3x8 + 2x7) / 4 = 9.5"]),
  });
  assert.equal(result.code, 1, result.out + result.err);
  assert.match(result.out, /MATH\s+divides by 4, but the weights add up to 5/);
});

test("a Math line in another shape fails, because it cannot be checked", () => {
  const result = run({
    "brief.md": BRIEF,
    "verdict.md": verdict(["Math A: <the weighted sum, written out>", "Math B: about 7"]),
  });
  assert.equal(result.code, 1, result.out + result.err);
  assert.match(result.out, /Math lines checked: 2, wrong: 2/);
});

test("a verdict with nothing to read fails, unless --no-numbers is given", () => {
  const files = { "brief.md": BRIEF, "verdict.md": verdict(["Keep the plan as it is."]) };
  const plain = run(files);
  assert.equal(plain.code, 1, plain.out + plain.err);
  assert.match(plain.out, /NOTHING READ/);
  const flagged = run(files, ["--no-numbers"]);
  assert.equal(flagged.code, 0, flagged.out + flagged.err);
  assert.match(flagged.out, /--no-numbers was given/);
});

test("--no-numbers does not hide an invented figure", () => {
  const result = run({ "brief.md": BRIEF, "verdict.md": verdict([INVENTED]) }, ["--no-numbers"]);
  assert.equal(result.code, 1, result.out + result.err);
});

test("--report and --source keep working", () => {
  const extra = path.join(ROOT, "pretend-prices.txt");
  fs.writeFileSync(extra, "The made-up yearly total is $987,654.\n");
  const result = run(
    { "brief.md": BRIEF, "report.md": verdict([INVENTED]) },
    ["--report", "report.md", "--source", extra],
  );
  assert.equal(result.code, 0, result.out + result.err);
  assert.match(result.out, /report\.md against 2 source file\(s\)/);
});

test("bad usage and missing files exit 2", () => {
  assert.equal(runScript([]).code, 2, "no folder");
  assert.equal(runScript([path.join(ROOT, "no-such-folder")]).code, 2, "missing folder");
  assert.equal(run({ "brief.md": BRIEF }).code, 2, "no verdict.md");
  assert.equal(run({ "verdict.md": verdict([INVENTED]) }).code, 2, "no source file");
  assert.equal(run({ "brief.md": BRIEF, "verdict.md": "x" }, ["--bogus"]).code, 2, "unknown option");
  assert.equal(run({ "brief.md": BRIEF, "verdict.md": "x" }, ["--report"]).code, 2, "no value");
  const missingSource = run({ "brief.md": BRIEF, "verdict.md": "x" }, ["--source", path.join(ROOT, "gone.md")]);
  assert.equal(missingSource.code, 2, "missing --source file");
  assert.match(missingSource.err, /usage:/);
});

test("a crash exits 2, not 1", () => {
  // verdict.md is a folder here, so reading it throws.
  folderCount += 1;
  const folder = path.join(ROOT, `session-${folderCount}`);
  fs.mkdirSync(path.join(folder, "verdict.md"), { recursive: true });
  fs.writeFileSync(path.join(folder, "brief.md"), BRIEF);
  const result = runScript([folder]);
  assert.equal(result.code, 2, result.out + result.err);
  assert.match(result.err, /crashed, nothing was checked/);
});
