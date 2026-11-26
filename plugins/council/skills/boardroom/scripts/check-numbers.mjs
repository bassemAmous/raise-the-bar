#!/usr/bin/env node
/**
 * check-numbers: an outside check on a council verdict.
 *
 * The rule it enforces: every figure in the verdict must already appear in the brief, in a
 * round file, in the resolution, or in a file passed with --source. A figure found nowhere
 * else was added by the Chair while writing, and the Chair is not allowed to add figures.
 *
 * Usage:
 *   node check-numbers.mjs <session-folder> [--report <name>] [--source <file>]...
 *
 *   <session-folder>   the folder that holds the report and its source files
 *   --report <name>    the file to check, inside the folder (default: verdict.md)
 *   --source <file>    one more file that counts as a source, for a figure a seat took
 *                      from a named project file (may be given several times)
 *
 * Sources are every other .md or .txt file in the folder (brief.md, round-1.md, ...).
 *
 * Exit codes: 0 = every figure is traced or marked (assumed)
 *             1 = at least one figure is not
 *             2 = bad usage or missing files
 *
 * Read-only. No dependencies. Node 18 or later.
 *
 * Skipped on purpose:
 *   - scores such as 7/10, 4/5 or 2/3 (computed from the cards)
 *   - lines that start with "Option scores", "Math", "Council confidence" or "Seat runs"
 *     (computed or counted in the report itself)
 *   - ISO dates such as 2031-04-15 or 2031-04 (next steps carry new dates)
 *   - whole numbers from 0 to 10 with no unit (list markers, round counts, weights)
 *   - fenced code blocks, `code spans` and link targets
 *   - numbers glued to a letter, such as Q3, v2 or B2B
 *
 * Figures on a line that says "(assumed)" pass. They are listed so a reader can see them.
 *
 * Limits: it compares values, not meaning. "30%" in the report matches "30 days" in the
 * brief. It catches a figure that came from nowhere. It does not prove that a figure is
 * used correctly, and it does not check that a seat's own figure had a source. That part
 * is the Chair's evidence audit.
 */
import fs from "node:fs";
import path from "node:path";

const USAGE =
  "usage: node check-numbers.mjs <session-folder> [--report <name>] [--source <file>]...";

function fail(message) {
  console.error(message);
  console.error(USAGE);
  process.exit(2);
}

// ---- arguments ---------------------------------------------------------------------------

let folder = null;
let reportName = "verdict.md";
const extraSources = [];

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
  /^[\s>*_#-]*(option scores|math|council confidence|seat runs)\b/i;
const ASSUMED = /\(assumed\)/i;
const FENCE = /^\s*(```|~~~)/;
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

// Report: skip what is computed or not a figure, then list the rest with its line.
function reportFigures(text) {
  const found = [];
  let inFence = false;
  text.split(/\r?\n/).forEach((rawLine, index) => {
    if (FENCE.test(rawLine)) {
      inFence = !inFence;
      return;
    }
    if (inFence || COMPUTED_LINE.test(rawLine)) return;
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
  return found;
}

// ---- the check ---------------------------------------------------------------------------

const known = new Set();
for (const sourcePath of sourcePaths) {
  for (const key of knownValues(fs.readFileSync(sourcePath, "utf8"))) known.add(key);
}

let traced = 0;
const assumed = [];
const unverified = [];
for (const figure of reportFigures(fs.readFileSync(reportPath, "utf8"))) {
  if (known.has(figure.key)) traced += 1;
  else if (figure.assumed) assumed.push(figure);
  else unverified.push(figure);
}

console.log(
  `check-numbers: ${reportName} against ${sourcePaths.length} source file(s)`,
);
console.log(
  `traced: ${traced}, marked assumed: ${assumed.length}, unverified: ${unverified.length}`,
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
if (unverified.length > 0) {
  console.log(
    "Fix: remove each unverified figure, or trace it in the Chair notes of a round file with its source.",
  );
}
process.exit(unverified.length > 0 ? 1 : 0);
