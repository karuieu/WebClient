import { cx } from "@/lib/cx";
import { MARK_PATH, MARK_VIEWBOX, WORDMARK_PATH, WORDMARK_VIEWBOX } from "./logo-paths";


export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox={MARK_VIEWBOX} aria-hidden="true" className={className ?? "size-6"}>
      <path d={MARK_PATH} fill="currentColor" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox={WORDMARK_VIEWBOX} role="img" aria-label="Karui" className={cx("w-auto text-fg", className ?? "h-[1.125rem]")}>
      <path d={WORDMARK_PATH} fill="currentColor" />
    </svg>
  );
}
