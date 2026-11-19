import * as React from "react";
import Image from "next/image";
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudShowers,
  CloudSleet,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
} from "@/components/kit/icons";
import { AttachmentViewer, type ViewerAttachment } from "./AttachmentViewer";
import { cx } from "@/lib/ui/cx";
import { domainOf } from "./Processing";

const ICONS = {
  clear: Sun,
  "clear-night": Moon,
  "partly-cloudy": CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  rain: CloudRain,
  showers: CloudShowers,
  sleet: CloudSleet,
  snow: CloudSnow,
  thunder: CloudLightning,
} as const;

export type CardIcon = keyof typeof ICONS;

export type WeatherDay = { label: string; icon: CardIcon; high: string; low: string };

/** The weather now at a place, and the days after it. */
export type WeatherData = { icon: CardIcon; temperature: string; condition: string; days: WeatherDay[] };

/** A conversion: the amount asked about, what it comes to, and the rate both ways. */
export type ExchangeData = { amount: string; result: string; rates: string[] };

type CardImage = { state: "loading" } | { state: "shown"; src: string };

/** A picture from the article, named by its caption or, without one, its file. */
export type CardPhoto = { caption: string; image: CardImage };

/** What a fetched page holds, from its preview tags or its site's own API. */
export type PageCardData = {
  title: string;
  description?: string;
  /** Absent when the page has no image or it couldn't be loaded. */
  image?: CardImage;
  /** An encyclopedia article shows its pictures and a one-line description instead of a summary, which the answer gives anyway. */
  photos?: CardPhoto[];
  exchange?: ExchangeData;
  weather?: WeatherData;
  /** Who the data comes from, when the page's domain doesn't say it. */
  source?: string;
  /** When the value holds, already formatted for the reader. */
  asOf?: string;
};

const bigFigure = "text-[30px] font-medium leading-tight tracking-[-0.03em] tabular-nums";

/**
 * Every card has one shape, so cards of different kinds look alike in a chat: the title on top, the main content
 * under it, an aside on the right (below it on a phone) and the source along the bottom.
 */
function CardFrame({
  url,
  card,
  lead,
  aside,
  children,
  linkTitleOnly = false,
}: {
  url: string;
  card: PageCardData;
  /** Shown left of the title and content, such as the weather now. */
  lead?: React.ReactNode;
  aside?: React.ReactNode;
  children?: React.ReactNode;
  /** For an aside with its own buttons, which can't sit inside a link. */
  linkTitleOnly?: boolean;
}) {
  const titleClass = "block truncate text-[14.5px] font-medium tracking-[-0.01em]";
  const content = (
    <>
      {/* As tall as the weather's day strip, the tallest content, so every kind of card has one height. */}
      <span className="flex min-h-[4.375rem] flex-wrap items-center justify-between gap-x-8 gap-y-4">
        <span className="flex min-w-0 flex-1 basis-56 items-center gap-4">
          {lead}
          <span className="min-w-0">
            {linkTitleOnly ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={cx(titleClass, "underline decoration-transparent underline-offset-[3px] transition-colors duration-150 hover:decoration-line-strong")}
              >
                {card.title}
              </a>
            ) : (
              <span className={titleClass}>{card.title}</span>
            )}
            {children}
          </span>
        </span>
        {aside}
      </span>
      <span className="block truncate font-mono text-[11.5px] text-muted">
        {[card.source ?? domainOf(url), card.asOf].filter(Boolean).join(" · ")}
      </span>
    </>
  );
  const frame = "flex flex-col justify-between gap-3 rounded-2xl border border-line bg-elevated p-4";
  if (linkTitleOnly) return <div className={frame}>{content}</div>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={cx(frame, "transition-colors duration-150 hover:border-line-strong")}>
      {content}
    </a>
  );
}

function WeatherDays({ days }: { days: WeatherDay[] }) {
  return (
    <span className="flex">
      {days.map((day) => {
        const DayIcon = ICONS[day.icon];
        return (
          <span key={day.label} className="flex w-14 flex-col items-center gap-1.5 border-l border-line first:border-l-0">
            <span className="font-mono text-[11.5px] text-muted">{day.label}</span>
            <DayIcon className="size-5 text-fg" />
            <span className="text-[13.5px] font-medium tabular-nums">
              {day.high}
              <span className="ml-1 font-normal text-muted">{day.low}</span>
            </span>
          </span>
        );
      })}
    </span>
  );
}

function Rates({ rates }: { rates: string[] }) {
  return (
    <span className="flex flex-col gap-1.5 border-l border-line pl-5">
      {rates.map((rate) => (
        <span key={rate} className="font-mono text-[12.5px] tabular-nums text-fg/85">
          {rate}
        </span>
      ))}
    </span>
  );
}

function PageImage({ image }: { image: NonNullable<PageCardData["image"]> }) {
  return (
    <span aria-hidden="true" className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-line bg-surface">
      {/* A blob: URL of an image the enclave fetched; there is nothing for Next to optimize. */}
      {image.state === "shown" && <Image src={image.src} alt="" fill unoptimized className="object-cover" />}
    </span>
  );
}

function Photos({ photos }: { photos: CardPhoto[] }) {
  const [open, setOpen] = React.useState<number | null>(null);
  const viewable: ViewerAttachment[] = photos.flatMap(({ caption, image }) => (image.state === "shown" ? [{ kind: "image" as const, name: caption, src: image.src }] : []));
  let shown = 0;
  return (
    // Four pictures are wider than a phone's card, so the row scrolls there.
    <span className="-m-1 flex max-w-full gap-2 overflow-x-auto p-1 [scrollbar-width:none]">
      {photos.map(({ caption, image }, i) => {
        if (image.state !== "shown") return <span key={i} aria-hidden="true" className="size-[4.375rem] shrink-0 rounded-lg border border-line bg-surface" />;
        const index = shown++;
        return (
          <button
            key={i}
            type="button"
            onClick={() => setOpen(index)}
            aria-label={`Open ${caption}`}
            title={caption}
            className="relative size-[4.375rem] shrink-0 cursor-pointer overflow-hidden rounded-lg border border-line bg-surface transition-[filter] duration-150 hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
          >
            <Image src={image.src} alt="" fill unoptimized className="object-cover" />
          </button>
        );
      })}
      <AttachmentViewer attachments={viewable} index={open} onIndexChange={setOpen} onClose={() => setOpen(null)} />
    </span>
  );
}

export function PageCard({ url, card }: { url: string; card: PageCardData }) {
  const { weather, exchange, image, photos } = card;
  if (photos?.length) {
    return (
      <CardFrame url={url} card={card} aside={<Photos photos={photos} />} linkTitleOnly>
        {card.description && <span className="mt-0.5 block truncate text-[13.5px] text-muted">{card.description}</span>}
      </CardFrame>
    );
  }
  if (weather) {
    const Now = ICONS[weather.icon];
    return (
      <CardFrame url={url} card={card} lead={<Now className="size-11 text-fg" />} aside={<WeatherDays days={weather.days} />}>
        <span className="flex items-baseline gap-2.5">
          <span className={bigFigure}>{weather.temperature}</span>
          <span className="text-[13.5px] text-muted">{weather.condition}</span>
        </span>
      </CardFrame>
    );
  }
  if (exchange) {
    return (
      <CardFrame url={url} card={card} aside={<Rates rates={exchange.rates} />}>
        <span className="mt-1 flex flex-wrap items-baseline gap-x-3">
          <span className={bigFigure}>{exchange.result}</span>
          <span className="text-[13.5px] text-muted tabular-nums">for {exchange.amount}</span>
        </span>
      </CardFrame>
    );
  }
  return (
    <CardFrame url={url} card={card} aside={image && <PageImage image={image} />}>
      {card.description && <span className="mt-1 line-clamp-2 text-[13.5px] leading-relaxed text-muted">{card.description}</span>}
    </CardFrame>
  );
}
