import { cx } from "@/lib/ui/cx";
import { Kbd, type Keys } from "./Shortcut";

// Pure CSS: hover variants only fire on devices that hover, so touch screens never see it.
export function Tooltip({
  label,
  keys,
  align = "start",
  className,
  children,
}: {
  label?: string;
  keys?: Keys;
  align?: "start" | "center" | "end";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={cx("group/tip relative inline-flex", className)}>
      {children}
      {(label || keys) && (
        <span
          aria-hidden="true"
          className={cx(
            "pointer-events-none absolute top-full z-50 mt-2 flex items-center gap-2 whitespace-nowrap rounded-lg border border-line bg-elevated px-2.5 py-1.5 text-[12px] tracking-[-0.01em] text-fg shadow-soft",
            "opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100 group-hover/tip:delay-500 group-active/tip:opacity-0 group-has-[:focus-visible]/tip:opacity-100",
            align === "start" ? "left-0" : align === "end" ? "right-0" : "left-1/2 -translate-x-1/2",
          )}
        >
          {label}
          {keys && <Kbd keys={keys} className={label ? "text-muted" : "text-fg"} />}
        </span>
      )}
    </span>
  );
}
