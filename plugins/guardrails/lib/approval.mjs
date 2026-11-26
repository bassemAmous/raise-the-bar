// Human approval for production. Two ways, both hard for an agent to do for you:
//   1. You type the approval line in the chat. The hook reads the session transcript and only
//      counts rows the app marked as typed by a person, not tool output or injected text.
//   2. You run `guardrails approve` in a real terminal. It refuses to run without one.
import fs from "node:fs";
import { readRecord } from "./records.mjs";

const TAIL_BYTES = 4 * 1024 * 1024;

function tailOf(file) {
  const size = fs.statSync(file).size;
  const start = Math.max(0, size - TAIL_BYTES);
  const fd = fs.openSync(file, "r");
  try {
    const buffer = Buffer.alloc(size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    return buffer.toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}

/** True for a transcript row that a person typed. Anything unclear is not counted. */
export function isTypedByHuman(row) {
  if (!row || row.isSidechain) return false;
  // A message typed while the agent was busy is stored as a queued command, with its origin.
  if (row.type === "attachment") {
    const queued = row.attachment;
    return (
      queued?.type === "queued_command" &&
      queued.commandMode === "prompt" &&
      queued.origin?.kind === "human" &&
      !queued.isMeta
    );
  }
  if (row.type !== "user" || row.isMeta) return false;
  // A summary written after compaction restates old text. It is not something a person typed now.
  if (row.isCompactSummary || row.isVisibleInTranscriptOnly) return false;
  if (row.promptSource !== undefined)
    return (
      (row.promptSource === "typed" || row.promptSource === "queued") &&
      (row.turnOrigin === undefined || row.turnOrigin === "human")
    );
  if (row.turnOrigin !== undefined) return row.turnOrigin === "human";
  // Older logs carry no origin. Plain typed text counts; slash commands and command output
  // (which a hook or a program can write) do not.
  const content = row.message?.content;
  return typeof content === "string" && !row.rowSource && !content.trimStart().startsWith("<");
}

function textOf(row) {
  if (row.type === "attachment") return typeof row.attachment.prompt === "string" ? row.attachment.prompt : "";
  const content = row.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  if (content.some((block) => block?.type === "tool_result")) return "";
  return content
    .filter((block) => block?.type === "text")
    .map((block) => block.text)
    .join("\n");
}

/** Lines a person typed in this session, newest last: [{ text, at }]. */
export function typedLines(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return [];
  const lines = [];
  for (const raw of tailOf(transcriptPath).split("\n")) {
    if (!raw.includes('"user"') && !raw.includes('"queued_command"')) continue;
    let row;
    try {
      row = JSON.parse(raw);
    } catch {
      continue; // a cut first line, or a row still being written
    }
    if (!isTypedByHuman(row)) continue;
    const text = textOf(row);
    if (text) lines.push({ text, at: Date.parse(row.timestamp ?? row.attachment?.timestamp ?? "") || null });
  }
  return lines;
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Did a person approve this commit?
 * The typed line is the phrase followed by at least the first 7 characters of the commit id,
 * for example: approve production 3f2a9c1
 * Outside a git repository there is no commit to name: the line is the phrase and the word
 * "now", and it only counts for 10 minutes.
 */
export function typedApproval({ transcriptPath, phrase, head, maxAgeMinutes, now = Date.now() }) {
  const words = escapeRegExp(phrase).replace(/\s+/g, "\\s+");
  const pattern = new RegExp(`${words}\\s+(${head ? "[0-9a-f]{7,40}" : "now"})\\b`, "i");
  const maxAge = (head ? maxAgeMinutes : Math.min(maxAgeMinutes, 10)) * 60000;
  for (const line of typedLines(transcriptPath).reverse()) {
    const match = line.text.match(pattern);
    if (!match) continue;
    if (head && !head.startsWith(match[1].toLowerCase())) continue;
    if (line.at === null || now - line.at > maxAge) continue;
    return { via: "chat", at: new Date(line.at).toISOString() };
  }
  return null;
}

export function approvalFor({ cwd, head, transcriptPath, config }) {
  const record = head ? readRecord(cwd, "approval", head) : null;
  if (record) return { via: "terminal", at: record.at };
  return typedApproval({
    transcriptPath,
    phrase: config.approval.phrase,
    head,
    maxAgeMinutes: config.approval.maxAgeMinutes,
  });
}
