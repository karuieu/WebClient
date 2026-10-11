// Local rules only, to keep the bundle small and avoid a transitive dependency. Uncertain matches stay plain text.

interface Rule {
  language: string;
  test: (code: string, lines: string[]) => boolean;
}

/** First matching rule wins; order strong signals before general ones. */
const RULES: Rule[] = [
  {
    language: "python",
    test: (code) => /^#!.*\bpython[0-9.]*\b/m.test(code),
  },
  {
    language: "bash",
    test: (code) => /^#!.*\b(bash|sh|zsh)\b/m.test(code),
  },

  {
    language: "json",
    test: (code) => {
      const t = code.trim();
      if (!(t.startsWith("{") || t.startsWith("["))) return false;
      try {
        JSON.parse(t);
        return true;
      } catch {
        return false;
      }
    },
  },

  {
    language: "dockerfile",
    test: (code) => /^\s*FROM\s+\S+/m.test(code) && /^\s*(RUN|CMD|COPY|ENTRYPOINT|WORKDIR|ENV)\s/m.test(code),
  },

  {
    language: "html",
    test: (code) =>
      /<!DOCTYPE\s+html/i.test(code) ||
      (/<\/(html|body|div|span|p|a|ul|li|table|head|script)>/i.test(code) && /</.test(code)),
  },

  {
    language: "sql",
    test: (code) =>
      /\b(SELECT\s+[\s\S]+\bFROM\b|INSERT\s+INTO\b|UPDATE\s+\S+\s+SET\b|DELETE\s+FROM\b|CREATE\s+(TABLE|INDEX|VIEW)\b|ALTER\s+TABLE\b)/i.test(
        code
      ),
  },

  {
    language: "go",
    test: (code) => /^\s*package\s+\w+/m.test(code) && /^\s*(func|import|type|var)\s/m.test(code),
  },

  {
    language: "rust",
    test: (code) =>
      /\bfn\s+\w+\s*\(/.test(code) &&
      (/\blet\s+mut\b/.test(code) || /\bimpl\b/.test(code) || /->\s*\w+/.test(code) || /::/.test(code)),
  },

  {
    language: "python",
    test: (code) =>
      /^\s*def\s+\w+\s*\([^)]*\)\s*(->[^:]+)?:/m.test(code) ||
      /^\s*from\s+[\w.]+\s+import\s/m.test(code) ||
      /^\s*(elif|async\s+def)\b/m.test(code) ||
      (/^\s*class\s+\w+.*:/m.test(code) && /\bself\b/.test(code)) ||
      /\bif\s+__name__\s*==/.test(code),
  },

  // Test TypeScript-specific syntax before JavaScript because TypeScript is a superset.
  {
    language: "typescript",
    test: (code) =>
      /^\s*(export\s+)?(interface|type)\s+\w+\s*[={]/m.test(code) ||
      /:\s*(string|number|boolean|void|unknown|any)\b/.test(code) ||
      /\bas\s+(const|string|number)\b/.test(code) ||
      /^\s*enum\s+\w+/m.test(code),
  },

  {
    language: "javascript",
    test: (code) =>
      /\b(const|let|var)\s+\w+\s*=/.test(code) &&
      (/=>/.test(code) ||
        /\bfunction\s*\w*\s*\(/.test(code) ||
        /\bconsole\.\w+\(/.test(code) ||
        /\b(require|module\.exports)\b/.test(code) ||
        /^\s*(import|export)\s/m.test(code)),
  },

  {
    language: "css",
    test: (code) =>
      /(^|\})\s*[.#]?[\w-]+[^{}]*\{[^{}]*[\w-]+\s*:\s*[^{}]+;/m.test(code) &&
      !/\b(function|=>|const|let)\b/.test(code),
  },

  {
    language: "yaml",
    test: (code, lines) => {

      if (/[{};]/.test(code)) return false;
      const keyLines = lines.filter((l) => /^\s*[\w.-]+\s*:(\s|$)/.test(l));
      return keyLines.length >= 2 && lines.some((l) => /^\s+\S/.test(l) || /^\s*-\s+\S/.test(l));
    },
  },

  // Test shell commands last because their names often occur in other languages.
  {
    language: "bash",
    test: (code, lines) =>
      lines.some((l) => /^\s*\$\s+\S/.test(l)) ||
      /^\s*(sudo|apt(-get)?|yum|brew|npm|npx|pnpm|yarn|git|docker|kubectl|curl|wget|chmod|chown|mkdir|systemctl|ssh|scp|tar|grep|sed|awk)\s+\S/m.test(
        code
      ) ||
      /^\s*export\s+\w+=/m.test(code) ||
      /^\s*(if\s+\[|fi$|done$|esac$)/m.test(code),
  },
];

export function detectLanguage(code: string): string | null {
  const trimmed = code.trim();
  if (trimmed.length < 2) return null;

  const lines = trimmed.split("\n");

  for (const rule of RULES) {
    if (rule.test(trimmed, lines)) return rule.language;
  }
  return null;
}
