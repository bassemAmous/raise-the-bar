#!/usr/bin/env node
/**
 * check-story: an outside check on a talk file, before anyone builds slides from it.
 *
 * A story carries a talk only while each story element means one real thing, the words fit the
 * time and every number is one the person gave. This script reads the talk file the skill writes
 * (the format is in references/beats-and-script.md) and reports:
 *
 *   DOUBLE MEANING  one story element stands for two real parts
 *   OPEN GAP        a real part still has no story element and is not marked (plain)
 *   STOCK IMAGE     a story element is an iceberg, a rocket or another worn-out picture
 *   NEVER SAID      a story element is in the ledger but in no beat
 *   NO LINE         a timed beat has no visible line, or more than one
 *   LONG LINE       a visible line has more than 12 words
 *   OVER TIME       a beat's spoken words need over 10% more time than the beat has
 *   OVER LIMIT      the beats, or the spoken words, add up to more than the limit
 *   NO LIMIT        the file gives no limit, so the time could not be checked
 *   NOT IN FACTS    a number in a line or in spoken text is in no fact the person gave
 *   EXAMPLE DATA    a number from an "Example:" fact is said in a beat that never says "example"
 *   CLAIM           "pays for itself", "guaranteed", "first ever" or "<product> is the only",
 *                   and no fact says so
 *   AVOID           a line or spoken text uses a word the person asked to avoid
 *   KEEP            a phrase the person wrote is missing or was changed
 *   EARLY NAME      the product is named in the first 15 seconds
 *   NO CALLBACK     the last beat repeats no story element from the first beat
 *
 * and two warnings, which do not fail the check but take "Clean." off its last line:
 *
 *   NO FACTS        the file has no "## Facts" section, so no number or claim was checked
 *   UNDER TIME      the spoken words need under 70% of the planned time
 *
 * Usage: node check-story.mjs <talk.md>
 *
 * Exit codes: 0 = no finding (the last line says "Clean." or counts the warnings),
 *             1 = findings, 2 = the check did not run (bad usage, no file, a crash).
 *
 * Read-only. No dependencies. Node 20 or later.
 *
 * Numbers: digits (40, 1,200, 3.5, 40k, $5 million, 18%) and English number words (zero to
 * billions, "twenty-nine euros", "eighteen percent"). A number is given when a "## Facts" row, a
 * ledger row or a "Keep:" phrase holds the same value. Said with a unit (percent, euro, dollar,
 * pound sign), it needs a fact with that value and that unit. Not read as numbers: the word
 * "one" alone ("this one", "one day"), ordinals (first, 2nd), vague words (hundreds, twice, half,
 * a dozen), digits glued to a name (v2, Q3, B2B), the product's own name, the seconds in a beat
 * heading, the "First beat" column and stage directions.
 *
 * Limits: it compares words and values, not meaning. "Forty restaurants" passes when any fact
 * holds a 40, whatever that 40 counts. It cannot tell whether the story is warm, true or funny,
 * or whether a fact the person gave is right. Claim words are a short list, not a lie detector:
 * "the only" is checked only in a sentence that names the product, because stories use it
 * honestly ("the only one who knew"). Text in (parentheses) inside "Say:" is a stage direction and
 * is not counted as spoken. A beat with no "(N s)" in its heading is not timed: only its numbers
 * and claim words are checked.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = "usage: node check-story.mjs <talk.md>";
const DEFAULT_WORDS_A_MINUTE = 140; // a person speaking on a stage, slower than reading
const MAX_LINE_WORDS = 12;
const QUIET_OPENING_SECONDS = 15;
const MAX_LISTED = 8;
const STOCK_IMAGES = [
  "iceberg", "puzzle", "jigsaw", "lighthouse", "compass", "bridge", "rocket", "swiss army knife",
  "north star", "orchestra", "chess", "lego",
];
// Too common to show that two texts name the same story element.
const SMALL_WORDS = new Set(
  "the and for with that this from into onto out her his its our your their who what when where why how are was were has have had not but all any one very each".split(" "),
);

const SMALL_NUMBERS = new Map(
  "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen"
    .split(" ")
    .map((word, value) => [word, value]),
);
const TENS = new Map(Object.entries({ twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }));
const SCALES = new Map(Object.entries({ thousand: 1e3, million: 1e6, billion: 1e9 }));
const SHORT_SCALES = new Map(Object.entries({ k: 1e3, K: 1e3, M: 1e6, bn: 1e9 })); // glued to digits: 40k, 2M
const UNIT_WORDS = new Map(Object.entries({ percent: "%", percentage: "%", pct: "%", euro: "€", euros: "€", eur: "€", dollar: "$", dollars: "$", usd: "$" }));
const UNIT_SIGNS = ["%", "€", "$", "£"];
// Which kind of number word may come before each kind, inside one number. null is the start.
const MAY_FOLLOW = {
  small: [null, "ten", "hundred", "scale"],
  ten: [null, "hundred", "scale"],
  hundred: [null, "small"],
  scale: [null, "small", "ten", "hundred"],
};
// Words that usually come with an invented result. Each one passes when a fact says it too.
const CLAIMS = [
  { pattern: /\bpa(?:ys?|id|ying) for (?:itself|themselves)\b/i },
  { pattern: /\bguarantee[ds]?\b/i },
  { pattern: /\b(?:first[- ]ever|world'?s[- ]first|world[- ]first)\b/i },
  { pattern: /\bthe only\b/i, onlyNearProduct: true },
];
const SAYS_EXAMPLE = /\b(?:examples?|demo|sample|invented|made[- ]up|pretend|imagine|test data)\b/i;

const wordsOf = (text) => text.match(/[\p{L}\p{N}]+/gu) ?? [];
const keyWordsOf = (text) => wordsOf(text.toLowerCase()).filter((word) => word.length >= 3 && !SMALL_WORDS.has(word));
/**
 * Replaces every "(...)" with what `replace` returns for it, in one pass. The regex /\([^)]*\)/g
 * rescans to the end of the text from every "(" that has no ")", which takes seconds on a long text.
 */
function replaceParens(text, replace) {
  let out = "";
  let from = 0;
  for (let open = text.indexOf("(", from); open !== -1; open = text.indexOf("(", from)) {
    const close = text.indexOf(")", open + 1);
    if (close === -1) break;
    out += text.slice(from, open) + replace(text.slice(open, close + 1));
    from = close + 1;
  }
  return out + text.slice(from);
}
const withoutStageDirections = (text) => replaceParens(text, () => " ");
const heardIn = (beat) => `${beat.lines.join(" ")} ${withoutStageDirections(beat.say)}`;
const isPlain = (element) => /^\(?plain\)?$/i.test(element);
const isOpen = (element) => element === "" || /^\(?no match\)?$/i.test(element);
const isExample = (fact) => /^examples?\b[^:]{0,20}:/i.test(fact);
const blank = (text) => " ".repeat(text.length);

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

/** Matches the phrase as whole words, whatever the case. */
function phrasePattern(phrase, flags = "iu") {
  const escaped = phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, flags);
}

const hasPhrase = (text, phrase) => phrasePattern(phrase).test(text);

/** "1,200" and "1 200" are 1200, "3,5" and "3.5" are 3.5. A version such as "1.2.3" is no number: null. */
function valueOfDigits(digits) {
  const value = Number(digits.replace(/\s/g, "").replace(/,(?=\d{3}(?!\d))/g, "").replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

/** The unit right after a number: a sign, a unit word or "per cent". Null when there is none. */
function unitAfter(text, atoms, from, numberEnd) {
  const atom = atoms[from];
  if (!atom) return null;
  const between = text.slice(numberEnd, atom.start);
  if (UNIT_SIGNS.includes(atom.text)) return /^\s?$/.test(between) ? { unit: atom.text, end: atom.end, next: from + 1 } : null;
  if (!/^[\s-]*$/.test(between)) return null;
  const word = atom.text.toLowerCase();
  if (UNIT_WORDS.has(word)) return { unit: UNIT_WORDS.get(word), end: atom.end, next: from + 1 };
  const cent = atoms[from + 1];
  if (word === "per" && cent?.text.toLowerCase() === "cent" && /^\s+$/.test(text.slice(atom.end, cent.start)))
    return { unit: "%", end: cent.end, next: from + 2 };
  return null;
}

/** Reads "40", "1,200", "40k", "$5 million" or "18 %" at the digits atom. */
function readDigits(text, atoms, at) {
  const atom = atoms[at];
  let next = at + 1;
  const glued = atoms[next]?.start === atom.end ? atoms[next].text : "";
  const isPartOfName = /[\p{L}\p{N}]/u.test(text[atom.start - 1] ?? "");
  let value = valueOfDigits(atom.text);
  if (isPartOfName || value === null || /^(?:st|nd|rd|th)$/i.test(glued)) return { next, number: null };

  let end = atom.end;
  const spacedWord = atoms[next] && /^\s+$/.test(text.slice(end, atoms[next].start)) ? atoms[next].text.toLowerCase() : "";
  const scale = SHORT_SCALES.get(glued) ?? SCALES.get(spacedWord) ?? (spacedWord === "hundred" ? 100 : null);
  if (scale) {
    value *= scale;
    end = atoms[next].end;
    next += 1;
  }
  const before = atoms[at - 1];
  const hasMoneySign = before && UNIT_SIGNS.includes(before.text) && before.text !== "%" && /^\s?$/.test(text.slice(before.end, atom.start));
  const start = hasMoneySign ? before.start : atom.start;
  const after = hasMoneySign ? null : unitAfter(text, atoms, next, end);
  const unit = hasMoneySign ? before.text : (after?.unit ?? "");
  if (after) ({ end, next } = after);
  return { next, number: { value, unit, text: text.slice(start, end), index: start } };
}

function kindOfNumberWord(word) {
  if (SMALL_NUMBERS.has(word)) return "small";
  if (TENS.has(word)) return "ten";
  if (word === "hundred") return "hundred";
  return SCALES.has(word) ? "scale" : null;
}

/** Reads "forty", "twenty-nine", "one hundred and five" or "two million euros" at the word atom. */
function readNumberWords(text, atoms, at) {
  const lower = (index) => atoms[index]?.text.toLowerCase();
  const gapBefore = (index) => text.slice(atoms[index - 1].end, atoms[index].start);
  let total = 0;
  let current = 0;
  let last = null;
  let next = at;
  while (next < atoms.length && (next === at || /^(?:\s+|[-‐‑])$/.test(gapBefore(next)))) {
    const word = lower(next);
    // "one hundred and five": the "and" belongs to the number only between a hundred and its rest.
    const closesNumber = word === "and" && (last === "hundred" || last === "scale") && /^\s+$/.test(text.slice(atoms[next].end, atoms[next + 1]?.start)) && (SMALL_NUMBERS.has(lower(next + 1)) || TENS.has(lower(next + 1)));
    if (closesNumber) {
      next += 1;
      continue;
    }
    const kind = kindOfNumberWord(word);
    const afterTen = last === "ten" && !(SMALL_NUMBERS.get(word) >= 1 && SMALL_NUMBERS.get(word) <= 9); // "twenty ten" is two numbers
    if (!kind || !MAY_FOLLOW[kind].includes(last) || (kind === "small" && afterTen)) break;
    if (kind === "small") current += SMALL_NUMBERS.get(word);
    else if (kind === "ten") current += TENS.get(word);
    else if (kind === "hundred") current = (current || 1) * 100;
    else {
      total += (current || 1) * SCALES.get(word);
      current = 0;
    }
    last = kind;
    next += 1;
  }
  if (last === null) return { next: at + 1, number: null };

  const wordsEnd = atoms[next - 1].end;
  const after = unitAfter(text, atoms, next, wordsEnd);
  // "one" alone is mostly not a count: "this one", "no one", "one day".
  const isBareOne = next === at + 1 && lower(at) === "one" && !after;
  if (isBareOne) return { next, number: null };
  const end = after?.end ?? wordsEnd;
  return { next: after?.next ?? next, number: { value: total + current, unit: after?.unit ?? "", text: text.slice(atoms[at].start, end), index: atoms[at].start } };
}

/**
 * Every number in the text, as { value, unit, text, index }. The unit is "%", "€", "$", "£" or "".
 * What counts as a number, and what does not, is listed at the top of this file.
 */
export function numbersIn(text) {
  // Digits (with "1 200" as one run), then words, then the unit signs.
  const atoms = [...text.matchAll(/\d{1,3}(?:[   ]\d{3}(?!\d))+(?:[.,]\d+)?|\d[\d.,]*|\p{L}+|[%€$£]/gu)].map((match) => {
    const atomText = match[0].replace(/(?<=\d)[.,]+$/, ""); // the full stop that ends a sentence
    return { text: atomText, start: match.index, end: match.index + atomText.length };
  });
  const numbers = [];
  for (let at = 0; at < atoms.length; ) {
    const read = /^\d/.test(atoms[at].text) ? readDigits(text, atoms, at) : readNumberWords(text, atoms, at);
    if (read.number) numbers.push(read.number);
    at = read.next;
  }
  return numbers;
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

/** One fact per list item. A row with no list mark continues the fact above it. */
function readFact(facts, row) {
  if (row === "") return;
  const item = row.match(/^(?:[-*+]|\d+[.)])\s+(.*)$/);
  if (item || !facts.length) facts.push(item ? item[1] : row);
  else facts[facts.length - 1] += ` ${row}`;
}

function readPair(pairs, row) {
  if (!row.startsWith("|")) return;
  const cells = row.split("|").slice(1, -1).map((cell) => cell.trim());
  const isRule = cells.every((cell) => /^[-:\s]*$/.test(cell));
  if (isRule || /^real part$/i.test(cells[0] ?? "")) return;
  pairs.push({ part: cells[0], element: cells[1] ?? "" });
}

/** Returns the field ("say" or "lines") that a following plain row continues, or null. */
function readBeatRow(beats, row, openField, rowNumber) {
  const heading = row.match(/^###\s+(\d+)\.?\s+(.*?)\s*(?:\((\d+)\s*s\))?$/);
  if (heading) {
    beats.push({ number: Number(heading[1]), name: heading[2], seconds: heading[3] ? Number(heading[3]) : null, lines: [], say: "", rows: [] });
    return null;
  }
  const beat = beats.at(-1);
  if (!beat || row === "") return null;
  const field = row.match(/^(Line|Say):\s*(.*)$/i);
  const target = field ? (field[1].toLowerCase() === "line" ? "lines" : "say") : openField;
  if (!target) return null;
  const text = field ? field[2] : row;
  beat.rows.push({ field: target, text, rowNumber });
  if (target === "say") beat.say += ` ${text}`;
  else if (field) beat.lines.push(text);
  else beat.lines[beat.lines.length - 1] += ` ${text}`;
  return target;
}

export function parseTalk(text) {
  const talk = { settings: { pace: DEFAULT_WORDS_A_MINUTE, avoid: [], keep: [], allow: [] }, facts: null, pairs: [], beats: [] };
  let section = "top";
  let openField = null;
  for (const [index, rawRow] of text.split("\n").entries()) {
    const row = rawRow.trim(); // also drops the \r of a Windows line ending
    const sectionHeading = row.match(/^##\s+(.+)$/);
    if (sectionHeading) {
      section = sectionHeading[1].toLowerCase();
      openField = null;
      if (section.startsWith("facts")) talk.facts ??= []; // an empty section says: no number was given
    } else if (section === "top") readSetting(talk.settings, row);
    else if (section.startsWith("facts")) readFact(talk.facts, row);
    else if (section.startsWith("ledger")) readPair(talk.pairs, row);
    else if (section.startsWith("beats")) openField = readBeatRow(talk.beats, row, openField, index + 1);
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
  // In whole numbers: 50 * 1.1 is a hair over 55 in floating point and would allow 56 seconds.
  if (needed > Math.ceil((beat.seconds * 11) / 10))
    findings.push(`OVER TIME ${where}: ${spokenWords} spoken words need ${needed} s at ${settings.pace} words a minute. The beat has ${beat.seconds} s.`);
  for (const word of settings.avoid) {
    if (hasPhrase(heard, word)) findings.push(`AVOID ${where} uses "${word}". The person asked to avoid it.`);
  }
  if (settings.product && startsAt < QUIET_OPENING_SECONDS && hasPhrase(heard, settings.product))
    findings.push(`EARLY NAME ${where} names "${settings.product}" in the first ${QUIET_OPENING_SECONDS} seconds. Open with the story.`);
  return { findings, needed };
}

/** The time findings and the warning for a talk that is mostly silence. All in whole seconds. */
function checkTime(timed, neededByBeat, settings) {
  const findings = [];
  const warnings = [];
  const planned = timed.reduce((sum, beat) => sum + beat.seconds, 0);
  const needed = neededByBeat.reduce((sum, seconds) => sum + seconds, 0);
  const { limit, pace } = settings;
  if (!limit) findings.push('NO LIMIT the file has no "Limit:" line such as "Limit: 3:00", so the time was checked against nothing.');
  if (limit && planned > limit) findings.push(`OVER LIMIT the beats add up to ${clock(planned)}. The limit is ${clock(limit)}.`);
  if (limit && needed > limit) findings.push(`OVER LIMIT the words need ${clock(needed)} at ${pace} words a minute. The limit is ${clock(limit)}.`);
  if (needed * 10 < planned * 7) {
    const gaps = timed
      .map((beat, index) => ({ beat, words: neededByBeat[index] }))
      .sort((a, b) => b.beat.seconds - b.words - (a.beat.seconds - a.words))
      .slice(0, 3)
      .map(({ beat, words }) => `beat ${beat.number} (${beat.seconds} s planned, ${words} s of words)`);
    warnings.push(
      `UNDER TIME the words need ${clock(needed)}, under 70% of the ${clock(planned)} planned. The talk ends early, or the rest is silence nobody planned. ` +
        `Write what is missing, or give the beats fewer seconds. Largest gaps: ${gaps.join(", ")}.`,
    );
  }
  return { findings, warnings, planned, needed };
}

/**
 * What the audience reads and hears in a beat: the visible line and the spoken text, each as one
 * text of unchanged length, so a place in it leads back to its row in the file.
 */
function heardParts(beat) {
  return ["lines", "say"].map((field) => {
    const rows = beat.rows.filter((row) => row.field === field);
    const joined = rows.map((row) => row.text).join(" ").replace(/[‘’]/g, "'");
    const text = field === "say" ? replaceParens(joined, blank) : joined;
    const rowNumberAt = (index) => {
      let end = 0;
      return (rows.find((row) => (end += row.text.length + 1) > index) ?? rows.at(-1)).rowNumber;
    };
    return { text, rowNumberAt };
  });
}

/** Every number and every claim word the talk says, with its beat and its row in the file. */
function saidIn(beats, product) {
  const numbers = [];
  const claims = [];
  for (const beat of beats) {
    for (const { text, rowNumberAt } of heardParts(beat)) {
      const withoutName = product ? text.replace(phrasePattern(product, "giu"), blank) : text;
      for (const number of numbersIn(withoutName)) numbers.push({ ...number, beat, rowNumber: rowNumberAt(number.index) });
      for (const claim of CLAIMS) {
        for (const match of text.matchAll(new RegExp(claim.pattern, "gi"))) {
          const sentence = text.slice(text.slice(0, match.index).search(/[^.!?]*$/)).match(/^[^.!?]*/)[0];
          if (claim.onlyNearProduct && !(product && hasPhrase(sentence, product))) continue;
          claims.push({ claim, text: match[0], beat, rowNumber: rowNumberAt(match.index) });
        }
      }
    }
  }
  return { numbers, claims };
}

/** value -> the units it was given with ("" when it was given with none). */
function numbersGivenIn(texts) {
  const given = new Map();
  for (const number of texts.flatMap(numbersIn)) given.set(number.value, (given.get(number.value) ?? new Set()).add(number.unit));
  return given;
}

const isGiven = (given, number) => given.has(number.value) && (number.unit === "" || given.get(number.value).has(number.unit));

/** Each different number or claim word once, at the first row that says it. */
function listed(items) {
  const sameWords = (a, b) => a.text.toLowerCase() === b.text.toLowerCase();
  const firstUses = items.filter((item, index) => items.findIndex((other) => sameWords(other, item)) === index);
  const shown = firstUses.slice(0, MAX_LISTED).map((item) => `"${item.text}" (line ${item.rowNumber})`);
  return `${shown.join(", ")}${firstUses.length > MAX_LISTED ? ` and ${firstUses.length - MAX_LISTED} more` : ""}`;
}

/** Numbers and claim words against what the person gave: the facts, the ledger and the Keep phrases. */
function checkFacts({ settings, facts, pairs, beats }) {
  const { numbers, claims } = saidIn(beats, settings.product);
  if (facts === null) {
    const unchecked = [...numbers, ...claims];
    const what = unchecked.length ? `${numbers.length} number(s) and ${claims.length} claim word(s) were checked against nothing: ${listed(unchecked)}` : "no number and no claim word could be checked";
    return {
      findings: [],
      warnings: [`NO FACTS the file has no "## Facts" section, so ${what}. Add the section with one row per fact the person gave, or an empty one if they gave none.`],
      summary: `facts    no "## Facts" section; ${numbers.length} number(s) in the talk, not checked`,
    };
  }

  const realFacts = facts.filter((fact) => !isExample(fact));
  const exampleFacts = facts.filter(isExample);
  const personsWords = [...realFacts, ...settings.keep];
  const given = numbersGivenIn([...personsWords, ...pairs.flatMap((pair) => [pair.part, pair.element])]);
  const givenAsExample = numbersGivenIn(exampleFacts);
  const findings = [];
  const unknown = new Map();
  const unlabelled = new Map();
  for (const number of numbers) {
    if (isGiven(given, number)) continue;
    if (!isGiven(givenAsExample, number)) {
      const key = `${number.value}${number.unit}`;
      unknown.set(key, [...(unknown.get(key) ?? []), number]);
    } else if (!SAYS_EXAMPLE.test(heardIn(number.beat)) && !unlabelled.has(number.beat)) unlabelled.set(number.beat, number);
  }
  for (const uses of unknown.values()) {
    const places = [...new Set(uses.map((use) => `line ${use.rowNumber}, beat ${use.beat.number}`))].join("; ");
    findings.push(`NOT IN FACTS "${uses[0].text}" (${places}) is in no fact, no ledger row and no Keep phrase. Say a number the person gave, or leave a placeholder such as [X].`);
  }
  for (const [beat, number] of unlabelled) {
    findings.push(
      `EXAMPLE DATA beat ${beat.number} (${beat.name}) says "${number.text}" (line ${number.rowNumber}), which is example data, and never says so. ` +
        'Say "example" or "demo" in that beat, so nobody takes it for a real figure.',
    );
  }
  const personsText = personsWords.join(" ").replace(/[‘’]/g, "'");
  for (const { claim, text, beat, rowNumber } of claims) {
    if (!claim.pattern.test(personsText))
      findings.push(`CLAIM "${text}" (line ${rowNumber}, beat ${beat.number}) is a promise no fact makes. Cut it, or add the fact the person gave to "## Facts".`);
  }
  return { findings, warnings: [], summary: `facts    ${realFacts.length} given, ${exampleFacts.length} marked Example; ${numbers.length} number(s) in the talk` };
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
  const nothing = (why) => ({ findings: [`NOTHING TO CHECK ${why}`], warnings: [], notes: [], summary: [] });
  if (!pairs.length) return nothing('no "## Ledger" table was found. The ledger is the contract; write it first.');
  if (!timed.length) return nothing('no timed beat was found under "## Beats". A beat heading looks like "### 1. Hook (10 s)".');

  const findings = checkLedger(talk);
  const neededByBeat = [];
  let startsAt = 0;
  for (const beat of timed) {
    const result = checkBeat(beat, startsAt, settings);
    findings.push(...result.findings);
    neededByBeat.push(result.needed);
    startsAt += beat.seconds;
  }
  const time = checkTime(timed, neededByBeat, settings);
  const facts = checkFacts(talk);
  findings.push(...time.findings, ...facts.findings);
  const allText = beats.map((beat) => `${beat.lines.join(" ")} ${beat.say}`).join(" ");
  for (const phrase of missingKeptPhrases(settings.keep, allText)) findings.push(`KEEP the person's phrase "${phrase}" is missing or was changed.`);
  if (timed.length > 1 && !hasCallback(pairs, timed[0], timed.at(-1)))
    findings.push(`NO CALLBACK beat ${timed.at(-1).number} repeats no story element from beat ${timed[0].number}. End on an object or phrase from the opening.`);

  const notes = [];
  const placeholders = [...new Set(allText.match(/\[[A-Z?]{1,3}\]/g) ?? [])];
  if (placeholders.length) notes.push(`placeholders still open: ${placeholders.join(", ")}. The speaker fills them from a real run, never from a guess.`);
  if (!settings.product) notes.push(`no "Product:" line, so the early-name check and the check on "the only" did not run.`);
  const plainCount = pairs.filter((pair) => isPlain(pair.element)).length;
  const summary = [
    `ledger   ${pairs.length - plainCount} story pairs, ${plainCount} told plainly`,
    `beats    ${timed.length} timed, ${beats.length - timed.length} not timed`,
    `time     ${clock(time.planned)} planned${settings.limit ? ` of ${clock(settings.limit)}` : ""}; the words need ${clock(time.needed)} at ${settings.pace} words a minute`,
    facts.summary,
  ];
  return { findings, warnings: [...time.warnings, ...facts.warnings], notes, summary };
}

/** The line a person quotes. "Clean." is kept for a talk with no finding and no warning. */
function lastLine(findingCount, warningCount) {
  if (findingCount) return `${findingCount} finding(s)${warningCount ? `, ${warningCount} warning(s)` : ""}.`;
  return warningCount ? `No findings, ${warningCount} warning(s).` : "Clean.";
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
  const { findings, warnings, notes, summary } = checkTalk(parseTalk(fs.readFileSync(args[0], "utf8")));
  console.log(`check-story: ${path.basename(args[0])}`);
  for (const row of summary) console.log(`  ${row}`);
  for (const finding of findings) console.log(`  FINDING  ${finding}`);
  for (const warning of warnings) console.log(`  WARNING  ${warning}`);
  for (const note of notes) console.log(`  note     ${note}`);
  console.log(lastLine(findings.length, warnings.length));
  return findings.length ? 1 : 0;
}

// Real paths on both sides: a folder reached through a link (macOS /var, a Windows junction) would
// otherwise make the script exit 0 without running.
if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  // A crash must not look like a finding. Exit code 1 is kept for findings only.
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`check-story crashed, nothing was checked: ${error?.message ?? error}`);
    process.exitCode = 2;
  }
}
