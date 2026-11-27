// Human approval for production. Two ways, both hard for an agent to do for you:
//   1. You type the approval line in the chat. The hook reads the session transcript and only
//      counts rows the app marked as typed by a person, not tool output or injected text.
//   2. You run `guardrails approve` in a real terminal. It refuses to run without one.
import fs from "node:fs";
import { readRecord } from "./records.mjs";

const CHUNK_BYTES = 1024 * 1024;
const MAX_BYTES = 256 * 1024 * 1024;

/**
 * The rows of a session log, newest first. The file is read from its end, a piece at a time,
 * so the caller can stop as soon as the rows are older than it cares about.
 */
function* rowsNewestFirst(file) {
  const fd = fs.openSync(file, "r");
  try {
    let end = fs.fstatSync(fd).size;
    let rest = Buffer.alloc(0); // the tail of a row whose start is in an earlier piece
    for (let read = 0; end > 0 && read < MAX_BYTES; ) {
      const start = Math.max(0, end - CHUNK_BYTES);
      const piece = Buffer.alloc(end - start);
      fs.readSync(fd, piece, 0, piece.length, start);
      read += piece.length;
      end = start;
      const block = Buffer.concat([piece, rest]);
      // Before the first line break is the end of a row that starts earlier: keep it for the next piece.
      const cut = start === 0 ? -1 : block.indexOf(10);
      if (start > 0 && cut === -1) {
        rest = block;
        continue;
      }
      rest = block.subarray(0, Math.max(cut, 0));
      const rows = block.subarray(cut + 1).toString("utf8").split("\n");
      for (let i = rows.length - 1; i >= 0; i--) yield rows[i];
    }
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
  if (row.promptSource !== undefined) {
    // The editor extensions send what a person types through the SDK, and mark the turn as
    // human. A program driving the SDK is marked "sdk", and does not count.
    if (row.promptSource === "sdk") return row.turnOrigin === "human";
    return (
      (row.promptSource === "typed" || row.promptSource === "queued") &&
      (row.turnOrigin === undefined || row.turnOrigin === "human")
    );
  }
  if (row.turnOrigin !== undefined) return row.turnOrigin === "human";
  // Older logs carry no origin. Plain typed text counts; slash commands and command output
  // (which a hook or a program can write) do not.
  const content = row.message?.content;
  if (row.rowSource || row.toolUseResult !== undefined) return false;
  return typeof content === "string" && !content.trimStart().startsWith("<");
}

function textOf(row) {
  const content = row.type === "attachment" ? row.attachment.prompt : row.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  if (content.some((block) => block?.type === "tool_result")) return "";
  return content
    .filter((block) => block?.type === "text")
    .map((block) => block.text)
    .join("\n");
}

/**
 * The messages a person typed in this session, newest first: [{ text, at }].
 * `since` (a time in ms) stops the read at the first row older than it.
 */
export function typedMessages(transcriptPath, since = 0) {
  const messages = [];
  try {
    if (!transcriptPath || !fs.statSync(transcriptPath).isFile()) return messages;
    for (const raw of rowsNewestFirst(transcriptPath)) {
      if (!raw.includes('"user"') && !raw.includes('"queued_command"')) continue;
      let row;
      try {
        row = JSON.parse(raw);
      } catch {
        continue; // a row still being written
      }
      const at = Date.parse(row.timestamp ?? row.attachment?.timestamp ?? "") || null;
      if (at !== null && at < since) break;
      if (!isTypedByHuman(row)) continue;
      const text = textOf(row);
      if (text) messages.push({ text, at });
    }
  } catch {
    // A log that is missing, is a folder or cannot be read holds no approval.
  }
  return messages;
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Did a person approve this commit?
 * The typed message is the phrase followed by at least the first 7 characters of the commit id,
 * for example: approve production 3f2a9c1
 * It must be the whole message. "do not approve production 3f2a9c1 yet" approves nothing, and
 * neither does a longer message that carries the line somewhere inside it (a pasted block).
 * Outside a git repository there is no commit to name: the message is the phrase and the word
 * "now", and it only counts for 10 minutes.
 */
export function typedApproval({ transcriptPath, phrase, head, maxAgeMinutes, now = Date.now() }) {
  const words = escapeRegExp(phrase.trim()).replace(/\s+/g, "\\s+");
  const pattern = new RegExp(`^\\s*${words}\\s+(${head ? "[0-9a-f]{7,40}" : "now"})\\s*[.!]?\\s*$`, "i");
  const maxAge = (head ? maxAgeMinutes : Math.min(maxAgeMinutes, 10)) * 60000;
  for (const message of typedMessages(transcriptPath, now - maxAge - 60000)) {
    const match = message.text.match(pattern);
    if (!match) continue;
    if (head && !head.startsWith(match[1].toLowerCase())) continue;
    // No time, too old, or dated in the future (a clock or a forged row): not counted.
    if (message.at === null || now - message.at > maxAge || message.at - now > 60000) continue;
    return { via: "chat", at: new Date(message.at).toISOString() };
  }
  return null;
}

export function approvalFor({ cwd, head, transcriptPath, config }) {
  const record = head ? readRecord(cwd, "approval", head) : null;
  if (record) return { via: record.via === "chat" ? "chat-record" : "terminal", at: record.at };
  return typedApproval({
    transcriptPath,
    phrase: config.approval.phrase,
    head,
    maxAgeMinutes: config.approval.maxAgeMinutes,
  });
}
