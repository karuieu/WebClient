"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, Lock } from "@/components/kit/icons";
import { Sheet } from "@/components/kit/Sheet";
import { useMediaQuery } from "@/components/kit/useMounted";
import { Segmented } from "@/components/kit/Segmented";
import { cx } from "@/lib/cx";

export type ModelOption = {
  id: string;
  name: string;
  description?: string;
  tier?: "light" | "heavy" | "more";
  more?: boolean;
  pro?: boolean;
  efforts?: { value: string; label: string }[];
};

const spring = { type: "spring", bounce: 0, duration: 0.32 } as const;

function Badge({ children, solid }: { children: React.ReactNode; solid?: boolean }) {
  return (
    <span
      className={cx(
        "rounded-full px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.06em]",
        solid ? "bg-inverse text-on-inverse" : "border border-line-strong text-muted",
      )}
    >
      {children}
    </span>
  );
}

export function ModelPicker({
  options,
  value,
  onChange,
  effort,
  onEffortChange,
  moreLocked,
  onUpgrade,
  fixed,
}: {
  options: ModelOption[];
  value: string;
  onChange: (id: string) => void;
  effort?: string | null;
  onEffortChange?: (effort: string) => void;
  moreLocked?: boolean;
  onUpgrade?: () => void;
  fixed?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [hover, setHover] = React.useState<string | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const sheetRef = React.useRef<HTMLDivElement>(null);
  const mobile = useMediaQuery("(max-width: 639px)");
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();
  const panelId = React.useId();

  const current = options.find((o) => o.id === value) ?? options[0];
  const main = options.filter((o) => !o.more);
  const more = options.filter((o) => o.more);
  const [showMore, setShowMore] = React.useState(!!current?.more);
  const efforts = current?.efforts ?? [];
  const effortLabel = efforts.find((e) => e.value === effort)?.label;

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t) && !sheetRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const row = (o: ModelOption, locked = false) => {
    const selected = o.id === current?.id;
    const lit = !mobile && hover ? hover === o.id : selected;
    return (
      <li key={o.id} role="presentation">
        <button
          type="button"
          role="option"
          aria-selected={selected}
          aria-disabled={locked || undefined}
          onPointerEnter={() => setHover(o.id)}
          onFocus={() => setHover(o.id)}
          onClick={() => {
            if (locked) return;
            onChange(o.id);
            if (!o.efforts?.length) setOpen(false);
          }}
          className={cx(
            "relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left focus-visible:outline-offset-0 max-sm:py-3",
            locked ? "cursor-default" : "cursor-pointer",
          )}
        >
          {lit && !locked && (
            <motion.span layoutId="model-picker-highlight" transition={spring} className="absolute inset-0 rounded-xl bg-surface" />
          )}
          <span className={cx("relative min-w-0 flex-1", locked && "opacity-50")}>
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-medium tracking-[-0.01em]">{o.name}</span>
              {o.tier && o.tier !== "more" && <Badge>{o.tier}</Badge>}
              {o.pro && locked && <Badge solid>Pro</Badge>}
            </span>
            {o.description && <span className="mt-0.5 block truncate text-[12.5px] text-muted">{o.description}</span>}
          </span>
          {locked ? (
            <Lock className="relative size-3.5 text-muted" />
          ) : (
            <Check className={cx("relative transition-opacity duration-150", selected ? "opacity-100" : "opacity-0")} />
          )}
        </button>
      </li>
    );
  };

  const fixedHead = (
    <div className="px-3 pb-3 pt-4">
      {!mobile && <p className="text-label mb-4 px-0.5 text-muted">Model</p>}
      <div className="flex items-center gap-2 px-0.5">
        <span className="truncate text-sm font-medium tracking-[-0.01em]">{current?.name}</span>
        {current?.tier && current.tier !== "more" && <Badge>{current.tier}</Badge>}
      </div>
      <p className="mt-1 px-0.5 text-[12.5px] leading-snug text-muted">Each chat keeps its model. Start a new chat to switch.</p>
    </div>
  );

  const body = (
    <>
      {fixed ? (
        fixedHead
      ) : (
        <div className="p-1.5" onPointerLeave={() => setHover(null)}>
          {!mobile && <p className="text-label px-3 pb-2 pt-2.5 text-muted">Model</p>}
          <ul role="listbox" aria-label="Model" className="flex flex-col">
            {main.map((o) => row(o, o.pro && moreLocked))}
          </ul>

          {more.length > 0 && (
            <>
              <button
                type="button"
                aria-expanded={showMore}
                onPointerEnter={() => setHover("__more")}
                onFocus={() => setHover("__more")}
                onClick={() => setShowMore((s) => !s)}
                className="relative mt-1 flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-muted transition-colors duration-150 hover:text-fg focus-visible:outline-offset-0"
              >
                {!mobile && hover === "__more" && (
                  <motion.span layoutId="model-picker-highlight" transition={spring} className="absolute inset-0 rounded-xl bg-surface" />
                )}
                <span className="relative flex-1 tracking-[-0.01em]">More models</span>
                <span className="relative">
                  <Badge solid>Pro</Badge>
                </span>
                <ChevronDown
                  className={cx("relative size-3.5 transition-transform duration-300 ease-out-soft", showMore && "rotate-180")}
                />
              </button>

              <AnimatePresence initial={false}>
                {showMore && (
                  <motion.div
                    key="more"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0, transition: { duration: 0.18 } }}
                    transition={{ type: "spring", bounce: 0, duration: 0.38 }}
                    className="overflow-hidden"
                  >
                    <ul role="listbox" aria-label="More models" className="flex flex-col">
                      {more.map((o) => row(o, moreLocked))}
                    </ul>
                    {moreLocked && (
                      <div className="mx-1.5 mb-1 mt-1.5 flex items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2.5">
                        <p className="text-[12.5px] leading-snug text-muted">Included with Pro.</p>
                        {onUpgrade && (
                          <button
                            type="button"
                            onClick={onUpgrade}
                            className="h-7 shrink-0 cursor-pointer rounded-full bg-inverse px-3 text-xs font-medium text-on-inverse transition-[opacity,transform] duration-150 hover:opacity-85 active:scale-[0.97]"
                          >
                            Upgrade
                          </button>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      )}

      <AnimatePresence initial={false}>
        {efforts.length > 0 && onEffortChange && (
          <motion.div
            key="effort"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.35 }}
            className="overflow-hidden"
          >
            <div className="border-t border-line p-3">
              <p className="text-label mb-2.5 px-0.5 text-muted">Thinking</p>
              <Segmented
                id="model-picker-effort"
                label="Thinking"
                size="sm"
                options={efforts}
                value={effort ?? efforts[0].value}
                onChange={onEffortChange}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  const label = (
    <>
      <span className="text-fg">{current?.name}</span>
      {current?.tier && current.tier !== "more" && (
        <span className="@max-[26rem]:hidden">· {current.tier === "light" ? "Light" : "Heavy"}</span>
      )}
      {effortLabel && <span className="@max-[26rem]:hidden">· {effortLabel}</span>}
    </>
  );

  if (!options.length) {
    return (
      <span className="flex h-9 select-none items-center gap-1.5 px-3 font-mono text-[12px] tracking-[-0.01em] text-muted">
        <span className="text-fg">DeepSeek V4.1 Flash</span>
        <span className="@max-[26rem]:hidden">· Light</span>
      </span>
    );
  }

  if (fixed && !(efforts.length > 0 && onEffortChange)) {
    return <span className="flex h-9 items-center gap-1.5 px-3 font-mono text-[12px] tracking-[-0.01em] text-muted">{label}</span>;
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (!open) {
            setShowMore(!!current?.more);
            setHover(null);
          }
          setOpen((o) => !o);
        }}
        className={cx(
          "flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 font-mono text-[12px] tracking-[-0.01em] transition-[background-color,color,transform] duration-150 active:scale-[0.97]",
          open ? "bg-surface text-fg" : "text-muted hover:bg-surface hover:text-fg",
        )}
      >
        {label}
        <ChevronDown className={cx("size-3.5 transition-transform duration-300 ease-out-soft", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && !mobile && (
          <motion.div
            id={panelId}
            role="dialog"
            aria-label="Model"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.98, transition: { duration: 0.14 } }}
            transition={spring}
            className="absolute bottom-full right-0 z-50 mb-2 w-[min(340px,calc(100vw-2rem))] origin-bottom-right overflow-hidden rounded-2xl border border-line bg-elevated shadow-soft"
          >
            {body}
          </motion.div>
        )}
      </AnimatePresence>

      <Sheet open={open && mobile} onClose={() => setOpen(false)} title="Model" id={panelId} panelRef={sheetRef}>
        {body}
      </Sheet>
    </div>
  );
}
