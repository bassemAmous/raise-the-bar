// Tests for check-story.mjs. Run: node --test check-story.test.mjs
// Each test writes a small talk file to the temp folder and runs the script on it as a child
// process. Every product, rule and number below is invented.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as story from "./check-story.mjs";

const { secondsOf } = story;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "check-story.mjs");
const EXAMPLE = path.join(HERE, "..", "assets", "example-talk.md");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "check-story-test-"));
let fileCount = 0;

after(() => fs.rmSync(ROOT, { recursive: true, force: true }));

const SETTINGS = ["Product: Pretendly", "Limit: 1:00", "Avoid: left"];

const LEDGER = [
  "| Real part | Story element | First beat |",
  "| --- | --- | --- |",
  "| The teammate who knows | Grandma | 1 |",
  "| The ticket | The recipe card | 1 |",
  "| What the logs show | Bitter soup | 2 |",
];

// What the person gave. It holds no number, so a number that a test adds to a beat is in no fact.
const FACTS = ["- Pretendly reads the recipe cards a team already has."];

// The spoken words fill most of each beat (35 of the 40 seconds), as a real talk does.
const HOOK = [
  "### 1. Hook (10 s)",
  "Line: Grandma knew a secret she never wrote down.",
  "Say: Whose family has a recipe card nobody else can cook from? Hands up. Mine does, and it is Grandma's.",
];
const LOSS = [
  "### 2. The loss (20 s)",
  "Line: When she retired, the soup turned bitter.",
  "Say: Then Grandma retired. Now every pot is bitter soup. We changed the lentils and it stayed bitter. We changed the pot and it stayed bitter. We even changed the stove. Nobody looked at the card, because the card was right.",
];
const END = [
  "### 3. The end (10 s)",
  "Line: Grandma can retire. Her secrets stay.",
  "Say: The recipe card has a new line now, in a second hand. Grandma can retire, and the soup stays sweet.",
];

// Builds a talk file from its parts, so each test changes one part only. "facts: null" leaves the
// "## Facts" section out, like a talk file written before that section existed.
function talk({ settings = SETTINGS, facts = FACTS, ledger = LEDGER, beats = [HOOK, LOSS, END] } = {}) {
  const factRows = facts === null ? [] : ["## Facts", "", ...facts, ""];
  return ["# Talk: an invented example", "", ...settings, "", ...factRows, "## Ledger", "", ...ledger, "", "## Beats", "", ...beats.flatMap((beat) => [...beat, ""])].join("\n");
}

/** A copy of the beat that says something else. */
const saying = (beat, say) => [beat[0], beat[1], `Say: ${say}`];
/** A copy of the beat that says a few words more. */
const adding = (beat, more) => [beat[0], beat[1], `${beat[2]} ${more}`];
/** The row of the talk file, counted from 1, that holds the words. */
const rowOf = (text, words) => text.split("\n").findIndex((row) => row.includes(words)) + 1;
const filler = (count) => "soup ".repeat(count).trim();

function run(text) {
  fileCount += 1;
  const file = path.join(ROOT, `talk-${fileCount}.md`);
  fs.writeFileSync(file, text);
  return runScript([file]);
}

function runScript(args) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

test("a talk that keeps every rule is clean", () => {
  const result = run(talk());
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /ledger {3}3 story pairs, 0 told plainly/);
  assert.match(result.out, /time {5}0:40 planned of 1:00/);
  assert.match(result.out, /^Clean\.$/m);
});

test("the example talk that ships with the skill is clean", () => {
  const result = runScript([EXAMPLE]);
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /6 story pairs, 1 told plainly/);
  assert.match(result.out, /2:55 planned of 3:00/);
  assert.match(result.out, /facts {4}2 given, 1 marked Example; 11 number\(s\) in the talk/);
  assert.match(result.out, /^Clean\.$/m);
});

test("one story element that stands for two real parts is a finding", () => {
  const result = run(talk({ ledger: [...LEDGER, "| Every repository | the recipe card | 2 |"] }));
  assert.equal(result.code, 1);
  assert.match(result.out, /DOUBLE MEANING "The recipe card" stands for "The ticket" and "Every repository"/);
});

test("a part with no story element is a finding until it is marked plain", () => {
  const open = run(talk({ ledger: [...LEDGER, "| How it works inside | (no match) | 2 |"] }));
  assert.equal(open.code, 1);
  assert.match(open.out, /OPEN GAP "How it works inside"/);
  const plain = run(talk({ ledger: [...LEDGER, "| How it works inside | (plain) | 2 |"] }));
  assert.equal(plain.code, 0, plain.out);
  assert.match(plain.out, /3 story pairs, 1 told plainly/);
});

test("a stock image is a finding unless the person allowed it", () => {
  const ledger = [...LEDGER, "| The hidden work | The iceberg under the soup | 2 |"];
  const refused = run(talk({ ledger }));
  assert.equal(refused.code, 1);
  assert.match(refused.out, /STOCK IMAGE "The iceberg under the soup" is a worn-out picture \(iceberg\)/);
  const allowed = run(talk({ ledger, settings: [...SETTINGS, "Allow: iceberg"] }));
  assert.equal(allowed.code, 0, allowed.out);
});

test("a story element that no beat says is a finding", () => {
  const result = run(talk({ ledger: [...LEDGER, "| The projects | Four kitchens | 2 |"] }));
  assert.equal(result.code, 1);
  assert.match(result.out, /NEVER SAID "Four kitchens" is in the ledger but in no beat/);
});

test("a timed beat needs exactly one visible line of 12 words at most", () => {
  const noLine = run(talk({ beats: [HOOK, [LOSS[0], LOSS[2]], END] }));
  assert.equal(noLine.code, 1);
  assert.match(noLine.out, /NO LINE beat 2 \(The loss\) has 0 visible lines/);
  const longLine = "Line: When Grandma retired to the seaside every pot of soup we cooked turned bitter.";
  const tooLong = run(talk({ beats: [HOOK, [LOSS[0], longLine, LOSS[2]], END] }));
  assert.equal(tooLong.code, 1);
  assert.match(tooLong.out, /LONG LINE beat 2 \(The loss\): 14 words, 12 at most/);
});

test("a beat with more words than its seconds allow is a finding", () => {
  const sixtyWords = `Say: ${"Grandma stirred the bitter soup again. ".repeat(10)}`;
  const result = run(talk({ beats: [HOOK, [LOSS[0], LOSS[1], sixtyWords], END] }));
  assert.equal(result.code, 1);
  assert.match(result.out, /OVER TIME beat 2 \(The loss\): 60 spoken words need 26 s at 140 words a minute\. The beat has 20 s\./);
});

test("a stage direction in parentheses is not counted as spoken", () => {
  const direction = `(${"Hold the recipe card up and wait. ".repeat(12)})`;
  const result = run(talk({ beats: [HOOK, [...LOSS, direction], END] }));
  assert.equal(result.code, 0, result.out);
});

test("beats that add up past the limit are a finding, and so is no limit at all", () => {
  const over = run(talk({ settings: ["Limit: 0:30"] }));
  assert.equal(over.code, 1);
  assert.match(over.out, /OVER LIMIT the beats add up to 0:40\. The limit is 0:30\./);
  const none = run(talk({ settings: [] }));
  assert.equal(none.code, 1);
  assert.match(none.out, /NO LIMIT/);
});

test("a word the person asked to avoid is found as a whole word only", () => {
  const used = run(talk({ beats: [HOOK, [LOSS[0], LOSS[1], "Say: Then Grandma left. Now every pot is bitter soup."], END] }));
  assert.equal(used.code, 1);
  assert.match(used.out, /AVOID beat 2 \(The loss\) uses "left"/);
  const inside = run(talk({ beats: [HOOK, [LOSS[0], LOSS[1], "Say: Then Grandma retired. The leftovers are bitter soup."], END] }));
  assert.equal(inside.code, 0, inside.out);
});

test("a phrase the person wrote must stay, and a curly apostrophe is not a change", () => {
  const changed = run(talk({ settings: [...SETTINGS, "Keep: Grandma may rest. Her secrets stay."] }));
  assert.equal(changed.code, 1);
  assert.match(changed.out, /KEEP the person's phrase "Grandma may rest\. Her secrets stay\." is missing or was changed/);
  const curly = [END[0], "Line: Grandma’s secrets stay.", END[2]];
  const kept = run(talk({ settings: [...SETTINGS, "Keep: Grandma's secrets stay."], beats: [HOOK, LOSS, curly] }));
  assert.equal(kept.code, 0, kept.out);
});

test("the product named in the first 15 seconds is a finding", () => {
  const early = [HOOK[0], HOOK[1], "Say: Pretendly reads every recipe card Grandma never finished."];
  const result = run(talk({ beats: [early, LOSS, END] }));
  assert.equal(result.code, 1);
  assert.match(result.out, /EARLY NAME beat 1 \(Hook\) names "Pretendly" in the first 15 seconds/);
});

test("an ending that repeats nothing from the opening is a finding", () => {
  const coldEnd = ["### 3. The end (10 s)", "Line: Bitter soup is over.", "Say: No more bitter soup. Thank you."];
  const result = run(talk({ beats: [HOOK, LOSS, coldEnd] }));
  assert.equal(result.code, 1);
  assert.match(result.out, /NO CALLBACK beat 3 repeats no story element from beat 1/);
});

test("a beat with no seconds is not timed, and an open placeholder is a note", () => {
  const backup = ["### 4. Backup video", "Say: Pretendly found [X] of 10 planted breaks."];
  const result = run(talk({ facts: [...FACTS, "- The test: 10 breaks planted in a test project."], beats: [HOOK, LOSS, END, backup] }));
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /beats {4}3 timed, 1 not timed/);
  assert.match(result.out, /note {5}placeholders still open: \[X\]/);
});

test("a file with Windows line endings reads the same", () => {
  const result = run(talk().replace(/\n/g, "\r\n"));
  assert.equal(result.code, 0, result.out);
});

test("a file with no ledger or no timed beat is a finding, not a pass", () => {
  const noLedger = run(talk({ ledger: [] }));
  assert.equal(noLedger.code, 1);
  assert.match(noLedger.out, /NOTHING TO CHECK no "## Ledger" table/);
  const noBeats = run(talk({ beats: [] }));
  assert.equal(noBeats.code, 1);
  assert.match(noBeats.out, /NOTHING TO CHECK no timed beat/);
});

test("bad usage and a missing file exit with 2, never with a finding", () => {
  assert.equal(runScript([]).code, 2);
  assert.equal(runScript(["--help"]).code, 2);
  const missing = runScript([path.join(ROOT, "no-such-talk.md")]);
  assert.equal(missing.code, 2);
  assert.match(missing.err, /not a file/);
});

test("a limit can be written as a clock, as seconds or as minutes", () => {
  assert.equal(secondsOf("3:00"), 180);
  assert.equal(secondsOf("180"), 180);
  assert.equal(secondsOf("180 s"), 180);
  assert.equal(secondsOf("3 min"), 180);
  assert.equal(secondsOf("soon"), null);
});

test("a number that is in no fact is a finding that names the row", () => {
  const text = talk({ beats: [HOOK, adding(LOSS, "We already run in forty restaurants."), END] });
  const result = run(text);
  assert.equal(result.code, 1, result.out);
  assert.match(result.out, new RegExp(`NOT IN FACTS "forty" \\(line ${rowOf(text, "forty restaurants")}, beat 2\\)`));
  assert.match(result.out, /^1 finding\(s\)\.$/m);
});

test("a number matches its fact as digits, as a word and with its unit", () => {
  const facts = ["- 40 restaurants use it. It costs 29 euros a month.", "- Food waste fell by 18%."];
  const result = run(talk({ facts, beats: [HOOK, adding(LOSS, "Forty restaurants pay twenty-nine euros. Waste fell eighteen percent."), END] }));
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /facts {4}2 given, 0 marked Example; 3 number\(s\) in the talk/);
  assert.match(result.out, /^Clean\.$/m);
});

test("a number said with another unit than its fact is a finding", () => {
  const facts = ["- 18 customers pay 29 dollars a month."];
  const result = run(talk({ facts, beats: [HOOK, adding(LOSS, "Waste fell eighteen percent for 29 euros."), END] }));
  assert.equal(result.code, 1, result.out);
  assert.match(result.out, /NOT IN FACTS "eighteen percent" \(line \d+, beat 2\)/);
  assert.match(result.out, /NOT IN FACTS "29 euros" \(line \d+, beat 2\)/);
});

test("seconds, beat numbers and stage directions are not numbers of the talk", () => {
  const result = run(talk({ beats: [adding(HOOK, "(Raise your own hand. Wait two seconds.)"), LOSS, END] }));
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /; 0 number\(s\) in the talk/);
  assert.match(result.out, /^Clean\.$/m);
});

test("a number of the story is given by the ledger or by a Keep phrase", () => {
  const ledger = [...LEDGER, "| The projects | Four kitchens | 2 |"];
  const settings = [...SETTINGS, "Keep: Seven days a week."];
  const end = saying(END, "The recipe card has a new line now. Seven days a week. Grandma can retire.");
  const result = run(talk({ settings, ledger, beats: [HOOK, adding(LOSS, "Four kitchens, four bitter soups."), end] }));
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /^Clean\.$/m);
});

test("the word one alone is not a number; one with a unit is", () => {
  const alone = run(talk({ beats: [HOOK, adding(LOSS, "One card. No one asked her."), END] }));
  assert.equal(alone.code, 0, alone.out);
  const withUnit = run(talk({ beats: [HOOK, adding(LOSS, "It fails one percent of the time."), END] }));
  assert.equal(withUnit.code, 1);
  assert.match(withUnit.out, /NOT IN FACTS "one percent"/);
});

test("numbers are read from words, digits, short forms and units", () => {
  const read = (text) => story.numbersIn(text).map((number) => `${number.value}${number.unit}`);
  assert.deepEqual(read("one hundred and five kitchens, twenty-one pots, a hundred spoons"), ["105", "21", "100"]);
  assert.deepEqual(read("1,200 users, 40k visits, $5 million, 3.5 stars, 2 million euros"), ["1200", "40000", "5000000$", "3.5", "2000000€"]);
  assert.deepEqual(read("1 200 users pay 1 250,50 euros in 2031"), ["1200", "1250.5€", "2031"]);
  assert.deepEqual(read("eighteen percent, 18 %, 18 per cent, €29, 29 EUR"), ["18%", "18%", "18%", "29€", "29€"]);
  assert.deepEqual(read("two, three and four. Twenty twenty."), ["2", "3", "4", "20", "20"]);
  // Names, ordinals and vague words are not numbers.
  assert.deepEqual(read("the 2nd run of v2 on Q3, twice, in a second hand, hundreds of first tries"), []);
});

test("example data passes only in a beat that says it is an example", () => {
  const facts = [...FACTS, "- Example: the demo shop runs out of butter in two days."];
  const labelled = run(talk({ facts, beats: [HOOK, adding(LOSS, "In this example the butter runs out in two days."), END] }));
  assert.equal(labelled.code, 0, labelled.out);
  assert.match(labelled.out, /facts {4}1 given, 1 marked Example/);
  const bare = run(talk({ facts, beats: [HOOK, adding(LOSS, "The butter runs out in two days."), END] }));
  assert.equal(bare.code, 1);
  assert.match(bare.out, /EXAMPLE DATA beat 2 \(The loss\) says "two" \(line \d+\)/);
});

test("a claim word that no fact backs is a finding", () => {
  const beats = [HOOK, adding(LOSS, "It pays for itself, guaranteed."), END];
  const invented = run(talk({ beats }));
  assert.equal(invented.code, 1);
  assert.match(invented.out, /CLAIM "pays for itself" \(line \d+, beat 2\)/);
  assert.match(invented.out, /CLAIM "guaranteed" \(line \d+, beat 2\)/);
  const given = run(talk({ facts: [...FACTS, "- It pays for itself in a month, and the refund is guaranteed."], beats }));
  assert.equal(given.code, 0, given.out);
});

test("the only is a claim in a sentence that names the product, not in the story", () => {
  const inStory = run(talk({ beats: [HOOK, adding(LOSS, "She was the only cook who knew."), END] }));
  assert.equal(inStory.code, 0, inStory.out);
  const end = saying(END, "The recipe card has a new line now. Pretendly is the only tool that writes it. Grandma can retire.");
  const claim = run(talk({ beats: [HOOK, LOSS, end] }));
  assert.equal(claim.code, 1);
  assert.match(claim.out, /CLAIM "the only" \(line \d+, beat 3\)/);
});

test("a talk with no facts section is a warning that lists what was not checked", () => {
  const text = talk({ facts: null, beats: [HOOK, adding(LOSS, "Forty restaurants. It pays for itself."), END] });
  const result = run(text);
  const row = rowOf(text, "Forty restaurants");
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /WARNING {2}NO FACTS the file has no "## Facts" section/);
  assert.match(result.out, new RegExp(`"Forty" \\(line ${row}\\), "pays for itself" \\(line ${row}\\)`));
  assert.match(result.out, /^No findings, 1 warning\(s\)\.$/m);
  assert.doesNotMatch(result.out, /^Clean\.$/m);
});

test("an empty facts section means the person gave no number", () => {
  const result = run(talk({ facts: [], beats: [HOOK, adding(LOSS, "Forty restaurants."), END] }));
  assert.equal(result.code, 1);
  assert.match(result.out, /NOT IN FACTS "Forty"/);
});

test("words that fill under 70% of the planned time are a warning, not a clean pass", () => {
  // 5:00 planned for the same few words: the case that used to print "Clean."
  const stretched = (beat, seconds) => [beat[0].replace(/\(\d+ s\)/, `(${seconds} s)`), beat[1], beat[2]];
  const thin = run(talk({ settings: ["Product: Pretendly", "Limit: 5:00"], beats: [stretched(HOOK, 60), stretched(LOSS, 180), stretched(END, 60)] }));
  assert.equal(thin.code, 0, thin.out);
  assert.match(thin.out, /WARNING {2}UNDER TIME the words need 0:35, under 70% of the 5:00 planned/);
  assert.match(thin.out, /beat 2 \(180 s planned, 17 s of words\)/);
  assert.match(thin.out, /^No findings, 1 warning\(s\)\.$/m);
  // 28 of 40 seconds is 70% exactly: no warning.
  const enough = run(talk({ beats: [HOOK, saying(LOSS, "Grandma stirred the soup. ".repeat(6).trim()), END] }));
  assert.match(enough.out, /the words need 0:28 at 140/);
  assert.match(enough.out, /^Clean\.$/m);
});

test("words that need more than the limit are a finding, even when each beat fits", () => {
  const full = `Grandma recipe card ${filler(22)}`;
  const result = run(talk({ settings: ["Product: Pretendly", "Limit: 0:40"], beats: [saying(HOOK, full), saying(LOSS, filler(51)), saying(END, full)] }));
  assert.equal(result.code, 1, result.out);
  assert.doesNotMatch(result.out, /OVER TIME/);
  assert.match(result.out, /OVER LIMIT the words need 0:44 at 140 words a minute\. The limit is 0:40\./);
});

test("the ready rows for 3, 5 and 10 minutes in the reference pass the check", () => {
  const reference = fs.readFileSync(path.join(HERE, "..", "references", "beats-and-script.md"), "utf8");
  const cellsOf = (row) => row.split("|").map((cell) => cell.trim());
  const rows = reference.split("\n").map(cellsOf).filter((cells) => /^\d+$/.test(cells[1] ?? "") && /^(?:\d+|none)$/.test(cells[3] ?? ""));
  assert.equal(rows.length, 9, "the beat sheet has nine timed beats, each with whole seconds or none");
  for (const [column, limit, planned] of [[3, "3:00", "2:55"], [4, "5:00", "4:50"], [5, "10:00", "9:45"]]) {
    // Each beat speaks 85% of its seconds at 140 words a minute, inside the range the table gives.
    const beats = rows.filter((cells) => cells[column] !== "none").map((cells) => {
      const words = Math.round(((Number(cells[column]) * 140) / 60) * 0.85);
      return [`### ${cells[1]}. ${cells[2]} (${cells[column]} s)`, "Line: Grandma knew the recipe card.", `Say: Grandma recipe card ${filler(words - 3)}`];
    });
    const result = run(talk({ settings: [`Limit: ${limit}`], beats }));
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, new RegExp(`time {5}${planned} planned of ${limit}`));
    assert.match(result.out, /^Clean\.$/m);
  }
});

test("a beat may run 10% over its seconds, and not a second more", () => {
  // 50 s is one of the lengths where 50 * 1.1 is a hair over 55 in floating point.
  const fifty = (count) => [LOSS[0].replace("20 s", "50 s"), LOSS[1], `Say: ${filler(count)}`];
  const settings = ["Product: Pretendly", "Limit: 1:30"];
  const allowed = run(talk({ settings, beats: [HOOK, fifty(129), END] }));
  assert.equal(allowed.code, 0, allowed.out);
  const over = run(talk({ settings, beats: [HOOK, fifty(131), END] }));
  assert.equal(over.code, 1, over.out);
  assert.match(over.out, /OVER TIME beat 2 \(The loss\): 131 spoken words need 56 s at 140 words a minute\. The beat has 50 s\./);
});
