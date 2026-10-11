"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { Cross, Label } from "@/components/kit/Frame";
import { ArrowUp, Check, ChevronLeft, Pencil, X } from "@/components/kit/icons";
import { cx } from "@/lib/cx";

export type QuestionData = { question: string; options: string[]; multiple?: boolean };

export type QuestionsData = {
  /** The asking message: a new one starts the card from its first question. */
  id: string;
  questions: QuestionData[];
  onAnswer: (text: string) => void;
  onSkip: () => void;
};

const spring = { type: "spring", bounce: 0, duration: 0.35 } as const;
// Keys typed in the moment the card replaces the composer were meant for the composer, not for picking an option.
const KEY_GUARD_MS = 800;

/** The reply sent for the user: the picks alone for one question, a line per question otherwise. */
export function answerText(questions: QuestionData[], picks: string[][]): string {
  if (questions.length === 1) return picks[0].join(", ");
  return questions.map((q, i) => `${q.question} — ${picks[i].join(", ")}`).join("\n");
}

const row =
  "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left text-[14.5px] transition-[background-color,color,transform] duration-150 hover:bg-surface active:scale-[0.99]";

function Marker({ number, picked }: { number?: number; picked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "grid size-6 shrink-0 place-items-center rounded-lg border font-mono text-[11.5px] transition-colors duration-150",
        picked ? "border-inverse bg-inverse text-on-inverse" : "border-line text-muted",
      )}
    >
      {picked ? <Check className="size-3" /> : number}
    </span>
  );
}

/** The user's own answer: a row to open, the typed answer once given, and a field to write or change it. */
function OtherAnswer({ value, onSubmit, onClear }: { value: string; onSubmit: (text: string) => void; onClear: () => void }) {
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState("");

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => (setText(value), setEditing(true))}
        className={cx(row, !value && "text-muted hover:text-fg")}
      >
        {value ? (
          <Marker picked />
        ) : (
          <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center">
            <Pencil className="size-3.5" />
          </span>
        )}
        <span className="min-w-0 flex-1 text-pretty">{value || "Something else…"}</span>
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        setEditing(false);
        onSubmit(text.trim());
      }}
      className="flex min-h-11 items-center gap-3 rounded-xl bg-surface pl-3 pr-1.5"
    >
      <button
        type="button"
        aria-label="Remove your answer"
        onClick={() => {
          setEditing(false);
          if (value) onClear();
        }}
        className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors duration-150 hover:text-fg"
      >
        <X className="size-3.5" />
      </button>
      <input
        autoFocus
        data-focus="within"
        aria-label="Your answer"
        placeholder="Type your answer"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
        onBlur={() => !text.trim() && setEditing(false)}
        className="h-11 min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-subtle"
      />
      <button
        type="submit"
        aria-label="Save answer"
        disabled={!text.trim()}
        className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full bg-inverse text-on-inverse transition-[opacity,transform] duration-150 hover:opacity-85 active:scale-[0.94] disabled:cursor-default disabled:opacity-35"
      >
        <ArrowUp className="size-4" />
      </button>
    </form>
  );
}

function Hairline() {
  return (
    <div aria-hidden="true" className="relative mx-3 my-3.5 h-px bg-line">
      <Cross className="-left-[5px] -top-[5px]" />
      <Cross className="-right-[5px] -top-[5px]" />
    </div>
  );
}

function StepHeader({
  title,
  titleId,
  caption,
  index,
  hint,
}: {
  title: string;
  titleId: string;
  caption: string;
  index?: string;
  hint?: string;
}) {
  return (
    <div className="px-3">
      <div className="flex items-start gap-3">
        <p id={titleId} className="min-w-0 flex-1 text-pretty text-[15px] font-medium leading-snug tracking-[-0.01em]">
          {title}
        </p>
        <Label index={index} className="mt-1 shrink-0 tabular-nums">
          {caption}
        </Label>
      </div>
      {hint && <p className="mt-1 text-[12.5px] text-muted">{hint}</p>}
    </div>
  );
}

function StepFooter({
  onBack,
  onSkip,
  action,
}: {
  onBack?: () => void;
  onSkip: () => void;
  action?: { label: string; disabled?: boolean; autoFocus?: boolean; onClick: () => void };
}) {
  return (
    <div className="mt-1.5 flex items-center gap-1">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 cursor-pointer items-center gap-1 rounded-full pl-2 pr-3 text-[13.5px] text-muted transition-colors duration-150 hover:bg-surface hover:text-fg"
        >
          <ChevronLeft className="size-3.5" />
          Back
        </button>
      )}
      <button
        type="button"
        onClick={onSkip}
        className="ml-auto flex h-9 cursor-pointer items-center gap-2 rounded-full px-3 text-[13.5px] text-muted transition-colors duration-150 hover:bg-surface hover:text-fg"
      >
        Skip
        <kbd className="font-mono text-[11px] text-subtle max-sm:hidden">esc</kbd>
      </button>
      {action && (
        <button
          type="button"
          disabled={action.disabled}
          autoFocus={action.autoFocus}
          onClick={action.onClick}
          className="flex h-9 cursor-pointer items-center rounded-full bg-inverse px-4 text-[13.5px] font-medium text-on-inverse transition-[opacity,transform] duration-150 hover:opacity-85 active:scale-[0.97] disabled:cursor-default disabled:opacity-45"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/**
 * Takes the composer's place while Karui waits for an answer. A single question sends on the first pick;
 * several end on a review of all answers, where any of them can be changed before sending.
 */
export function QuestionCard({ questions, onAnswer, onSkip }: Omit<QuestionsData, "id">) {
  const reduce = useReducedMotion();
  const titleId = React.useId();
  const cardRef = React.useRef<HTMLDivElement>(null);
  const shownAt = React.useRef(0);
  const [step, setStep] = React.useState(0);
  const [picks, setPicks] = React.useState<string[][]>(() => questions.map(() => []));
  const single = questions.length === 1;
  const current = questions[step] as QuestionData | undefined;
  const chosen = picks[step] ?? [];
  const custom = chosen.find((p) => !current?.options.includes(p)) ?? "";

  const withStep = (answer: string[]) => picks.map((p, i) => (i === step ? answer : p));

  // Back to the first unanswered question, or to the review once all have an answer, so a change made from the review returns there.
  const commit = (answer: string[]) => {
    const next = withStep(answer);
    setPicks(next);
    if (single) return onAnswer(answerText(questions, next));
    const open = next.findIndex((p) => !p.length);
    setStep(open === -1 ? questions.length : open);
  };

  const choose = (option: string) => {
    if (!current?.multiple) return commit([option]);
    setPicks(withStep(chosen.includes(option) ? chosen.filter((o) => o !== option) : [...chosen, option]));
  };

  // Typing one of the options counts as picking it, so the answer never lists it twice.
  const answerOther = (text: string) => {
    const option = current?.options.find((o) => o.toLowerCase() === text.toLowerCase());
    if (!current?.multiple) return commit([option ?? text]);
    setPicks(withStep([...chosen.filter((p) => p !== custom && p !== option), option ?? text]));
  };

  const clearOther = () => setPicks(withStep(chosen.filter((p) => p !== custom)));

  React.useEffect(() => {
    shownAt.current = performance.now();
  }, []);

  // The card replaces the focused composer and each step replaces the focused option, so focus would fall to the page.
  React.useEffect(() => {
    const active = document.activeElement;
    if (!active || active === document.body) cardRef.current?.focus({ preventScroll: true });
  }, [step]);

  // Number keys pick unless the user is typing or in a dialog; Escape skips only from the card, so it can't also close a panel.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || target.closest("input, textarea, [contenteditable], [role=dialog], [role=menu]")) return;
      if (e.key === "Escape") {
        if (cardRef.current?.contains(target)) onSkip();
        return;
      }
      const option = current?.options[Number(e.key) - 1];
      if (option === undefined || performance.now() - shownAt.current < KEY_GUARD_MS) return;
      e.preventDefault();
      choose(option);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const onBack = step > 0 ? () => setStep(step - 1) : undefined;

  return (
    <motion.div
      ref={cardRef}
      role="group"
      aria-labelledby={titleId}
      tabIndex={-1}
      // Focus only parks here, so no ring; the radius is inline because kit.css rounds every focused element to 6px.
      data-focus="within"
      style={{ borderRadius: 22 }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="overflow-hidden border border-line-strong bg-elevated px-2 pb-2 pt-3.5 shadow-soft"
    >
      {/* No exit animation: a step that lingered on screen would still take clicks with its old answers. */}
      <motion.div key={step} initial={reduce ? { opacity: 0 } : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={spring}>
        {!current ? (
          <>
            <StepHeader title="Send these answers?" titleId={titleId} caption="Your answers" hint="Tap one to change it." />
            <Hairline />
            <div className="flex flex-col">
              {questions.map((q, i) => (
                <button key={i} type="button" onClick={() => setStep(i)} className={cx(row, "items-start")}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] text-muted">{q.question}</span>
                    <span className="mt-0.5 block text-pretty">{picks[i].join(", ")}</span>
                  </span>
                  <Pencil className="mt-1 size-3.5 shrink-0 text-subtle" />
                </button>
              ))}
            </div>
            <StepFooter
              onBack={onBack}
              onSkip={onSkip}
              action={{ label: "Send answers", autoFocus: true, onClick: () => onAnswer(answerText(questions, picks)) }}
            />
          </>
        ) : (
          <>
            <StepHeader
              title={current.question}
              titleId={titleId}
              caption="Question"
              index={single ? undefined : `${step + 1}/${questions.length}`}
              hint={current.multiple ? "Pick all that apply." : undefined}
            />
            <Hairline />
            <div className="flex flex-col">
              {current.options.map((option, i) => {
                const picked = chosen.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    role={current.multiple ? "checkbox" : undefined}
                    aria-checked={current.multiple ? picked : undefined}
                    onClick={() => choose(option)}
                    className={row}
                  >
                    <Marker number={i + 1} picked={picked} />
                    <span className="min-w-0 flex-1 text-pretty">{option}</span>
                  </button>
                );
              })}
              <OtherAnswer value={custom} onSubmit={answerOther} onClear={clearOther} />
            </div>
            <StepFooter
              onBack={onBack}
              onSkip={onSkip}
              action={
                current.multiple
                  ? { label: single ? "Send" : "Continue", disabled: !chosen.length, onClick: () => commit(chosen) }
                  : undefined
              }
            />
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
