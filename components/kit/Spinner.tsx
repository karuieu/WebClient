import { cx } from "@/lib/cx";

const tones = {
  default: "border-line-strong border-t-fg",
  inverse: "border-on-inverse/30 border-t-on-inverse",
  danger: "border-on-danger/30 border-t-on-danger",
};

export function Spinner({
  inverse,
  tone,
  className,
}: {
  inverse?: boolean;
  tone?: keyof typeof tones;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-block size-4 animate-spin rounded-full border-[1.5px]",
        tones[tone ?? (inverse ? "inverse" : "default")],
        className,
      )}
    />
  );
}
