import { Decrypt } from "@/components/kit/Decrypt";
import { Label } from "@/components/kit/Frame";
import { Rise } from "@/components/kit/Rise";
import { cx } from "@/lib/ui/cx";

export function SystemState({
  label,
  centered,
  title,
  titleMuted,
  text,
  detail,
  actions,
}: {
  label: string;
  centered?: boolean;
  title: string;
  titleMuted?: string;
  text?: string;
  detail?: { caption: string; value: string } | null;
  actions?: React.ReactNode;
}) {
  return (
    <div className={centered ? "text-center" : undefined}>
      <Rise>
        <Label className={centered ? "justify-center" : undefined}>{label}</Label>
      </Rise>
      <Rise delay={0.06}>
        <h1 className={cx(centered ? "text-display" : "text-title", "mt-6 text-balance")}>
          {title}
          {titleMuted && (
            <>
              <br />
              <span className="text-muted">{titleMuted}</span>
            </>
          )}
        </h1>
      </Rise>
      {text && (
        <Rise delay={0.12}>
          <p className="mt-4 text-pretty text-[1.0625rem] leading-relaxed text-muted">{text}</p>
        </Rise>
      )}
      {detail && (
        <Rise delay={0.18}>
          <dl className={cx("mt-8 flex items-baseline gap-4 border-y border-line py-3.5", centered && "mx-auto max-w-[26rem] justify-center")}>
            <dt className="text-label shrink-0 text-muted">{detail.caption}</dt>
            <dd className="min-w-0 truncate font-mono text-[13px]">
              <Decrypt text={detail.value} delay={250} />
            </dd>
          </dl>
        </Rise>
      )}
      {actions && (
        <Rise delay={0.24}>
          <div className={cx("mt-10 flex flex-wrap items-center gap-3", centered && "justify-center")}>{actions}</div>
        </Rise>
      )}
    </div>
  );
}
