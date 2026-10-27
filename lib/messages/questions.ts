export interface Question {
  question: string;
  options: string[];
  multiple?: boolean;
}

const QUESTION_LIMITS = { questions: 4, options: 6, questionLength: 200, optionLength: 80 } as const;

const QUESTIONS_BLOCK = /<questions>([\s\S]*?)<\/questions>/g;
// The unfinished start of a block at the very end of a streaming answer; a mere mention of the tag stays visible.
const OPEN_BLOCK = /<questions(?:>\s*(?:[[{][\s\S]*)?)?$/;

// By code points, so an emoji is never cut in half.
const clip = (text: string, max: number) => Array.from(text.trim()).slice(0, max).join("");

function toQuestion(raw: unknown): Question | null {
  if (!raw || typeof raw !== "object") return null;
  const { question, options, multiple } = raw as Record<string, unknown>;
  if (typeof question !== "string" || !Array.isArray(options)) return null;
  const labels = options.filter((o): o is string => typeof o === "string").map((o) => clip(o, QUESTION_LIMITS.optionLength));
  const unique = [...new Set(labels.filter(Boolean))].slice(0, QUESTION_LIMITS.options);
  const text = clip(question, QUESTION_LIMITS.questionLength);
  if (!text || unique.length < 2) return null;
  return multiple === true ? { question: text, options: unique, multiple } : { question: text, options: unique };
}

function parseBlock(json: string): Question[] {
  try {
    const parsed: unknown = JSON.parse(json);
    const wrapped = parsed && typeof parsed === "object" && "questions" in parsed ? parsed.questions : parsed;
    const list: unknown[] = Array.isArray(wrapped) ? wrapped : [wrapped];
    return list
      .map(toQuestion)
      .filter((q): q is Question => q !== null)
      .slice(0, QUESTION_LIMITS.questions);
  } catch {
    return [];
  }
}

/**
 * Karui's clarifying questions, asked in a block at the end of its answer. Run it on the answer alone, so a block
 * the model only thought about stays hidden. A broken block yields no questions; a block still streaming stays hidden.
 */
export function parseQuestions(answer: string): { questions: Question[]; text: string } {
  let questions: Question[] = [];
  const text = answer
    .replace(QUESTIONS_BLOCK, (_, json: string) => {
      const parsed = parseBlock(json);
      if (parsed.length) questions = parsed;
      return "";
    })
    .replace(OPEN_BLOCK, "");
  return { questions, text: text.trim() };
}
