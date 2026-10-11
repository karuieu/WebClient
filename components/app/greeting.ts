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

export function pickIncognitoGreeting(random: () => number = Math.random): IncognitoGreeting {
  return incognitoGreetings[Math.floor(random() * incognitoGreetings.length)];
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

export function pickGreeting({
  date = new Date(),
  moment,
  returning = false,
  random = Math.random,
}: { date?: Date; moment?: GreetingMoment; returning?: boolean; random?: () => number } = {}): Greeting {
  const pool = phrases[moment ?? (random() < 0.6 ? momentFor(date) : "any")].filter((g) => returning || !g.returning);
  return pool[Math.floor(random() * pool.length)];
}
