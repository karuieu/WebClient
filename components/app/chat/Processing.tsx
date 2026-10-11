"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertCircle, ChevronDown } from "@/components/kit/icons";
import { cx } from "@/lib/cx";

export type ProcessingStep =
  | { kind: "thought"; text: string }
  | { kind: "search"; query: string; sources: { title: string; url: string }[] }
  | { kind: "vision"; name: string; description: string }
  | { kind: "memory"; action: "edit" | "proposal"; file?: string | null; text: string }
  | { kind: "notice"; text: string }
  | { kind: "tool"; connector: string; tool: string; status: "ok" | "error" | "declined" }
  | { kind: "skills"; names: string[] }
  | { kind: "files"; paths: string[] };

const spring = { type: "spring", bounce: 0, duration: 0.4 } as const;

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function summarize(steps: ProcessingStep[]): string {
  const parts: string[] = [];
  if (steps.some((s) => s.kind === "thought")) parts.push("Thought");
  const sources = steps.reduce((n, s) => (s.kind === "search" ? n + s.sources.length : n), 0);
  if (steps.some((s) => s.kind === "search")) parts.push(sources ? `${sources} ${sources === 1 ? "source" : "sources"}` : "Searched");
  const images = steps.filter((s) => s.kind === "vision").length;
  if (images) parts.push(images === 1 ? "1 image" : `${images} images`);
  const memory = steps.filter((s) => s.kind === "memory");
  if (memory.some((m) => m.kind === "memory" && m.action === "edit")) parts.push("Memory updated");
  else if (memory.length) parts.push("Memory suggestion");
  const tools = steps.filter((s) => s.kind === "tool").length;
  if (tools) parts.push(tools === 1 ? "1 tool" : `${tools} tools`);
  const skills = steps.reduce((n, s) => (s.kind === "skills" ? n + s.names.length : n), 0);
  if (skills) parts.push(skills === 1 ? "1 skill" : `${skills} skills`);
  const files = steps.reduce((n, s) => (s.kind === "files" ? n + s.paths.length : n), 0);
  if (files) parts.push(files === 1 ? "1 file" : `${files} files`);
  return parts.join(" · ");
}

function StepLabel({ children, live }: { children: React.ReactNode; live?: boolean }) {
  return (
    <p className="text-label mb-2 flex items-center gap-2 text-muted">
      <span className={cx("size-1.5 rounded-full", live ? "bg-fg" : "bg-line-strong")} />
      {children}
    </p>
  );
}

function Step({ step, live }: { step: ProcessingStep; live: boolean }) {
  switch (step.kind) {
    case "thought":
      return (
        <div>
          <StepLabel live={live}>Thought</StepLabel>
          <p className="whitespace-pre-wrap pl-3.5 text-[14px] leading-relaxed text-muted">{step.text}</p>
        </div>
      );
    case "search":
      return (
        <div>
          <StepLabel live={live}>Searched the web</StepLabel>
          <div className="pl-3.5">
            <p className="font-mono text-[12.5px] text-fg">“{step.query}”</p>
            {step.sources.length > 0 && (
              <ul className="mt-2.5 flex flex-col gap-1">
                {step.sources.map((s) => (
                  <li key={s.url}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-baseline gap-3 rounded-lg py-0.5 text-[13.5px]"
                    >
                      <span className="w-32 shrink-0 truncate font-mono text-[11.5px] text-muted">{domainOf(s.url)}</span>
                      <span className="min-w-0 truncate text-fg/85 underline decoration-transparent underline-offset-[3px] transition-colors duration-150 group-hover:decoration-line-strong">
                        {s.title}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      );
    case "vision":
      return (
        <div>
          <StepLabel live={live}>Looked at {step.name}</StepLabel>
          <p className="pl-3.5 text-[14px] leading-relaxed text-muted">{step.description}</p>
        </div>
      );
    case "memory":
      return (
        <div>
          <StepLabel live={live}>{step.action === "edit" ? "Memory updated" : "Memory suggestion"}</StepLabel>
          <p className="pl-3.5 text-[14px] leading-relaxed text-muted">
            {step.file && <span className="mr-2 font-mono text-[12px] text-fg">{step.file}</span>}
            {step.text}
          </p>
        </div>
      );
    case "tool":
      return (
        <div>
          <StepLabel live={live}>Used {step.connector}</StepLabel>
          <p className="pl-3.5 font-mono text-[12.5px] text-fg">
            {step.tool}
            {step.status !== "ok" && (
              <span className="ml-2 text-muted">{step.status === "declined" ? "· you declined" : "· didn't work"}</span>
            )}
          </p>
        </div>
      );
    case "skills":
      return (
        <div>
          <StepLabel live={live}>{step.names.length === 1 ? "Followed your skill" : `Followed ${step.names.length} of your skills`}</StepLabel>
          <ul className="flex flex-col gap-1 pl-3.5">
            {step.names.map((name) => (
              <li key={name} className="truncate text-[14px] text-fg/85">
                {name}
              </li>
            ))}
          </ul>
        </div>
      );
    case "files":
      return (
        <div>
          <StepLabel live={live}>Read {step.paths.length === 1 ? "1 file" : `${step.paths.length} files`} from the Library</StepLabel>
          <ul className="flex flex-col gap-1 pl-3.5">
            {step.paths.map((path) => (
              <li key={path} className="truncate font-mono text-[12.5px] text-fg" title={path}>
                {path}
              </li>
            ))}
          </ul>
        </div>
      );
    default:
      return null;
  }
}

export function Processing({ steps, status }: { steps: ProcessingStep[]; status?: string | null }) {
  const reduce = useReducedMotion();
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  const notices = steps.filter((s): s is Extract<ProcessingStep, { kind: "notice" }> => s.kind === "notice");
  const visible = steps.filter((s) => s.kind !== "notice");
  const summary = summarize(visible);

  if (!visible.length && !status && !notices.length) return null;

  return (
    <div className="mb-4">
      {(visible.length > 0 || status) && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={id}
          disabled={!visible.length}
          className="group flex h-8 cursor-pointer items-center gap-2 rounded-full pr-2 font-mono text-[12px] text-muted transition-colors duration-150 hover:text-fg disabled:cursor-default"
        >
          {status ? (
            <>
              <span className="inline-block size-3 animate-spin rounded-full border-[1.5px] border-line-strong border-t-fg motion-reduce:animate-none" />
              <span className="text-shimmer" aria-live="polite">
                {status}
              </span>
            </>
          ) : (
            <span>{summary}</span>
          )}
          {visible.length > 0 && (
            <ChevronDown className={cx("size-3.5 transition-transform duration-300 ease-out-soft", open && "rotate-180")} />
          )}
        </button>
      )}

      <AnimatePresence initial={false}>
        {open && visible.length > 0 && (
          <motion.div
            id={id}
            key="steps"
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0, transition: { duration: 0.2 } }}
            transition={reduce ? { duration: 0.15 } : spring}
            className="overflow-hidden"
          >
            <div className="relative mt-2 flex flex-col gap-5 pb-2 pl-[3px]">
              <span aria-hidden="true" className="absolute bottom-3 left-[5.5px] top-2 w-px bg-line" />
              {visible.map((s, i) => (
                <div key={i} className="relative">
                  <Step step={s} live={!!status && i === visible.length - 1} />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {notices.map((n, i) => (
        <div key={i} className="mt-3 flex items-start gap-2.5 rounded-2xl border border-line bg-surface px-4 py-3 text-[13.5px] leading-relaxed text-muted">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-fg" />
          <p>{n.text}</p>
        </div>
      ))}
    </div>
  );
}
