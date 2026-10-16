import { cx } from "@/lib/cx";

export function Cross({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 11 11"
      aria-hidden="true"
      className={cx("pointer-events-none absolute z-10 size-[11px] text-line-strong", className)}
    >
      <path d="M5.5 0v11M0 5.5h11" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

export function Label({ index, children, className }: { index?: string; children: React.ReactNode; className?: string }) {
  return (
    <p className={cx("text-label flex items-center gap-2 text-muted", className)}>
      {index && <span className="text-fg">{index}</span>}
      <span>{children}</span>
    </p>
  );
}

export function Divider({ children, className }: { children?: React.ReactNode; className?: string }) {
  if (!children) return <hr className={cx("border-line", className)} />;
  return (
    <div className={cx("flex items-center gap-3", className)} role="separator">
      <span className="h-px flex-1 bg-line" />
      <span className="text-label text-muted">{children}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
