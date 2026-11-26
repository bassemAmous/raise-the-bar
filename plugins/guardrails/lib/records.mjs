// The records the gates read: a passed test run, a passed review, a human approval.
// Each one is tied to a git tree, the exact content of a commit. Change one byte of the code
// and the tree changes, so an old record can never cover new code.
import fs from "node:fs";
import path from "node:path";
import { appendAudit, stateDir, treeOf } from "./core.mjs";

const KINDS = ["tests", "review", "approval"];

function recordFile(dir, kind, tree) {
  return path.join(dir, kind, `${tree}.json`);
}

export function readRecord(cwd, kind, ref) {
  const dir = stateDir(cwd);
  const tree = treeOf(ref, cwd);
  if (!dir || !tree) return null;
  try {
    const record = JSON.parse(fs.readFileSync(recordFile(dir, kind, tree), "utf8"));
    if (record.tree !== tree) return null;
    if (record.expiresAt && Date.parse(record.expiresAt) < Date.now()) return null;
    return record;
  } catch {
    return null;
  }
}

export function writeRecord(cwd, kind, ref, data) {
  if (!KINDS.includes(kind)) throw new Error(`unknown record kind: ${kind}`);
  const dir = stateDir(cwd);
  const tree = treeOf(ref, cwd);
  if (!dir || !tree) throw new Error(`cannot resolve ${ref} in ${cwd}`);
  const file = recordFile(dir, kind, tree);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const record = { kind, tree, at: new Date().toISOString(), ...data };
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  appendAudit(dir, { event: `${kind}-recorded`, tree, head: data.head });
  return record;
}

/** The three lines a review report must end with for it to count as passed. */
export function reviewTrailer(report) {
  const verdict = report.match(/^\s*VERDICT:\s*(PASS|FAIL)\s*$/im)?.[1]?.toUpperCase();
  const critical = report.match(/^\s*OPEN-CRITICAL:\s*(\d+)\s*$/im)?.[1];
  const high = report.match(/^\s*OPEN-HIGH:\s*(\d+)\s*$/im)?.[1];
  if (!verdict || critical === undefined || high === undefined) return null;
  return { verdict, openCritical: Number(critical), openHigh: Number(high) };
}
