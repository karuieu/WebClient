import Link from "next/link";
import { cx } from "@/lib/cx";
import { ArrowRight } from "./icons";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "onInverse";
type Size = "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-inverse text-on-inverse hover:opacity-85",
  secondary: "bg-elevated text-fg ring-1 ring-inset ring-line-strong hover:bg-surface",
  ghost: "text-fg hover:bg-surface",
  danger: "bg-danger text-on-danger hover:opacity-90",
  onInverse: "bg-on-inverse text-inverse hover:opacity-90",
};

const sizes: Record<Size, string> = {
  md: "h-9 px-4 text-sm",
  lg: "h-12 px-6 text-[0.9375rem]",
};

const base =
  "group relative inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 rounded-full font-medium tracking-[-0.01em] transition-[opacity,background-color,transform] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45";

type Common = { variant?: Variant; size?: Size; arrow?: boolean };

function Arrow() {
  return <ArrowRight className="transition-transform duration-200 ease-out-soft group-hover:translate-x-0.5" />;
}

export function Button({
  variant = "primary",
  size = "md",
  arrow,
  loading,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: React.ComponentProps<"button"> & Common & { loading?: boolean }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(base, variants[variant], sizes[size], loading && "!opacity-100", className)}
      {...props}
    >
      <span className={cx("inline-flex items-center gap-2 transition-opacity duration-150", loading && "opacity-0")}>
        {children}
        {arrow && <Arrow />}
      </span>
      {loading && (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner tone={variant === "primary" ? "inverse" : variant === "danger" ? "danger" : "default"} />
        </span>
      )}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  arrow,
  className,
  children,
  href,
  ...props
}: Omit<React.ComponentProps<"a">, "href"> & Common & { href: string }) {
  return (
    <Link href={href} className={cx(base, variants[variant], sizes[size], className)} {...props}>
      {children}
      {arrow && <Arrow />}
    </Link>
  );
}
