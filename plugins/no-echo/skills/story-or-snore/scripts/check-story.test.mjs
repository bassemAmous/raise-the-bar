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
import { secondsOf } from "./check-story.mjs";

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

const HOOK = ["### 1. Hook (10 s)", "Line: Grandma knew a secret she never wrote down.", "Say: Whose family has a recipe card nobody else can cook from?"];
const LOSS = ["### 2. The loss (20 s)", "Line: When she retired, the soup turned bitter.", "Say: Then Grandma retired. Now every pot is bitter soup."];
const END = ["### 3. The end (10 s)", "Line: Grandma can retire. Her secrets stay.", "Say: The recipe card has a new line now. Grandma can retire."];

// Builds a talk file from its parts, so each test changes one part only.
function talk({ settings = SETTINGS, ledger = LEDGER, beats = [HOOK, LOSS, END] } = {}) {
  return ["# Talk: an invented example", "", ...settings, "", "## Ledger", "", ...ledger, "", "## Beats", "", ...beats.flatMap((beat) => [...beat, ""])].join("\n");
}

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
  const result = run(talk({ beats: [HOOK, LOSS, END, backup] }));
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
