// A sent message keeps each skill or artifact the user picked as its label in the text ("/slides", "@Notes"),
// so the model reads it in place. The envelope stores where each label starts, so the app can show it again.

export type Mention = { at: number; label: string };

// Offsets in `mentions` count the text without labels; the returned offsets count the trimmed result.
export function writeMentions(text: string, mentions: Mention[]): { text: string; offsets: number[] } {
  const order = mentions.map((mention, index) => ({ ...mention, index })).sort((a, b) => a.at - b.at);
  const offsets: number[] = [];
  let out = "";
  let from = 0;
  for (const mention of order) {
    out += text.slice(from, mention.at);
    offsets[mention.index] = out.length;
    out += mention.label;
    from = mention.at;
  }
  out += text.slice(from);
  const lead = out.length - out.trimStart().length;
  return { text: out.trim(), offsets: offsets.map((at) => at - lead) };
}

// The inverse of writeMentions. A label that is not at its offset stays in the text, and its offset is null.
export function readMentions(text: string, mentions: Mention[]): { text: string; offsets: (number | null)[] } {
  const order = mentions.map((mention, index) => ({ ...mention, index })).sort((a, b) => a.at - b.at);
  const offsets: (number | null)[] = mentions.map(() => null);
  let out = "";
  let from = 0;
  for (const mention of order) {
    if (mention.at < from || !mention.label || text.slice(mention.at, mention.at + mention.label.length) !== mention.label) continue;
    out += text.slice(from, mention.at);
    offsets[mention.index] = out.length;
    from = mention.at + mention.label.length;
  }
  return { text: out + text.slice(from), offsets };
}
