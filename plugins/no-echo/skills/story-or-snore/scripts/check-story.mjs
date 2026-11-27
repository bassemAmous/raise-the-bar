#!/usr/bin/env node
/**
 * check-story: an outside check on a talk file, before anyone builds slides from it.
 *
 * A story carries a talk only while each story element means one real thing and the words fit
 * the time. This script reads the talk file the skill writes (the format is in
 * references/beats-and-script.md) and reports:
 *
 *   DOUBLE MEANING  one story element stands for two real parts
 *   OPEN GAP        a real part still has no story element and is not marked (plain)
 *   STOCK IMAGE     a story element is an iceberg, a rocket or another worn-out picture
 *   NEVER SAID      a story element is in the ledger but in no beat
 *   NO LINE         a timed beat has no visible line, or more than one
 *   LONG LINE       a visible line has more than 12 words
 *   OVER TIME       a beat's spoken words need over 10% more time than the beat has
 *   OVER LIMIT      the beats add up to more than the limit
 *   NO LIMIT        the file gives no limit, so the time could not be checked
 *   AVOID           a line or spoken text uses a word the person asked to avoid
 *   KEEP            a phrase the person wrote is missing or was changed
 *   EARLY NAME      the product is named in the first 15 seconds
 *   NO CALLBACK     the last beat repeats no story element from the first beat
 *
 * Usage: node check-story.mjs <talk.md>
 *
 * Exit codes: 0 = clean, 1 = findings, 2 = the check did not run (bad usage, no file, a crash).
 *
 * Read-only. No dependencies. Node 20 or later.
 *
 * Limits: it compares words, not meaning. It cannot tell whether the story is warm, true or
 * funny, or whether a number is real. Text in (parentheses) inside "Say:" is a stage direction
 * and is not counted as spoken. A beat with no "(N s)" in its heading is not timed and is skipped.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = "usage: node check-story.mjs <talk.md>";
const DEFAULT_WORDS_A_MINUTE = 140; // a person speaking on a stage, slower than reading
const MAX_LINE_WORDS = 12;
const OVERRUN_ALLOWED = 1.1;
const QUIET_OPENING_SECONDS = 15;
const STOCK_IMAGES = [
  "iceberg", "puzzle", "jigsaw", "lighthouse", "compass", "bridge", "rocket", "swiss army knife",
  "north star", "orchestra", "chess", "lego",
];
// Too common to show that two texts name the same story element.
const SMALL_WORDS = new Set(
  "the and for with that this from into onto out her his its our your their who what when where why how are was were has have had not but all any one very each".split(" "),
);

const wordsOf = (text) => text.match(/[\p{L}\p{N}]+/gu) ?? [];
const keyWordsOf = (text) => wordsOf(text.toLowerCase()).filter((word) => word.length >= 3 && !SMALL_WORDS.has(word));
const withoutStageDirections = (text) => text.replace(/\([^)]*\)/g, " ");
const heardIn = (beat) => `${beat.lines.join(" ")} ${withoutStageDirections(beat.say)}`;
const isPlain = (element) => /^\(?plain\)?$/i.test(element);
const isOpen = (element) => element === "" || /^\(?no match\)?$/i.test(element);

function clock(seconds) {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** "3:00", "180", "180 s" and "3 min" all mean 180 seconds. Anything else is null. */
export function secondsOf(text) {
  const asClock = text.match(/^(\d+):([0-5]\d)$/);
  if (asClock) return Number(asClock[1]) * 60 + Number(asClock[2]);
  const asNumber = text.match(/^(\d+(?:\.\d+)?)\s*(s|sec|seconds|min|minutes)?$/i);
  if (!asNumber) return null;
  return Number(asNumber[1]) * (/^min/i.test(asNumber[2] ?? "") ? 60 : 1);
}

/** True when the phrase is in the text as whole words, whatever the case. */
function hasPhrase(text, phrase) {
  const escaped = phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").test(text);
}

const listOf = (value) => value.split(",").map((item) => item.trim()).filter(Boolean);

function readSetting(settings, row) {
  const setting = row.match(/^(Limit|Pace|Product|Avoid|Keep|Allow):\s*(.+)$/i);
  if (!setting) return;
  const [name, value] = [setting[1].toLowerCase(), setting[2].trim()];
  if (name === "limit") settings.limit = secondsOf(value);
  else if (name === "pace") settings.pace = Number(value) || DEFAULT_WORDS_A_MINUTE;
  else if (name === "product") settings.product = value;
  else if (name === "keep") settings.keep.push(value.replace(/^"(.*)"$/, "$1"));
  else settings[name].push(...listOf(value.toLowerCase()));
}

function readPair(pairs, row) {
  if (!row.startsWith("|")) return;
  const cells = row.split("|").slice(1, -1).map((cell) => cell.trim());
  const isRule = cells.every((cell) => /^[-:\s]*$/.test(cell));
  if (isRule || /^real part$/i.test(cells[0] ?? "")) return;
  pairs.push({ part: cells[0], element: cells[1] ?? "" });
}

/** Returns the field ("say" or "lines") that a following plain row continues, or null. */
function readBeatRow(beats, row, openField) {
  const heading = row.match(/^###\s+(\d+)\.?\s+(.*?)\s*(?:\((\d+)\s*s\))?$/);
  if (heading) {
    beats.push({ number: Number(heading[1]), name: heading[2], seconds: heading[3] ? Number(heading[3]) : null, lines: [], say: "" });
    return null;
  }
  const beat = beats.at(-1);
  if (!beat || row === "") return null;
  const field = row.match(/^(Line|Say):\s*(.*)$/i);
  if (field && field[1].toLowerCase() === "line") {
    beat.lines.push(field[2]);
    return "lines";
  }
  if (field) {
    beat.say += ` ${field[2]}`;
    return "say";
  }
  if (openField === "say") beat.say += ` ${row}`;
  else if (openField === "lines") beat.lines[beat.lines.length - 1] += ` ${row}`;
  return openField;
}

export function parseTalk(text) {
  const talk = { settings: { pace: DEFAULT_WORDS_A_MINUTE, avoid: [], keep: [], allow: [] }, pairs: [], beats: [] };
  let section = "top";
  let openField = null;
  for (const rawRow of text.split("\n")) {
    const row = rawRow.trim(); // also drops the \r of a Windows line ending
    const sectionHeading = row.match(/^##\s+(.+)$/);
    if (sectionHeading) {
      section = sectionHeading[1].toLowerCase();
      openField = null;
    } else if (section === "top") readSetting(talk.settings, row);
    else if (section.startsWith("ledger")) readPair(talk.pairs, row);
    else if (section.startsWith("beats")) openField = readBeatRow(talk.beats, row, openField);
  }
  return talk;
}

function checkLedger({ pairs, beats, settings }) {
  const findings = [];
  const partsByElement = new Map();
  const everythingHeard = beats.map(heardIn).join(" ").toLowerCase();
  for (const { part, element } of pairs) {
    if (isOpen(element)) {
      findings.push(`OPEN GAP "${part}" has no story element. Give it one, or write (plain) and say that part plainly.`);
      continue;
    }
    if (isPlain(element)) continue;
    const keyWords = keyWordsOf(element);
    const sameElement = keyWords.join(" ") || element.toLowerCase();
    partsByElement.set(sameElement, [...(partsByElement.get(sameElement) ?? []), { part, element }]);
    for (const image of STOCK_IMAGES) {
      if (hasPhrase(element, image) && !settings.allow.includes(image))
        findings.push(`STOCK IMAGE "${element}" is a worn-out picture (${image}). Pick a specific one, or add "Allow: ${image}" if the person asked for it.`);
    }
    if (beats.length && !keyWords.some((word) => hasPhrase(everythingHeard, word)))
      findings.push(`NEVER SAID "${element}" is in the ledger but in no beat. Say it, or remove the pair.`);
  }
  for (const uses of partsByElement.values()) {
    if (uses.length > 1)
      findings.push(`DOUBLE MEANING "${uses[0].element}" stands for ${uses.map((use) => `"${use.part}"`).join(" and ")}. One story element means one thing.`);
  }
  return findings;
}

function checkBeat(beat, startsAt, settings) {
  const findings = [];
  const where = `beat ${beat.number} (${beat.name})`;
  const heard = heardIn(beat);
  if (beat.lines.length !== 1) findings.push(`NO LINE ${where} has ${beat.lines.length} visible lines. A slide carries exactly one.`);
  for (const line of beat.lines) {
    const count = wordsOf(line).length;
    if (count > MAX_LINE_WORDS) findings.push(`LONG LINE ${where}: ${count} words, ${MAX_LINE_WORDS} at most: "${line}"`);
  }
  const spokenWords = wordsOf(withoutStageDirections(beat.say)).length;
  const needed = Math.round((spokenWords / settings.pace) * 60);
  if (needed > Math.ceil(beat.seconds * OVERRUN_ALLOWED))
    findings.push(`OVER TIME ${where}: ${spokenWords} spoken words need ${needed} s at ${settings.pace} words a minute. The beat has ${beat.seconds} s.`);
  for (const word of settings.avoid) {
    if (hasPhrase(heard, word)) findings.push(`AVOID ${where} uses "${word}". The person asked to avoid it.`);
  }
  if (settings.product && startsAt < QUIET_OPENING_SECONDS && hasPhrase(heard, settings.product))
    findings.push(`EARLY NAME ${where} names "${settings.product}" in the first ${QUIET_OPENING_SECONDS} seconds. Open with the story.`);
  return { findings, needed };
}

// Compared without spaces and with straight apostrophes, so a line break or a curly quote is not a change.
function missingKeptPhrases(keep, allText) {
  const comparable = (text) => text.replace(/[‘’]/g, "'").replace(/\s+/g, "").toLowerCase();
  const haystack = comparable(allText);
  return keep.filter((phrase) => !haystack.includes(comparable(phrase)));
}

function hasCallback(pairs, firstBeat, lastBeat) {
  const elementWords = new Set(pairs.filter((pair) => !isPlain(pair.element) && !isOpen(pair.element)).flatMap((pair) => keyWordsOf(pair.element)));
  const opening = new Set(keyWordsOf(heardIn(firstBeat)));
  return keyWordsOf(heardIn(lastBeat)).some((word) => elementWords.has(word) && opening.has(word));
}

export function checkTalk(talk) {
  const { settings, pairs, beats } = talk;
  const timed = beats.filter((beat) => beat.seconds !== null);
  if (!pairs.length) return { findings: ['NOTHING TO CHECK no "## Ledger" table was found. The ledger is the contract; write it first.'], notes: [], summary: [] };
  if (!timed.length) return { findings: ['NOTHING TO CHECK no timed beat was found under "## Beats". A beat heading looks like "### 1. Hook (10 s)".'], notes: [], summary: [] };

  const findings = checkLedger(talk);
  let planned = 0;
  let needed = 0;
  for (const beat of timed) {
    const result = checkBeat(beat, planned, settings);
    findings.push(...result.findings);
    planned += beat.seconds;
    needed += result.needed;
  }
  if (!settings.limit) findings.push('NO LIMIT the file has no "Limit:" line such as "Limit: 3:00", so the time was checked against nothing.');
  else if (planned > settings.limit) findings.push(`OVER LIMIT the beats add up to ${clock(planned)}. The limit is ${clock(settings.limit)}.`);
  const allText = beats.map((beat) => `${beat.lines.join(" ")} ${beat.say}`).join(" ");
  for (const phrase of missingKeptPhrases(settings.keep, allText)) findings.push(`KEEP the person's phrase "${phrase}" is missing or was changed.`);
  if (timed.length > 1 && !hasCallback(pairs, timed[0], timed.at(-1)))
    findings.push(`NO CALLBACK beat ${timed.at(-1).number} repeats no story element from beat ${timed[0].number}. End on an object or phrase from the opening.`);

  const notes = [];
  const placeholders = [...new Set(allText.match(/\[[A-Z?]{1,3}\]/g) ?? [])];
  if (placeholders.length) notes.push(`placeholders still open: ${placeholders.join(", ")}. The speaker fills them from a real run, never from a guess.`);
  if (!settings.product) notes.push('no "Product:" line, so the early-name check did not run.');
  const plainCount = pairs.filter((pair) => isPlain(pair.element)).length;
  const summary = [
    `ledger   ${pairs.length - plainCount} story pairs, ${plainCount} told plainly`,
    `beats    ${timed.length} timed, ${beats.length - timed.length} not timed`,
    `time     ${clock(planned)} planned${settings.limit ? ` of ${clock(settings.limit)}` : ""}; the words need ${clock(needed)} at ${settings.pace} words a minute`,
  ];
  return { findings, notes, summary };
}

function main(args) {
  if (args.length !== 1 || args[0].startsWith("-")) {
    console.error(USAGE);
    return 2;
  }
  if (!fs.existsSync(args[0]) || !fs.statSync(args[0]).isFile()) {
    console.error(`not a file: ${args[0]}\n${USAGE}`);
    return 2;
  }
  const { findings, notes, summary } = checkTalk(parseTalk(fs.readFileSync(args[0], "utf8")));
  console.log(`check-story: ${path.basename(args[0])}`);
  for (const row of summary) console.log(`  ${row}`);
  for (const finding of findings) console.log(`  FINDING  ${finding}`);
  for (const note of notes) console.log(`  note     ${note}`);
  console.log(findings.length ? `${findings.length} finding(s).` : "Clean.");
  return findings.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // A crash must not look like a finding. Exit code 1 is kept for findings only.
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`check-story crashed, nothing was checked: ${error?.message ?? error}`);
    process.exitCode = 2;
  }
}
