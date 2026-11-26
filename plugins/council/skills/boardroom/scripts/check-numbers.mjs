#!/usr/bin/env node
/**
 * check-numbers: an outside check on a council verdict.
 *
 * It enforces two rules.
 *
 * 1. Every figure in the verdict must already appear in the brief, in a round file, in the
 *    resolution, or in a file passed with --source. A figure found nowhere else was added by
 *    the Chair while writing, and the Chair is not allowed to add figures.
 * 2. Every Math line must add up. A Math line is the weighted average the Chair writes for
 *    one option, in this shape: "Math B: (3x6 + 2x7) / 5 = 6.4". Each term is weight x score.
 *    The script recomputes it. A wrong result, a divisor that is not the sum of the weights,
 *    or a Math line in another shape is an error.
 *
 * Usage:
 *   node check-numbers.mjs <session-folder> [--report <name>] [--source <file>]...
 *                          [--no-numbers]
 *
 *   <session-folder>   the folder that holds the report and its source files
 *   --report <name>    the file to check, inside the folder (default: verdict.md)
 *   --source <file>    one more file that counts as a source, for a figure a seat took
 *                      from a named project file (may be given several times)
 *   --no-numbers       says the report holds no figure and no Math line on purpose. Without
 *                      it, a report in which nothing could be read is a finding, not a pass.
 *
 * Sources are every other .md or .txt file in the folder (brief.md, round-1.md, ...).
 *
 * Exit codes: 0 = clean: every figure is traced or marked (assumed), every Math line adds up
 *             1 = findings: a figure with no source, a Math line that is wrong or cannot be
 *                 read, or a report with nothing to read (and no --no-numbers)
 *             2 = the check did not run: bad usage, a missing file or a crash
 *
 * Read-only. No dependencies. Node 18 or later.
 *
 * Skipped on purpose:
 *   - scores such as 7/10, 4/5 or 2/3 (computed from the cards)
 *   - lines that start with "Option scores", "Council confidence" or "Seat runs"
 *     (computed or counted in the report itself)
 *   - ISO dates such as 2031-04-15 or 2031-04 (next steps carry new dates)
 *   - whole numbers from 0 to 10 with no unit (list markers, round counts, weights).
 *     Not on a Math line: there every number is used.
 *   - `code spans` and link targets
 *   - numbers glued to a letter, such as Q3, v2 or B2B
 *
 * Not skipped: text inside a code fence. A verdict pasted between ``` lines, with or without
 * a language name, is read like any other text.
 *
 * Figures on a line that says "(assumed)" pass. They are listed so a reader can see them.
 *
 * Limits: it compares values, not meaning. "30%" in the report matches "30 days" in the
 * brief. It catches a figure that came from nowhere. It does not prove that a figure is
 * used correctly, and it does not check that a seat's own figure had a source. That part
 * is the Chair's evidence audit. On a Math line it checks the sum. It does not check that
 * the weights and scores are the ones on the cards.
 */
import fs from "node:fs";
import path from "node:path";

const USAGE =
  "usage: node check-numbers.mjs <session-folder> [--report <name>] [--source <file>]... [--no-numbers]";

// A crash must not look like a finding. Exit code 1 is kept for findings only.
process.on("uncaughtException", (error) => {
  console.error(`check-numbers crashed, nothing was checked: ${error.message}`);
  process.exit(2);
});

function fail(message) {
  console.error(message);
  console.error(USAGE);
  process.exit(2);
}

// ---- arguments ---------------------------------------------------------------------------

let folder = null;
let reportName = "verdict.md";
const extraSources = [];
let noNumbers = false;

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "-h" || arg === "--help") {
    console.log(USAGE);
    process.exit(0);
  } else if (arg === "--report" || arg === "--source") {
    const value = args[i + 1];
    if (!value) fail(`${arg} needs a value`);
    if (arg === "--report") reportName = value;
    else extraSources.push(value);
    i += 1;
  } else if (arg === "--no-numbers") {
    noNumbers = true;
  } else if (arg.startsWith("--")) {
    fail(`unknown option: ${arg}`);
  } else if (folder === null) {
    folder = arg;
  } else {
    fail("give one session folder only");
  }
}

if (folder === null) fail("no session folder given");
if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
  fail(`not a folder: ${folder}`);
}

const reportPath = path.join(folder, reportName);
if (!fs.existsSync(reportPath)) fail(`no ${reportName} in ${folder}`);

const sourcePaths = fs
  .readdirSync(folder)
  .filter((name) => /\.(md|txt)$/i.test(name) && name !== reportName)
  .map((name) => path.join(folder, name));

for (const extra of extraSources) {
  if (!fs.existsSync(extra)) fail(`source file not found: ${extra}`);
  sourcePaths.push(extra);
}

if (sourcePaths.length === 0) fail(`no source files next to ${reportName}`);

// ---- reading figures ---------------------------------------------------------------------

// A figure: optional currency sign, digits (with thousands separators), optional decimals,
// optional multiplier (k, K, M, bn) or percent sign. It must not be glued to a letter,
// a digit, a dot or a comma on its left, so "Q3", "v1.2" and "B2B" are left alone.
const FIGURE =
  /(?<![\p{L}\p{N}_.,])([$\u20AC\u00A3])?(\d{1,3}(?:[,\u00A0\u202F]\d{3})+(?!\d)|\d+)(\.\d+|,\d{1,2}(?!\d))?(?:(k|K|M|bn)(?![\p{L}\p{N}])|\s?(%|percent\b))?/gu;

const SCORE = /(?<![\d.])\d+(?:\.\d+)?\s?\/\s?(?:10|5|3)(?!\d)/g;
const ISO_DATE =
  /(?<![\d-])(?:19|20)\d{2}-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?(?![\d-])/g;
const CODE_SPAN = /`[^`]*`/g;
const LINK_TARGET = /\]\([^)]*\)/g;
const BARE_URL = /\bhttps?:\/\/\S+/g;
const COMPUTED_LINE =
  /^[\s>*_#-]*(option scores|council confidence|seat runs)\b/i;
// "Math B: (3x6 + 2x7) / 5 = 6.4": the label, then the sum, the divisor and the result.
const MATH_LINE = /^[\s>*_#`-]*math\b[^:=`,.]{0,24}:(.*)$/i;
const MATH_SHAPE =
  /^[\s*_`]*\(([^()]+)\)\s*\/\s*(\d+(?:\.\d+)?)\s*=\s*(\d+(?:\.\d+)?)[\s*_`.]*$/;
const MATH_TERM = /^\s*(\d+(?:\.\d+)?)\s*[xX\u00D7*]\s*(\d+(?:\.\d+)?)\s*$/;
const MATH_EXAMPLE = "Math B: (3x6 + 2x7) / 5 = 6.4";
const ASSUMED = /\(assumed\)/i;
const MULTIPLIER = { k: 1e3, K: 1e3, M: 1e6, bn: 1e9 };

function figuresOnLine(line) {
  const figures = [];
  for (const match of line.matchAll(FIGURE)) {
    const [text, currency, whole, decimals, multiplier, percent] = match;
    const digits =
      whole.replace(/[,\u00A0\u202F]/g, "") +
      (decimals ? `.${decimals.slice(1)}` : "");
    const scaled = Number(digits) * (multiplier ? MULTIPLIER[multiplier] : 1);
    const value = Number(scaled.toPrecision(12));
    figures.push({
      text: text.trim(),
      key: String(value),
      value,
      hasUnit: Boolean(currency || multiplier || percent),
    });
  }
  return figures;
}

function isSmallBareNumber(figure) {
  return (
    !figure.hasUnit &&
    Number.isInteger(figure.value) &&
    figure.value >= 0 &&
    figure.value <= 10
  );
}

// Sources: keep every value, wherever it stands.
function knownValues(text) {
  const known = new Set();
  for (const line of text.split(/\r?\n/)) {
    for (const figure of figuresOnLine(line)) known.add(figure.key);
  }
  return known;
}

// A Math line: recompute the weighted average. Returns what is wrong, or null.
function mathProblem(body) {
  const badShape = `not in the shape "${MATH_EXAMPLE}", so it cannot be checked`;
  const shape = body.match(MATH_SHAPE);
  if (!shape) return badShape;
  const [, sum, divisorText, resultText] = shape;
  let total = 0;
  let weights = 0;
  let scores = 0;
  for (const part of sum.split("+")) {
    const term = part.match(MATH_TERM);
    if (!term) return badShape;
    total += Number(term[1]) * Number(term[2]);
    weights += Number(term[1]);
    scores += Number(term[2]);
  }
  const divisor = Number(divisorText);
  const same = (a, b) => Math.abs(a - b) < 1e-9;
  // The weight comes first. A line written as score x weight is accepted too.
  if (!(divisor > 0) || !(same(divisor, weights) || same(divisor, scores))) {
    return `divides by ${divisorText}, but the weights add up to ${weights}`;
  }
  const exact = total / divisor;
  const decimals = (resultText.split(".")[1] || "").length;
  const tolerance = 0.5 * 10 ** -Math.max(decimals, 1) + 1e-9;
  if (Math.abs(Number(resultText) - exact) > tolerance) {
    return `says ${resultText}, but the sum gives ${exact.toFixed(1)}`;
  }
  return null;
}

// Report: check each Math line, skip what is computed or not a figure, then list the rest
// with its line. Text inside a code fence is read like any other text.
function readReport(text) {
  const found = [];
  const maths = [];
  text.split(/\r?\n/).forEach((rawLine, index) => {
    const math = rawLine.match(MATH_LINE);
    if (math) {
      maths.push({
        lineNumber: index + 1,
        excerpt: rawLine.trim().slice(0, 120),
        problem: mathProblem(math[1]),
      });
      return;
    }
    if (COMPUTED_LINE.test(rawLine)) return;
    const line = rawLine
      .replace(CODE_SPAN, " ")
      .replace(LINK_TARGET, "] ")
      .replace(BARE_URL, " ")
      .replace(ISO_DATE, " ")
      .replace(SCORE, " ");
    for (const figure of figuresOnLine(line)) {
      if (isSmallBareNumber(figure)) continue;
      found.push({
        ...figure,
        lineNumber: index + 1,
        excerpt: rawLine.trim().slice(0, 120),
        assumed: ASSUMED.test(rawLine),
      });
    }
  });
  return { figures: found, maths };
}

// ---- the check ---------------------------------------------------------------------------

const known = new Set();
for (const sourcePath of sourcePaths) {
  for (const key of knownValues(fs.readFileSync(sourcePath, "utf8"))) known.add(key);
}

const report = readReport(fs.readFileSync(reportPath, "utf8"));
const wrongMaths = report.maths.filter((line) => line.problem !== null);
const nothingRead = report.figures.length === 0 && report.maths.length === 0;

let traced = 0;
const assumed = [];
const unverified = [];
for (const figure of report.figures) {
  if (known.has(figure.key)) traced += 1;
  else if (figure.assumed) assumed.push(figure);
  else unverified.push(figure);
}

console.log(
  `check-numbers: ${reportName} against ${sourcePaths.length} source file(s)`,
);
console.log(
  `traced: ${traced}, marked assumed: ${assumed.length}, unverified: ${unverified.length}, ` +
    `Math lines checked: ${report.maths.length}, wrong: ${wrongMaths.length}`,
);
for (const figure of assumed) {
  console.log(
    `  ASSUMED     ${figure.text}  (line ${figure.lineNumber}: ${figure.excerpt})`,
  );
}
for (const figure of unverified) {
  console.log(
    `  UNVERIFIED  ${figure.text}  (line ${figure.lineNumber}: ${figure.excerpt})`,
  );
}
for (const line of wrongMaths) {
  console.log(
    `  MATH        ${line.problem}  (line ${line.lineNumber}: ${line.excerpt})`,
  );
}
if (unverified.length > 0) {
  console.log(
    "Fix: remove each unverified figure, or trace it in the Chair notes of a round file with its source.",
  );
}
if (wrongMaths.length > 0) {
  console.log(
    `Fix: recompute each MATH line from the cards and write it in the shape "${MATH_EXAMPLE}".`,
  );
}
if (nothingRead && noNumbers) {
  console.log(
    "No figure and no Math line found. Accepted because --no-numbers was given.",
  );
} else if (nothingRead) {
  console.log(
    `  NOTHING READ  no figure and no Math line was found in ${reportName}. This is not a pass.`,
  );
  console.log(
    "Fix: check that this is the filled-in verdict. If it holds no number on purpose, run again with --no-numbers.",
  );
}

const findings =
  unverified.length > 0 || wrongMaths.length > 0 || (nothingRead && !noNumbers);
process.exitCode = findings ? 1 : 0;
