// Reads a command line (Bash or PowerShell) just far enough to know which programs run, in
// which folder, with which words. It is a reader, not a shell. When it cannot be sure where a
// command runs, it says so (folder: null), and the caller refuses instead of guessing.
import os from "node:os";
import path from "node:path";
import { repoRoot, slash } from "./core.mjs";

// In Bash a backslash escapes these. Before anything else it stays a backslash, so C:\Users\me survives.
const ESCAPABLE = new Set([" ", "\t", '"', "'", "\\", "$", "`", ";", "&", "|", "(", ")", "<", ">", "*", "#"]);
// Commands inside commands ( $(...), bash -c "...", brackets ) are followed this deep. Past
// that the line is marked unreadable, and the caller refuses it instead of guessing.
const MAX_DEPTH = 12;

const newSegment = () => ({ words: [], redirects: [], nested: [], heredocs: [], pipe: false });

/**
 * Reads `text` from `start` up to the end, or up to the `)` that closes a `(` or `$(`.
 * Returns { items, end }. An item is a simple command
 *   { words, redirects: [{ op, target }], nested: [items of each $(...) inside it], heredocs, pipe }
 * or a group { group: items } for a parenthesised part.
 * Quotes are respected, so words inside a message are never taken for a command, and heredoc
 * bodies are kept as data on the command that reads them.
 */
function parse(text, start, closer, depth, ps, notes) {
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
  // Reads a part that is a command line of its own. Too deep: nothing is read, and the note says so.
  const dive = (source, from, close) => {
    if (depth >= MAX_DEPTH) {
      notes.unreadable = true;
      return { items: [], end: source.length };
    }
    return parse(source, from, close, depth + 1, ps, notes);
  };
  // text[from] is the first character after "$(" . Returns the index after the closing ")".
  const substitution = (from) => {
    const inner = dive(text, from, ")");
    segment.nested.push(inner.items);
    return inner.end;
  };
  // text[from] is a backtick that opens a command. Returns the index after the closing one, or -1.
  const backticks = (from) => {
    const close = text.indexOf("`", from + 1);
    if (close === -1) return -1;
    segment.nested.push(dive(text.slice(from + 1, close), 0, null).items);
    return close + 1;
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
          const end = backticks(j);
          inside += end === -1 ? c : text.slice(j, end);
          j = end === -1 ? j + 1 : end;
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
      const end = backticks(i);
      add(end === -1 ? ch : text.slice(i, end));
      i = end === -1 ? i + 1 : end;
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
      const inner = dive(text, i + 1, ")");
      items.push({ group: inner.items });
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

    if (ps && (ch === "{" || ch === "}")) {
      // ${name} is a variable. Any other brace opens or closes a script block, where a new
      // command starts: if ($ok) {git push} runs git, with or without spaces.
      if (ch === "{" && text[i - 1] === "$") {
        const close = text.indexOf("}", i);
        const stop = close === -1 ? size : close + 1;
        add(text.slice(i, stop));
        i = stop;
      } else {
        endSegment();
        i++;
      }
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

/**
 * Bash drops a backslash in front of an ordinary character: g\it runs git, and `git pu\sh`
 * pushes. A word that looks like a Windows path (C:\tools\git.exe, .\run.cmd) is left as it is.
 */
export const unescaped = (word) =>
  word.includes("\\") && !/[:/]/.test(word) && !/^(?:\\\\|\.\\|~\\)/.test(word) ? word.replace(/\\(.)/g, "$1") : word;

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

const KEYWORDS = new Set([
  "{", "}", "!", "then", "do", "else", "elif", "elseif", "if", "while", "until", "fi", "done", "try", "catch", "finally",
]);
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
const PRINTS_ITS_WORDS = new Set(["echo", "printf", "write-output", "write-host"]);
const START_PROCESS_FLAG_WITH_VALUE = /^-(?:verb|windowstyle|credential|redirectstandard(?:input|output|error))$/i;

/** The text a command pipes into the next one, when that text is written on the line itself. */
function textPipedBy(item) {
  if (!item) return [];
  const program = programOf(item.words[0] ?? "");
  // printf and `echo -e` turn \n into a line break: read it that way, so a second line is seen.
  if (PRINTS_ITS_WORDS.has(program)) return [item.words.slice(1).join(" ").replace(/\\[nr]/g, "\n")];
  if (program === "cat") return item.heredocs;
  // PowerShell: a quoted text alone before the pipe is sent down the pipe as it is.
  return item.words.length === 1 && /\s/.test(item.words[0]) ? [item.words[0]] : [];
}

/** PowerShell's Start-Process git -ArgumentList "push","origin","main": the words of what it starts. */
function startProcess(args) {
  const named = [];
  let folder;
  for (let i = 0; i < args.length; i++) {
    if (/^-workingdirectory$/i.test(args[i])) folder = args[++i];
    else if (START_PROCESS_FLAG_WITH_VALUE.test(args[i])) i++;
    else if (!args[i].startsWith("-")) named.push(args[i]);
  }
  if (named.length === 0) return null;
  const rest = named.slice(1).join(" ").split(/[\s,]+/).filter(Boolean);
  return { words: [named[0], ...rest], folder };
}

function walk(items, state, calls, depth, notes) {
  let feeder = null; // the command whose output is piped into the one being read
  for (const item of items) {
    // A parenthesised part keeps its `cd` to itself.
    if (item.group) {
      feeder = null;
      walk(item.group, { ...state, stack: [...state.stack] }, calls, depth, notes);
      continue;
    }
    const fedBy = feeder;
    feeder = item.pipe ? item : null;
    for (const nested of item.nested) walk(nested, { ...state, stack: [...state.stack] }, calls, depth, notes);

    const words = [...item.words];
    let lost = state.lost; // true: git was pointed somewhere this reader cannot follow
    const env = []; // NAME=value words in front of the program
    while (words.length) {
      if (!state.ps) words[0] = unescaped(words[0]);
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0])) {
        if (MOVES_GIT.test(words[0])) lost = true;
        env.push(words.shift());
      } else if (KEYWORDS.has(words[0])) words.shift();
      else if (PREFIXES.has(programOf(words[0]))) {
        words.shift();
        while (words.length && words[0].startsWith("-")) {
          const flag = words.shift();
          if (/^-[ughpCD]$/.test(flag)) words.shift(); // sudo -u name
        }
      } else break;
    }
    const base = { redirects: item.redirects, heredocs: item.heredocs, pipe: item.pipe, env };
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

    if (program === "start-process" || program === "saps") {
      const started = startProcess(args);
      if (started) {
        const folder = started.folder === undefined ? state.folder : resolveFolder(state.folder, started.folder);
        const launched = { ...item, words: started.words, nested: [] };
        walk([launched], { ...state, folder, lost, stack: [...state.stack] }, calls, depth, notes);
        continue;
      }
    }

    // A command handed to another shell is read as the command line it is.
    let inner = null;
    let innerPs = false;
    // With no script file and no -c, a shell runs what it is fed: a heredoc, or text piped into it.
    const fed = () => {
      const texts = [...item.heredocs, ...textPipedBy(fedBy)];
      return texts.length ? texts.join("\n") : null;
    };
    if (SHELLS.has(program)) {
      const at = args.findIndex((arg) => /^-[a-zA-Z]*c$/.test(arg));
      // More options can follow -c (bash -c -x "...", bash -c -- "..."): the command is the first word that is not one.
      let text = at + 1;
      while (at !== -1 && text < args.length && args[text].startsWith("-") && args[text] !== "--") text += /^[-+]o$/.test(args[text]) ? 2 : 1;
      if (args[text] === "--") text++;
      if (at !== -1 && args[text] !== undefined) inner = args[text];
      else if (program !== "script" && args.every((arg) => arg.startsWith("-"))) inner = fed();
    } else if (POWERSHELLS.has(program)) {
      innerPs = true;
      const encoded = args.findIndex((arg) => /^-e(?:c|nc|ncodedcommand)?$/i.test(arg));
      const at = args.findIndex((arg) => /^-c(?:ommand)?$/i.test(arg));
      if (encoded !== -1 && args[encoded + 1]) inner = Buffer.from(args[encoded + 1], "base64").toString("utf16le");
      else if (at !== -1 && args[at + 1] !== "-") inner = args.slice(at + 1).join(" ");
      else if (args.every((arg) => arg.startsWith("-"))) inner = fed();
      else if (!args.some((arg) => /^-f(?:ile)?$/i.test(arg))) inner = args.filter((arg) => !arg.startsWith("-")).join(" ");
    } else if (program === "cmd") {
      innerPs = true; // cmd has no backslash escapes either: C:\* must stay C:\*
      const at = args.findIndex((arg) => /^\/[ck]$/i.test(arg));
      if (at !== -1) inner = args.slice(at + 1).join(" ");
    } else if (program === "eval" || program === "invoke-expression" || program === "iex") inner = args.join(" ");
    if (inner !== null) {
      if (depth >= MAX_DEPTH) notes.unreadable = true;
      else {
        const text = innerPs ? inner : inner.replace(/\\\r?\n/g, "");
        const items = parse(text, 0, null, depth + 1, innerPs, notes).items;
        walk(items, { ...state, lost, stack: [...state.stack], ps: innerPs }, calls, depth + 1, notes);
      }
      continue;
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
 * { calls: [{ program, word0, args, redirects, heredocs, pipe, folder }], unreadable }.
 * `folder` is where it runs, following cd, or null when that cannot be known. `cd` itself is
 * listed with program "cd". Commands handed to another shell (bash -c "...",
 * powershell -Command "...") and command substitutions are read too.
 * `unreadable` is true when the line nests commands deeper than this reader follows.
 * options.shell: "powershell" reads the line with PowerShell's quoting rules.
 */
export function readLine(command, cwd, options = {}) {
  const ps = options.shell === "powershell";
  const raw = String(command ?? "");
  const text = ps ? raw : raw.replace(/\\\r?\n/g, "");
  const calls = [];
  const notes = { unreadable: false };
  const items = parse(text, 0, null, 0, ps, notes).items;
  walk(items, { folder: cwd ? slash(cwd) : null, stack: [], lost: false, ps }, calls, 0, notes);
  return { calls, unreadable: notes.unreadable };
}

/** The calls of a command line. See readLine. */
export const callsIn = (command, cwd, options) => readLine(command, cwd, options).calls;

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
  // A verb never holds a backslash, so `pu\sh` is read the way Bash runs it. `git stage` is `git add`.
  const verb = args[i].toLowerCase().split("\\").join("");
  return { folder, verb: verb === "stage" ? "add" : verb, args: args.slice(i + 1), globals, call };
}

const COMMIT_SHORT_WITH_VALUE = new Set(["m", "F", "C", "c", "t"]);
const COMMIT_LONG_WITH_VALUE = new Set([
  "--message", "--file", "--reuse-message", "--reedit-message", "--template", "--author", "--date", "--cleanup",
  "--fixup", "--squash", "--pathspec-from-file", "--trailer",
]);

/**
 * What a `git commit` asks for. The text of the message is never read as a flag.
 * `messages` holds the message texts written on the line, `messageFiles` the files a message is
 * read from ("-" is the standard input). `wide` is true when the commit takes files in a way
 * the line does not spell out (--patch, --interactive, --pathspec-from-file).
 */
export function readCommit(args) {
  const commit = { all: false, noVerify: false, dryRun: false, wide: false, paths: [], messages: [], messageFiles: [] };
  const keep = (flag, value) => {
    if (value === undefined) return;
    if (flag === "m" || flag === "--message") commit.messages.push(value);
    else if (flag === "F" || flag === "--file") commit.messageFiles.push(value);
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") {
      commit.paths.push(...args.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const equals = arg.indexOf("=");
      const name = equals === -1 ? arg : arg.slice(0, equals);
      if (name === "--all") commit.all = true;
      else if (name === "--no-verify") commit.noVerify = true;
      else if (name === "--dry-run") commit.dryRun = true;
      else if (name === "--patch" || name === "--interactive" || name === "--pathspec-from-file") commit.wide = true;
      if (COMMIT_LONG_WITH_VALUE.has(name)) keep(name, equals === -1 ? args[++i] : arg.slice(equals + 1));
      continue;
    }
    if (arg.startsWith("-") && arg.length > 1) {
      for (let k = 1; k < arg.length; k++) {
        const flag = arg[k];
        if (COMMIT_SHORT_WITH_VALUE.has(flag)) {
          keep(flag, k === arg.length - 1 ? args[++i] : arg.slice(k + 1));
          break;
        }
        if (flag === "u" || flag === "S") break; // -uno, -S<key>: the rest of the word is a value
        if (flag === "a") commit.all = true;
        else if (flag === "n") commit.noVerify = true;
        else if (flag === "p") commit.wide = true;
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
