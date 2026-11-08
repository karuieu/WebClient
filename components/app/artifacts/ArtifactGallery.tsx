"use client";

import * as React from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { Enter, cascade } from "@/components/kit/Enter";
import { FileBraces, FileText, Folder, Globe, Presentation } from "@/components/kit/icons";
import { useNow } from "@/components/kit/useMounted";
import { codeLanguageOf, slidesDocument, toDocument, type ArtifactType } from "@/lib/artifacts/artifacts";
import { cx } from "@/lib/ui/cx";
import { codeTheme } from "../chat/CodeBlock";
import { SlideThumbnail } from "../chat/Slides";
import { stamp } from "../ChatsView";

export const ARTIFACT_TYPES: readonly { id: ArtifactType; label: string }[] = [
  { id: "markdown", label: "Docs" },
  { id: "html", label: "Sites" },
  { id: "code", label: "Code" },
  { id: "slides", label: "Slides" },
];

export type ArtifactItem = {
  id: string;
  title: string;
  type: ArtifactType;
  /** For code, the file's extension names its language. */
  path?: string;
  source: string;
  version: number;
  projectName?: string | null;
  updatedAt: string;
};

/** Opens the chat the artifact was written in, with the artifact in the side panel. */
export type OpenArtifact = (a: ArtifactItem) => void;

// The page is laid out at this width and scaled down, so a thumbnail wraps like the real document.
const PAGE_WIDTH = 560;
const CODE_LINES = 18;

const TYPE_ICON = { markdown: FileText, html: Globe, code: FileBraces, slides: Presentation } as const;

function typeLabel({ type, path }: ArtifactItem): string {
  if (type === "code") return codeLanguageOf(path).label;
  if (type === "slides") return "Slides";
  return type === "markdown" ? "Doc" : "Site";
}

/** A document fades in once its frame has painted, instead of flashing an empty page. */
function ScaledPage({
  document,
  height = PAGE_WIDTH * 1.5,
  margin,
  children,
}: {
  document?: string;
  height?: number;
  /** Paper margin for docs; a site runs to the edge. */
  margin?: boolean;
  children?: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(0);
  const [loaded, setLoaded] = React.useState(document === undefined);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / PAGE_WIDTH));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="absolute inset-0 origin-top transition-transform duration-700 ease-out-soft group-hover/row:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover/row:scale-100"
    >
      {scale > 0 && (
        <div
          className={cx("pointer-events-none origin-top-left transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
          style={{ width: PAGE_WIDTH, height, transform: `scale(${scale})` }}
        >
          {document === undefined ? (
            children
          ) : (
            <iframe title="" tabIndex={-1} srcDoc={document} sandbox="" scrolling="no" onLoad={() => setLoaded(true)} className={cx("size-full border-0", margin ? "px-4 pt-3" : "bg-white")} />
          )}
        </div>
      )}
    </div>
  );
}

const frame = "relative block aspect-[4/3] overflow-hidden rounded-2xl ring-1 ring-line-strong transition-[box-shadow] duration-300 group-hover/row:shadow-soft";

/** The opening slide, centred on the tile, fading in once painted like a page does. */
function SlideThumb({ source }: { source: string }) {
  const document = React.useMemo(() => slidesDocument(source, { only: 0 }), [source]);
  const [loaded, setLoaded] = React.useState(false);
  return (
    <span className={cx(frame, "grid place-items-center bg-surface px-4")}>
      <span
        aria-hidden="true"
        className={cx(
          "block w-full transition-[opacity,transform] duration-300 group-hover/row:scale-[1.04] motion-reduce:group-hover/row:scale-100",
          loaded ? "opacity-100" : "opacity-0",
        )}
      >
        <SlideThumbnail document={document} onLoad={() => setLoaded(true)} />
      </span>
    </span>
  );
}

function Thumb({ artifact }: { artifact: ArtifactItem }) {
  const document = React.useMemo(
    () => (artifact.type === "code" || artifact.type === "slides" ? "" : toDocument({ title: artifact.title, type: artifact.type, content: artifact.source })),
    [artifact.title, artifact.type, artifact.source],
  );

  if (artifact.type === "slides") return <SlideThumb source={artifact.source} />;

  if (artifact.type === "code") {
    return (
      <span className={cx(frame, "bg-surface")}>
        <ScaledPage>
          <div className="px-7 py-6 font-mono text-[15px] leading-[1.65]">
            <SyntaxHighlighter language={codeLanguageOf(artifact.path).prism} style={codeTheme} customStyle={{ overflow: "hidden" }} PreTag="div">
              {artifact.source.split("\n").slice(0, CODE_LINES).join("\n")}
            </SyntaxHighlighter>
          </div>
        </ScaledPage>
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-surface to-transparent" />
      </span>
    );
  }
  if (artifact.type === "markdown") {
    return (
      <span className={cx(frame, "bg-surface")}>
        <ScaledPage document={document} margin />
        {/* A doc runs on below the tile; the fade makes the cut read as intended. */}
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-surface to-transparent" />
      </span>
    );
  }
  return (
    <span className={cx(frame, "bg-white [color-scheme:light]")}>
      <ScaledPage document={document} />
    </span>
  );
}

function Tile({ artifact, onOpen, now, enterDelay }: { artifact: ArtifactItem; onOpen: OpenArtifact; now: Date | null; enterDelay?: number }) {
  const TypeIcon = TYPE_ICON[artifact.type];
  const tile = (
    <li className="group/row relative">
      <button
        type="button"
        onClick={() => onOpen(artifact)}
        className="block w-full cursor-pointer rounded-2xl text-left transition-transform duration-150 active:scale-[0.985]"
      >
        <Thumb artifact={artifact} />
        <span className="block px-1 pt-3.5">
          <span className="block truncate text-[15px] tracking-[-0.01em]">{artifact.title}</span>
          <span className="mt-1 flex min-w-0 items-center gap-2 font-mono text-[11.5px] text-muted">
            <span className="flex shrink-0 items-center gap-1">
              <TypeIcon className="size-3" />
              {typeLabel(artifact)}
              {artifact.version > 1 && ` v${artifact.version}`}
            </span>
            <span aria-hidden="true">·</span>
            <span className="shrink-0">{now ? stamp(artifact.updatedAt, now) : "\u00a0"}</span>
            {artifact.projectName && (
              <>
                <span aria-hidden="true">·</span>
                <span className="flex min-w-0 items-center gap-1">
                  <Folder className="size-3" />
                  <span className="truncate">{artifact.projectName}</span>
                </span>
              </>
            )}
          </span>
        </span>
      </button>
    </li>
  );

  return enterDelay === undefined ? (
    tile
  ) : (
    <Enter delay={enterDelay} offset={10} blur={false}>
      {tile}
    </Enter>
  );
}

/** `cascadeFrom` staggers the tiles in from that position; leave it out once the page has shown. */
export function ArtifactGallery({ artifacts, onOpen, cascadeFrom }: { artifacts: ArtifactItem[]; onOpen: OpenArtifact; cascadeFrom?: number }) {
  const now = useNow();
  return (
    <div className="@container">
      <ul className="grid grid-cols-1 gap-x-5 gap-y-8 @sm:grid-cols-2 @3xl:grid-cols-3">
        {artifacts.map((a, i) => (
          <Tile key={a.id} artifact={a} onOpen={onOpen} now={now} enterDelay={cascadeFrom === undefined ? undefined : cascade(cascadeFrom + i, 120, 45)} />
        ))}
      </ul>
    </div>
  );
}
