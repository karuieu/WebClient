"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cx } from "@/lib/cx";
import { Check } from "./icons";
import { useMounted } from "./useMounted";

export type MenuItem =
  | {
      type?: "item";
      label: string;
      icon?: React.ReactNode;
      onSelect: () => void;
      danger?: boolean;
      hint?: string;
      checked?: boolean;
    }
  | { type: "separator" }
  | { type: "header"; content: React.ReactNode };

type Placement = "bottom-end" | "bottom-start" | "top-start" | "top-end";

const GAP = 6;
const EDGE = 8;

function position(rect: DOMRect, placement: Placement): React.CSSProperties {
  const [side, align] = placement.split("-") as ["top" | "bottom", "start" | "end"];
  const style: React.CSSProperties = {};
  if (side === "bottom") style.top = rect.bottom + GAP;
  else style.bottom = window.innerHeight - rect.top + GAP;
  if (align === "start") style.left = Math.max(EDGE, rect.left);
  else style.right = Math.max(EDGE, window.innerWidth - rect.right);
  style.transformOrigin = `${side === "bottom" ? "top" : "bottom"} ${align === "start" ? "left" : "right"}`;
  return style;
}

export function Menu({
  label,
  items,
  placement = "bottom-end",
  className,
  panelClassName,
  onOpenChange,
  children,
}: {
  label: string;
  items: MenuItem[];
  placement?: Placement;
  className?: string;
  panelClassName?: string;
  onOpenChange?: (open: boolean) => void;
  children: (props: { open: boolean; triggerProps: React.ComponentProps<"button"> }) => React.ReactNode;
}) {
  const [open, setOpenState] = React.useState(false);
  const [style, setStyle] = React.useState<React.CSSProperties>({});
  const panelRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();
  const mounted = useMounted();
  const id = React.useId();
  const fromTop = placement.startsWith("top");
  const viaKeyboard = React.useRef(false);

  const setOpen = React.useCallback(
    (v: boolean) => {
      if (v && triggerRef.current) setStyle(position(triggerRef.current.getBoundingClientRect(), placement));
      setOpenState(v);
      onOpenChange?.(v);
    },
    [onOpenChange, placement],
  );

  const focusItem = React.useCallback((dir: 1 | -1 | "first" | "last") => {
    const els = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>("[role^=menuitem]") ?? []);
    if (!els.length) return;
    const i = els.indexOf(document.activeElement as HTMLButtonElement);
    const next = dir === "first" ? 0 : dir === "last" ? els.length - 1 : (i + dir + els.length) % els.length;
    els[next].focus();
  }, []);

  React.useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => (viaKeyboard.current ? focusItem("first") : panelRef.current?.focus()));
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !triggerRef.current?.contains(t)) setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open, setOpen, focusItem]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowDown: () => focusItem(1),
      ArrowUp: () => focusItem(panelRef.current === document.activeElement ? "last" : -1),
      Home: () => focusItem("first"),
      End: () => focusItem("last"),
    };
    if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (keys[e.key]) {
      e.preventDefault();
      keys[e.key]();
    } else if (e.key === "Tab") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <div className={className}>
      {children({
        open,
        triggerProps: {
          ref: triggerRef,
          type: "button",
          "aria-haspopup": "menu",
          "aria-expanded": open,
          "aria-controls": open ? id : undefined,
          onClick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            viaKeyboard.current = e.detail === 0;
            setOpen(!open);
          },
        },
      })}

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={panelRef}
                id={id}
                role="menu"
                aria-label={label}
                tabIndex={-1}
                data-focus="within"
                onKeyDown={onKeyDown}
                style={style}
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: fromTop ? 4 : -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
                transition={{ type: "spring", bounce: 0, duration: 0.28 }}
                className={cx(
                  "fixed z-[90] min-w-[200px] rounded-2xl border border-line bg-elevated p-1.5 font-sans text-fg shadow-soft",
                  panelClassName,
                )}
              >
                {items.map((item, i) => {
                  if (item.type === "separator")
                    return <div key={i} role="separator" className="mx-2 my-1.5 h-px bg-line" />;
                  if (item.type === "header")
                    return (
                      <div key={i} className="px-3 pb-2 pt-1.5">
                        {item.content}
                      </div>
                    );
                  return (
                    <button
                      key={i}
                      type="button"
                      role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
                      aria-checked={item.checked}
                      tabIndex={-1}
                      data-focus="within"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpen(false);
                        item.onSelect();
                      }}
                      className={cx(
                        "flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 text-left text-[13.5px] tracking-[-0.01em] outline-none transition-colors duration-100",
                        item.danger
                          ? "text-danger hover:bg-danger/10 focus:bg-danger/10"
                          : "text-fg hover:bg-surface focus:bg-surface",
                      )}
                    >
                      {item.icon && (
                        <span className={cx("grid place-items-center", !item.danger && "text-muted")}>{item.icon}</span>
                      )}
                      <span className="flex-1">{item.label}</span>
                      {item.hint && <span className="font-mono text-[11px] text-muted">{item.hint}</span>}
                      {item.checked !== undefined && (
                        <Check className={cx("transition-opacity duration-150", item.checked ? "opacity-100" : "opacity-0")} />
                      )}
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
