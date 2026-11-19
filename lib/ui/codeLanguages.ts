const LANGUAGE_NAMES: Record<string, string> = {
  js: "JavaScript",
  javascript: "JavaScript",
  ts: "TypeScript",
  typescript: "TypeScript",
  tsx: "TSX",
  jsx: "JSX",
  py: "Python",
  python: "Python",
  go: "Go",
  rs: "Rust",
  rust: "Rust",
  java: "Java",
  cpp: "C++",
  "c++": "C++",
  c: "C",
  cs: "C#",
  "c#": "C#",
  csharp: "C#",
  sh: "Shell",
  bash: "Shell",
  shell: "Shell",
  json: "JSON",
  html: "HTML",
  css: "CSS",
  sql: "SQL",
  yaml: "YAML",
  yml: "YAML",
  md: "Markdown",
};

export function knownCodeLanguage(language: string): string | undefined {
  const name = language.toLowerCase();
  return Object.hasOwn(LANGUAGE_NAMES, name) ? LANGUAGE_NAMES[name] : undefined;
}

const LANGUAGE_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["Python", /^\s*(?:(?:async\s+)?def\s+\w+\([^)]*\).*:|from\s+[\w.]+\s+import\s+\w|print\()/m],
  ["Go", /^\s*(?:package\s+main\b|func\s+\w+\s*\()/m],
  ["Rust", /^\s*(?:(?:pub\s+)?fn\s+\w+\s*\(|use\s+\w+::)/m],
  ["C++", /^\s*#include\s*<(?:iostream|vector|string|memory)>/m],
  ["C", /^\s*#include\s*<\w+\.h>/m],
  ["Java", /^\s*public\s+(?:final\s+)?class\s+\w+/m],
  ["HTML", /<!doctype\s+html\b|<\/?(?:html|head|body|div|span|article|button|script|section)(?:\s|>)/i],
  ["SQL", /^\s*(?:select\b[\s\S]*?\bfrom\b|insert\s+into\b|create\s+table\b)/i],
  ["Shell", /^(?:#![^\n]*(?:\/|\s)(?:bash|sh|zsh)\b|\s*(?:echo\s+["'$]|export\s+\w+=))/m],
  ["TypeScript", /^\s*(?:(?:export\s+)?(?:interface\s+\w+\s*[{<]|type\s+\w+\s*=)|(?:const|let|var)\s+\w+\s*:\s*\w)/m],
  ["JavaScript", /^\s*(?:(?:const|let|var)\s+[\w$]+\s*=|(?:async\s+)?function\s+\w+\s*\(|console\.\w+\s*\()/m],
  ["CSS", /(?:^|\n)\s*(?:\.[\w-]+|#[\w-]+|:root|body)\s*\{\s*[\w-]+\s*:/],
];

export function detectCodeLanguage(code: string): string | undefined {
  const source = code.trim();
  if (source.startsWith("{") || source.startsWith("[")) {
    try {
      JSON.parse(source);
      return "JSON";
    } catch {
      // Incomplete JSON and code literals can both begin with a brace.
    }
  }
  return LANGUAGE_PATTERNS.find(([, pattern]) => pattern.test(source))?.[0];
}
