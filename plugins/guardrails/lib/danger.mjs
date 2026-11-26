// Commands that destroy work or data in one line. Each rule is narrow on purpose: it names one
// catastrophe, so normal work is never refused.
const RM = /\brm\s+(?:-[a-zA-Z]*\s+)*-[a-zA-Z]*(?:r[a-zA-Z]*f|f[a-zA-Z]*r)[a-zA-Z]*\s+(?:-[a-zA-Z-]+\s+)*(["']?)(\/|~|\$HOME|\/\*|~\/\*|\.git|\*)\1(?:\s|$|;|&|\|)/;

export const DANGER_RULES = [
  {
    id: "delete-everything",
    test: (command) => RM.test(command),
    why: "This deletes the whole disk, your home folder, the current folder or the git history.",
  },
  {
    id: "skip-hooks",
    // Quoted text is taken out first: a commit message may talk about the flag.
    test: (command) =>
      /\bgit\b[^;&|\n]*\b(?:commit|push|merge)\b[^;&|\n]*\s--no-verify\b/.test(
        command.replace(/"[^"]*"|'[^']*'/g, '""'),
      ),
    why: "--no-verify skips the checks that protect this repository.",
  },
  {
    id: "drop-database",
    test: (command) =>
      /\bdrop\s+(?:database|schema)\b/i.test(command) || /\bdropDatabase\s*\(/.test(command),
    why: "This drops a whole database.",
  },
  {
    id: "delete-all-rows",
    test: (command) =>
      /\bdelete\s+from\s+[\w."`\[\]]+\s*(?:;|["']|$)/i.test(command) ||
      /\btruncate\s+(?:table\s+)?[\w."`\[\]]+/i.test(command) ||
      /\b(?:deleteMany|updateMany|remove)\s*\(\s*\{\s*\}\s*[,)]/.test(command),
    why: "This deletes or rewrites every row, with no filter.",
  },
  {
    id: "wipe-history",
    test: (command) =>
      /\bgit\b[^;&|\n]*\bfilter-(?:branch|repo)\b/.test(command) ||
      /\bgit\b[^;&|\n]*\breflog\s+expire\b[^;&|\n]*--expire=now/.test(command),
    why: "This rewrites or erases git history.",
  },
];

export function dangerIn(command) {
  return DANGER_RULES.find((rule) => rule.test(command)) ?? null;
}
