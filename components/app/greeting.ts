import { incognitoCostumes, type Costume } from "@/components/kit/icons";

export type Greeting = { lead: string; end: "." | "?"; returning?: boolean };
export type GreetingMoment = "morning" | "work" | "weekend" | "evening" | "night" | "any";

const phrases: Record<GreetingMoment, Greeting[]> = {
  morning: [
    { lead: "How did you sleep", end: "?" },
    { lead: "What's first today", end: "?" },
  ],
  work: [
    { lead: "What are you working on", end: "?" },
    { lead: "How's work going", end: "?" },
  ],
  weekend: [{ lead: "Slow weekend", end: "?" }],
  evening: [
    { lead: "How was your day", end: "?" },
    { lead: "How did today go", end: "?" },
  ],
  night: [
    { lead: "Can't sleep", end: "?" },
    { lead: "Still up", end: "?" },
  ],
  any: [
    { lead: "How are you", end: "?" },
    { lead: "Good to see you", end: "." },
    { lead: "What's on your mind", end: "?" },
    { lead: "What's new", end: "?" },
    { lead: "I'm here to help", end: "." },
    { lead: "I'm glad you're back", end: ".", returning: true },
  ],
};

export type IncognitoGreeting = readonly [string, string];

export const incognitoGreetings: IncognitoGreeting[] = [
  ["Just passing through,", "stranger?"],
  ["Nice to meet you,", "stranger."],
  ["You want to talk,", "stranger?"],
  ["Can I help you,", "stranger?"],
  ["What'll it be,", "stranger?"],
  ["New in town,", "stranger?"],
  ["What brings you here,", "stranger?"],
];

const halloweenPhrases: Record<GreetingMoment, Greeting[]> = {
  morning: [
    { lead: "Rough night", end: "?" },
    { lead: "Still in costume", end: "?" },
  ],
  work: [{ lead: "Haunting the office", end: "?" }],
  weekend: [{ lead: "Out haunting", end: "?" }],
  evening: [
    { lead: "Trick or treat", end: "?" },
    { lead: "Out after dark", end: "?" },
  ],
  night: [
    { lead: "Up past midnight", end: "?" },
    { lead: "Out with the bats", end: "?" },
  ],
  any: [
    { lead: "Boo", end: "." },
    { lead: "Nice costume", end: "." },
    { lead: "Back from the dead", end: "?", returning: true },
  ],
};

// The second line is always "stranger": incognito gets the hour but never a name.
const halloweenStrangerPhrases: Record<GreetingMoment, Greeting[]> = {
  morning: [
    { lead: "Rough night", end: "?" },
    { lead: "Still in costume", end: "?" },
  ],
  work: [{ lead: "Haunting the office", end: "?" }],
  weekend: [{ lead: "Out haunting", end: "?" }],
  evening: [
    { lead: "Trick or treat", end: "?" },
    { lead: "Out after dark", end: "?" },
    { lead: "Who's knocking", end: "?" },
  ],
  night: [
    { lead: "Up past midnight", end: "?" },
    { lead: "Out with the bats", end: "?" },
    { lead: "Back from the dead", end: "?" },
  ],
  any: [
    { lead: "Who goes there", end: "?" },
    { lead: "Nice costume", end: "." },
    { lead: "Lost your way", end: "?" },
    { lead: "Love the disguise", end: "." },
  ],
};

export function pickIncognitoGreeting({
  date = new Date(),
  moment,
  random = Math.random,
  halloween = false,
}: { date?: Date; moment?: GreetingMoment; random?: () => number; halloween?: boolean } = {}): IncognitoGreeting {
  if (!halloween) return incognitoGreetings[Math.floor(random() * incognitoGreetings.length)];
  const g = pickFrom(halloweenStrangerPhrases, { date, moment, returning: false, random });
  return [`${g.lead},`, `stranger${g.end}`];
}

const HALLOWEEN_FIRST_DAY = 20;

// The Halloween event runs from 20 to 31 October in the person's own time zone and then goes away by itself.
export function isHalloweenSeason(date: Date = new Date()): boolean {
  return date.getMonth() === 9 && date.getDate() >= HALLOWEEN_FIRST_DAY;
}

const costumes = Object.keys(incognitoCostumes) as Costume[];

// Drawn once per visit by the page, so /new and the incognito chat header wear the same costume.
export function pickCostume(random: () => number = Math.random): Costume {
  return costumes[Math.floor(random() * costumes.length)];
}

export function momentFor(date: Date): GreetingMoment {
  const h = date.getHours();
  const weekday = date.getDay() > 0 && date.getDay() < 6;
  if (h >= 22 || h < 5) return "night";
  if (!weekday && h >= 10 && h < 17) return "weekend";
  if (h < 12) return weekday && h >= 9 ? "work" : "morning";
  if (h < 17) return "work";
  return "evening";
}

type PickOptions = { date: Date; moment?: GreetingMoment; returning: boolean; random: () => number };

function pickFrom(book: Record<GreetingMoment, Greeting[]>, { date, moment, returning, random }: PickOptions): Greeting {
  const pool = book[moment ?? (random() < 0.6 ? momentFor(date) : "any")].filter((g) => returning || !g.returning);
  return pool[Math.floor(random() * pool.length)];
}

export function pickGreeting({
  date = new Date(),
  moment,
  returning = false,
  random = Math.random,
  halloween = false,
}: { date?: Date; moment?: GreetingMoment; returning?: boolean; random?: () => number; halloween?: boolean } = {}): Greeting {
  return pickFrom(halloween ? halloweenPhrases : phrases, { date, moment, returning, random });
}
