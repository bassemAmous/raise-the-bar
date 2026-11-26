// Reads a command line (Bash or PowerShell) just far enough to know which programs run, in
// which folder, with which words. It is a reader, not a shell. When it cannot be sure where a
// command runs, it says so (folder: null), and the caller refuses instead of guessing.
import os from "node:os";
import path from "node:path";
import { repoRoot, slash } from "./core.mjs";

// In Bash a backslash escapes these. Before anything else it stays a backslash, so C:\Users\me survives.
const ESCAPABLE = new Set([" ", "\t", '"', "'", "\\", "$", "`", ";", "&", "|", "(", ")", "<", ">", "*", "#"]);
const MAX_DEPTH = 6;

const newSegment = () => ({ words: [], redirects: [], nested: [], heredocs: [], pipe: false });

/**
 * Reads `text` from `start` up to the end, or up to the `)` that closes a `(` or `$(`.
 * Returns { items, end }. An item is a simple command
 *   { words, redirects: [{ op, target }], nested: [items of each $(...) inside it], heredocs, pipe }
 * or a group { group: items } for a parenthesised part.
 * Quotes are respected, so words inside a message are never taken for a command, and heredoc
 * bodies are kept as data on the command that reads them.
 */
function parse(text, start, closer, depth, ps) {
  const size = text.length;
  const items = [];
  const pending = []; // heredocs waiting for their body
  let segment = newSegment();
  let word = null; // null: no word in progress
  let redirect = null; // a redirect sign waiting for its file name
  let i = start;

  const add = (piece) => {
    word = (word ?? "") + piece;
  };
  const endWord = () => {
    if (word === null) return;
    if (redirect) segment.redirects.push({ op: redirect, target: word });
    else segment.words.push(word);
    redirect = null;
    word = null;
  };
  const endSegment = (pipe = false) => {
    endWord();
    redirect = null;
    if (segment.words.length || segment.redirects.length || segment.nested.length) {
      segment.pipe = pipe;
      items.push(segment);
    }
    segment = newSegment();
  };
  // text[from] is the first character after "$(" . Returns the index after the closing ")".
  const substitution = (from) => {
    const inner = parse(text, from, ")", depth + 1, ps);
    if (depth < MAX_DEPTH) segment.nested.push(inner.items);
    return inner.end;
  };

  while (i < size) {
    const ch = text[i];

    if (ps && ch === "@" && (text[i + 1] === "'" || text[i + 1] === '"') && /^\r?\n/.test(text.slice(i + 2, i + 4))) {
      // A PowerShell here-string: everything up to the closing mark on its own line is one word.
      const mark = `\n${text[i + 1]}@`;
      const bodyStart = text.indexOf("\n", i) + 1;
      const close = text.indexOf(mark, bodyStart - 1);
      add(text.slice(bodyStart, close === -1 ? size : close));
      i = close === -1 ? size : close + mark.length;
      continue;
    }

    if (ch === "'") {
      const end = text.indexOf("'", i + 1);
      const stop = end === -1 ? size : end;
      add(text.slice(i + 1, stop));
      i = stop + 1;
      continue;
    }

    if (ch === '"') {
      let j = i + 1;
      let inside = "";
      while (j < size && text[j] !== '"') {
        const c = text[j];
        if (ps && c === "`" && j + 1 < size) {
          inside += text[j + 1];
          j += 2;
        } else if (!ps && c === "\\" && j + 1 < size && '"\\$`'.includes(text[j + 1])) {
          inside += text[j + 1];
          j += 2;
        } else if (c === "$" && text[j + 1] === "(") {
          // Double quotes do not stop a command substitution from running.
          const end = substitution(j + 2);
          inside += text.slice(j, end);
          j = end;
        } else if (!ps && c === "`") {
          const close = text.indexOf("`", j + 1);
          if (close === -1) {
            inside += c;
            j++;
          } else {
            if (depth < MAX_DEPTH) segment.nested.push(parse(text.slice(j + 1, close), 0, null, depth + 1, ps).items);
            inside += text.slice(j, close + 1);
            j = close + 1;
          }
        } else {
          inside += c;
          j++;
        }
      }
      add(inside);
      i = j + 1;
      continue;
    }

    if (ch === "`" && ps) {
      // PowerShell's escape character. Before a line break it joins the two lines.
      if (text[i + 1] === "\r" && text[i + 2] === "\n") i += 3;
      else if (text[i + 1] === "\n") i += 2;
      else {
        if (i + 1 < size) add(text[i + 1]);
        i += 2;
      }
      continue;
    }

    if (ch === "\\" && !ps) {
      if (i + 1 < size && ESCAPABLE.has(text[i + 1])) {
        add(text[i + 1]);
        i += 2;
      } else {
        add(ch);
        i++;
      }
      continue;
    }

    if (ch === "`") {
      const close = text.indexOf("`", i + 1);
      if (close === -1) {
        add(ch);
        i++;
      } else {
        if (depth < MAX_DEPTH) segment.nested.push(parse(text.slice(i + 1, close), 0, null, depth + 1, ps).items);
        add(text.slice(i, close + 1));
        i = close + 1;
      }
      continue;
    }

    if (ch === "$" && text[i + 1] === "(") {
      const end = substitution(i + 2);
      add(text.slice(i, end));
      i = end;
      continue;
    }

    if (ch === "#" && word === null && !redirect) {
      // A comment runs to the end of the line.
      const eol = text.indexOf("\n", i);
      i = eol === -1 ? size : eol;
      continue;
    }

    if (ch === " " || ch === "\t") {
      endWord();
      i++;
      continue;
    }

    if (ch === "\n" || ch === "\r") {
      endSegment();
      i++;
      if (ch === "\n") {
        // Heredoc bodies are data. Each one is read up to its closing word and kept as text.
        for (const doc of pending.splice(0)) {
          let body = "";
          while (i < size) {
            const eol = text.indexOf("\n", i);
            const line = text.slice(i, eol === -1 ? size : eol);
            i = eol === -1 ? size : eol + 1;
            if (line.trim() === doc.closing) break;
            body += `${line}\n`;
          }
          doc.segment.heredocs.push(body);
        }
      }
      continue;
    }

    if (ch === ";") {
      endSegment();
      i++;
      continue;
    }

    if (ch === "(") {
      endSegment();
      const inner = parse(text, i + 1, ")", depth + 1, ps);
      if (depth < MAX_DEPTH) items.push({ group: inner.items });
      i = inner.end;
      continue;
    }

    if (ch === ")") {
      endSegment();
      if (closer === ")") return { items, end: i + 1 };
      i++;
      continue;
    }

    if (ch === "|") {
      if (text[i + 1] === "|") {
        endSegment();
        i += 2;
      } else {
        endSegment(true);
        i += text[i + 1] === "&" ? 2 : 1;
      }
      continue;
    }

    if (ch === "&") {
      if (text[i + 1] === ">") {
        endWord();
        i += 2;
        if (text[i] === ">") i++;
        redirect = "&>";
        continue;
      }
      endSegment();
      i += text[i + 1] === "&" ? 2 : 1;
      continue;
    }

    if (ch === ">" || ch === "<") {
      // A number glued in front (2>file) names the stream. It is not a word of the command.
      if (word !== null && /^\d+$/.test(word)) word = null;
      else endWord();
      let op = ch;
      i++;
      while (i < size && (text[i] === ch || text[i] === "&" || text[i] === "|")) op += text[i++];
      if (op === "<<" && !ps) {
        if (text[i] === "-") i++;
        while (text[i] === " " || text[i] === "\t") i++;
        if (text[i] === "\\") i++;
        let closing = "";
        if (text[i] === "'" || text[i] === '"') {
          const end = text.indexOf(text[i], i + 1);
          closing = text.slice(i + 1, end === -1 ? size : end);
          i = end === -1 ? size : end + 1;
        } else {
          while (i < size && /[\w.-]/.test(text[i])) closing += text[i++];
        }
        if (closing) pending.push({ closing, segment });
        continue;
      }
      redirect = op;
      continue;
    }

    add(ch);
    i++;
  }
  endSegment();
  return { items, end: size };
}

/** The bare name of a program: "C:\Program Files\Git\bin\git.exe" is "git". */
export const programOf = (word) =>
  path.posix
    .basename(slash(word))
    .toLowerCase()
    .replace(/\.(?:exe|cmd|bat|ps1)$/, "");

const HOME = () => slash(os.homedir());

/** Where a `cd <target>` leads from `current`. null when it cannot be known for sure. */
export function resolveFolder(current, target) {
  if (/^\$\(\s*git\s+rev-parse\s+--show-toplevel\s*\)$/.test(target)) return current ? repoRoot(current) : null;
  let wanted = slash(target)
    .replace(/^~(?=\/|$)/, HOME())
    .replace(/^\$\{?HOME\}?(?=\/|$)/, HOME())
    .replace(/^\$env:USERPROFILE(?=\/|$)/i, HOME());
  if (wanted === "" || wanted === "-" || /[$`%*?]/.test(wanted)) return null;
  if (process.platform === "win32") {
    // Git Bash writes C:\repo as /c/repo, and its /tmp is the Windows temp folder.
    const drive = wanted.match(/^\/([a-zA-Z])(\/.*)?$/);
    if (drive) wanted = `${drive[1].toUpperCase()}:${drive[2] ?? "/"}`;
    else if (/^\/tmp(\/|$)/.test(wanted)) wanted = slash(os.tmpdir()) + wanted.slice(4);
    else if (wanted.startsWith("/") && !wanted.startsWith("//")) return null;
  }
  if (path.isAbsolute(wanted)) return slash(path.resolve(wanted));
  if (current === null || current === undefined) return null;
  return slash(path.resolve(current, wanted));
}

/** Programs whose arguments are text to print or to search for, never commands to run. */
export const TEXT_PROGRAMS = new Set([
  "echo", "printf", "grep", "egrep", "fgrep", "rg", "ag", "cat", "man", "which", "where", "whereis",
  "type", "ls", "dir", "gh", "findstr", "select-string", "sls", "write-host", "write-output",
]);

const KEYWORDS = new Set(["{", "}", "!", "then", "do", "else", "elif", "if", "while", "until", "fi", "done"]);
const PREFIXES = new Set([
  "sudo", "doas", "command", "builtin", "time", "nohup", "exec", "env", "call", "winpty", "nice", "xargs", "wsl",
  "start", "stdbuf",
]);
const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh", "fish", "script"]);
const POWERSHELLS = new Set(["powershell", "pwsh"]);
const CD = new Set(["cd", "chdir", "set-location", "sl"]);
const PUSHD = new Set(["pushd", "push-location"]);
const POPD = new Set(["popd", "pop-location"]);
const MOVES_GIT = /^(?:GIT_DIR|GIT_WORK_TREE)=/;

function walk(items, state, calls, depth) {
  for (const item of items) {
    // A parenthesised part keeps its `cd` to itself.
    if (item.group) {
      walk(item.group, { ...state, stack: [...state.stack] }, calls, depth);
      continue;
    }
    for (const nested of item.nested) walk(nested, { ...state, stack: [...state.stack] }, calls, depth);

    const words = [...item.words];
    let lost = state.lost; // true: git was pointed somewhere this reader cannot follow
    while (words.length) {
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0])) {
        if (MOVES_GIT.test(words[0])) lost = true;
        words.shift();
      } else if (KEYWORDS.has(words[0])) words.shift();
      else if (PREFIXES.has(programOf(words[0]))) {
        words.shift();
        while (words.length && words[0].startsWith("-")) {
          const flag = words.shift();
          if (/^-[ughpCD]$/.test(flag)) words.shift(); // sudo -u name
        }
      } else break;
    }
    const base = { redirects: item.redirects, heredocs: item.heredocs, pipe: item.pipe };
    if (words.length === 0) {
      if (item.redirects.length) calls.push({ program: "", word0: "", args: [], ...base, folder: state.folder });
      continue;
    }

    const program = programOf(words[0]);
    const args = words.slice(1);

    if (program === "export" || program === "set" || program === "setx") {
      if (args.some((arg) => MOVES_GIT.test(arg) || /^(?:GIT_DIR|GIT_WORK_TREE)$/.test(arg))) state.lost = true;
    }

    if (CD.has(program) || PUSHD.has(program) || POPD.has(program)) {
      if (POPD.has(program)) state.folder = state.stack.length ? state.stack.pop() : null;
      else {
        if (PUSHD.has(program)) state.stack.push(state.folder);
        const target = args.find((arg) => !arg.startsWith("-") && arg.toLowerCase() !== "/d");
        // Without a target the result depends on the shell (home, or no move): not known.
        state.folder = target === undefined ? null : resolveFolder(state.folder, target);
      }
      calls.push({ program: "cd", word0: words[0], args, ...base, folder: state.folder });
      continue;
    }

    if (depth < MAX_DEPTH) {
      let inner = null;
      let innerPs = false;
      if (SHELLS.has(program)) {
        const at = args.findIndex((arg) => /^-[a-zA-Z]*c$/.test(arg));
        if (at !== -1 && args[at + 1] !== undefined) inner = args[at + 1];
      } else if (POWERSHELLS.has(program)) {
        innerPs = true;
        const encoded = args.findIndex((arg) => /^-e(?:c|nc|ncodedcommand)?$/i.test(arg));
        const at = args.findIndex((arg) => /^-c(?:ommand)?$/i.test(arg));
        if (encoded !== -1 && args[encoded + 1]) inner = Buffer.from(args[encoded + 1], "base64").toString("utf16le");
        else if (at !== -1) inner = args.slice(at + 1).join(" ");
        else if (!args.some((arg) => /^-f(?:ile)?$/i.test(arg))) inner = args.filter((arg) => !arg.startsWith("-")).join(" ");
      } else if (program === "cmd") {
        const at = args.findIndex((arg) => /^\/[ck]$/i.test(arg));
        if (at !== -1) inner = args.slice(at + 1).join(" ");
      } else if (program === "eval" || program === "invoke-expression" || program === "iex") inner = args.join(" ");
      if (inner !== null) {
        const text = innerPs ? inner : inner.replace(/\\\r?\n/g, "");
        walk(parse(text, 0, null, depth + 1, innerPs).items, { ...state, lost, stack: [...state.stack] }, calls, depth + 1);
        continue;
      }
    }

    const folder = lost ? null : state.folder;
    calls.push({ program, word0: words[0], args, ...base, folder });

    // git behind a runner this reader does not know (timeout 30 git push, docker exec x git ...).
    if (program !== "git" && !TEXT_PROGRAMS.has(program)) {
      const at = args.findIndex((arg) => programOf(arg) === "git");
      if (at !== -1) calls.push({ program: "git", word0: args[at], args: args.slice(at + 1), ...base, folder });
    }
  }
}

/**
 * Every program a command line runs, in order:
 * [{ program, word0, args, redirects, heredocs, pipe, folder }].
 * `folder` is where it runs, following cd, or null when that cannot be known. `cd` itself is
 * listed with program "cd". Commands handed to another shell (bash -c "...",
 * powershell -Command "...") and command substitutions are read too.
 * options.shell: "powershell" reads the line with PowerShell's quoting rules.
 */
export function callsIn(command, cwd, options = {}) {
  const ps = options.shell === "powershell";
  const raw = String(command ?? "");
  const text = ps ? raw : raw.replace(/\\\r?\n/g, "");
  const calls = [];
  walk(parse(text, 0, null, 0, ps).items, { folder: cwd ? slash(cwd) : null, stack: [], lost: false }, calls, 0);
  return calls;
}

/** A call to git, past its global options: { folder, verb, args, globals, call } or null. */
export function gitCall(call) {
  if (call.program !== "git") return null;
  let folder = call.folder;
  const globals = [];
  const args = call.args;
  let i = 0;
  for (; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-C") folder = args[++i] === undefined || folder === null ? null : resolveFolder(folder, args[i]);
    else if (arg === "-c") globals.push(args[++i] ?? "");
    else if (arg === "--namespace" || arg === "--exec-path" || arg === "--super-prefix") i++;
    else if (arg === "--git-dir" || arg === "--work-tree") {
      folder = null;
      i++;
    } else if (arg.startsWith("--git-dir=") || arg.startsWith("--work-tree=")) folder = null;
    else if (!arg.startsWith("-")) break;
  }
  if (i >= args.length) return null;
  return { folder, verb: args[i].toLowerCase(), args: args.slice(i + 1), globals, call };
}

const COMMIT_SHORT_WITH_VALUE = new Set(["m", "F", "C", "c", "t"]);
const COMMIT_LONG_WITH_VALUE = new Set([
  "--message", "--file", "--reuse-message", "--reedit-message", "--template", "--author", "--date", "--cleanup",
  "--fixup", "--squash", "--pathspec-from-file", "--trailer",
]);

/** What a `git commit` asks for. The text of the message is never read as a flag. */
export function readCommit(args) {
  const commit = { all: false, noVerify: false, dryRun: false, paths: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") {
      commit.paths.push(...args.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      if (arg === "--all") commit.all = true;
      else if (arg === "--no-verify") commit.noVerify = true;
      else if (arg === "--dry-run") commit.dryRun = true;
      else if (COMMIT_LONG_WITH_VALUE.has(arg)) i++;
      continue;
    }
    if (arg.startsWith("-") && arg.length > 1) {
      for (let k = 1; k < arg.length; k++) {
        const flag = arg[k];
        if (COMMIT_SHORT_WITH_VALUE.has(flag)) {
          if (k === arg.length - 1) i++;
          break;
        }
        if (flag === "a") commit.all = true;
        else if (flag === "n") commit.noVerify = true;
      }
      continue;
    }
    commit.paths.push(arg);
  }
  return commit;
}

const NOWHERE = new Set(["/dev/null", "nul", "$null", "/dev/stdout", "/dev/stderr"]);

/** True when a redirect writes to a file (not when it reads one or joins two streams). */
export const writesTo = (redirect) =>
  redirect.op.includes(">") && !/^&?\d*$/.test(redirect.target) && redirect.target !== "-" && !NOWHERE.has(redirect.target.toLowerCase());
