"use client";

import type * as React from "react";
import { Markdown } from "./Markdown";
import { Processing, type ProcessingStep } from "./Processing";

export type PreparationSegment =
  | { kind: "message"; text: string }
  | { kind: "processing"; steps: ProcessingStep[] };

export function Preparation({ segments, status }: { segments: PreparationSegment[]; status?: string | null }): React.ReactNode {
  const last = segments.length - 1;
  return (
    <div className="[&_button]:min-h-11 [&_a]:min-h-11">
      {segments.map((segment, index) => segment.kind === "message" ? (
        <div key={index} data-answer className="mb-4 text-[0.9375rem] leading-[1.75] [overflow-wrap:anywhere]">
          <Markdown>{segment.text}</Markdown>
        </div>
      ) : (
        <Processing key={index} steps={segment.steps} status={index === last ? status : null} />
      ))}
      {segments[last]?.kind !== "processing" && status ? <Processing steps={[]} status={status} /> : null}
    </div>
  );
}
