// The card the enclave sends with a fetched page. The <fetched_page> block keeps it in the enclave's shape, and a
// saved message can hold anything, including a block the model wrote itself, so every field is checked here before
// the UI sees it.

export const WEATHER_ICONS = ["clear", "clear-night", "partly-cloudy", "cloudy", "fog", "rain", "showers", "sleet", "snow", "thunder"] as const;
export type WeatherIcon = (typeof WEATHER_ICONS)[number];

export type WeatherDay = { date: string; icon: WeatherIcon; high: number; low: number };

export type PageCard = {
  title: string;
  description?: string;
  /** An http(s) address, loaded only through the enclave (fetchCardImage). */
  image?: string;
  /** An encyclopedia article's pictures, with addresses loaded the same way. */
  photos?: { caption: string; image: string }[];
  weather?: { icon: WeatherIcon; temperature: number; condition: string; days: WeatherDay[] };
  exchange?: { amount: string; result: string; rates: string[] };
  source?: string;
  /** A day (2026-11-16) or a moment (2026-11-16T23:20:38Z). */
  asOf?: string;
};

const MAX_TEXT = 400;
const MAX_DAYS = 7;
const MAX_RATES = 4;
const MAX_PHOTOS = 4;

type Fields = Record<string, unknown>;

function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() && value.length <= MAX_TEXT ? value : undefined;
}

function wholeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && Math.abs(value) < 100 ? value : undefined;
}

function weatherIcon(value: unknown): WeatherIcon | undefined {
  return WEATHER_ICONS.find((icon) => icon === value);
}

function webAddress(value: unknown): string | undefined {
  return typeof value === "string" && /^https?:\/\//i.test(value) && value.length <= 2048 ? value : undefined;
}

function day(value: unknown): WeatherDay | undefined {
  if (!isFields(value) || typeof value.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) return undefined;
  const icon = weatherIcon(value.icon);
  const high = wholeNumber(value.high);
  const low = wholeNumber(value.low);
  return icon && high !== undefined && low !== undefined ? { date: value.date, icon, high, low } : undefined;
}

function weather(value: unknown): PageCard["weather"] {
  if (!isFields(value) || !Array.isArray(value.days)) return undefined;
  const icon = weatherIcon(value.icon);
  const temperature = wholeNumber(value.temperature);
  const condition = text(value.condition);
  const days = value.days.slice(0, MAX_DAYS).map(day);
  if (!icon || temperature === undefined || !condition || days.some((d) => !d)) return undefined;
  return { icon, temperature, condition, days: days.filter((d): d is WeatherDay => !!d) };
}

function exchange(value: unknown): PageCard["exchange"] {
  if (!isFields(value) || !Array.isArray(value.rates)) return undefined;
  const amount = text(value.amount);
  const result = text(value.result);
  const rates = value.rates.slice(0, MAX_RATES).map(text);
  if (!amount || !result || rates.length === 0 || rates.some((r) => !r)) return undefined;
  return { amount, result, rates: rates.filter((r): r is string => !!r) };
}

function photos(value: unknown): PageCard["photos"] {
  if (!Array.isArray(value)) return undefined;
  const list = value.slice(0, MAX_PHOTOS).flatMap((photo) => {
    if (!isFields(photo)) return [];
    const caption = text(photo.caption);
    const image = webAddress(photo.image);
    return caption && image ? [{ caption, image }] : [];
  });
  return list.length ? list : undefined;
}

/** The card in an enclave response or a saved block, or undefined when it has no usable title. */
export function parsePageCard(value: unknown): PageCard | undefined {
  if (!isFields(value)) return undefined;
  const title = text(value.title);
  if (!title) return undefined;
  const card: PageCard = { title };
  const description = text(value.description);
  const image = webAddress(value.image);
  const pictures = photos(value.photos);
  const weatherCard = weather(value.weather);
  const exchangeCard = exchange(value.exchange);
  const source = text(value.source);
  const asOf = text(value.as_of);
  if (description) card.description = description;
  if (image) card.image = image;
  if (pictures) card.photos = pictures;
  if (weatherCard) card.weather = weatherCard;
  if (exchangeCard) card.exchange = exchangeCard;
  if (source) card.source = source;
  if (asOf) card.asOf = asOf;
  return card;
}
