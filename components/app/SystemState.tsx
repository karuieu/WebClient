import { Decrypt } from "@/components/kit/Decrypt";
import { Label } from "@/components/kit/Frame";
import { Rise } from "@/components/kit/Rise";

export function SystemState({
  code,
  label,
  title,
  titleMuted,
  text,
  detail,
  actions,
}: {
  code?: string;
  label: string;
  title: string;
  titleMuted?: string;
  text: string;
  detail?: { caption: string; value: string } | null;
  actions: React.ReactNode;
}) {
  return (
    <div>
      <Rise>
        <Label index={code}>{label}</Label>
      </Rise>
      <Rise delay={0.06}>
        <h1 className="text-title mt-6 text-balance">
          {title}
          {titleMuted && (
            <>
              <br />
              <span className="text-muted">{titleMuted}</span>
            </>
          )}
        </h1>
      </Rise>
      <Rise delay={0.12}>
        <p className="mt-4 text-pretty text-[1.0625rem] leading-relaxed text-muted">{text}</p>
      </Rise>
      {detail && (
        <Rise delay={0.18}>
          <dl className="mt-8 flex items-baseline gap-4 border-y border-line py-3.5">
            <dt className="text-label shrink-0 text-muted">{detail.caption}</dt>
            <dd className="min-w-0 truncate font-mono text-[13px]">
              <Decrypt text={detail.value} delay={250} />
            </dd>
          </dl>
        </Rise>
      )}
      <Rise delay={0.24}>
        <div className="mt-10 flex flex-wrap items-center gap-3">{actions}</div>
      </Rise>
    </div>
  );
}
