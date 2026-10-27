const LOOP_REPEAT_LIMIT = 4;
const LOOP_MIN_PHRASE = 4;
const MAX_PHRASE_CHARS = 400;
const CHECK_EVERY_CHARS = 200;

export const REPETITION_NOTICE_KIND = "repetition_stopped";
export const REPETITION_NOTICE = `<notice>${JSON.stringify({ kind: REPETITION_NOTICE_KIND })}</notice>`;

/**
 * Finds a degenerate loop at the end of the text: a phrase of at least
 * LOOP_MIN_PHRASE repeated back to back at least LOOP_REPEAT_LIMIT times.
 * Returns the index to cut at so a single copy of the phrase survives, or -1
 * when the tail isn't a loop. Only exact repeats count, so ordinary prose,
 * lists and tables never trip it.
 */
export function findLoopCut(text: string): number {
  for (let phrase = LOOP_MIN_PHRASE; phrase <= MAX_PHRASE_CHARS; phrase++) {
    const span = phrase * LOOP_REPEAT_LIMIT;
    if (span > text.length) continue;

    let i = text.length - span + phrase;
    while (i < text.length && text[i] === text[i - phrase]) i++;
    if (i < text.length) continue;

    let loopStart = text.length - span;
    while (loopStart > 0 && text[loopStart - 1] === text[loopStart - 1 + phrase]) loopStart--;
    return loopStart + phrase;
  }
  return -1;
}

// Where a stream client should end the answer (the start of a tool call the model just finished), or -1 to go on.
export type StopAt = (text: string) => number;

// After a tool call or repetition cut, the stream is read to its end because only a complete answer has a signature.
// A model that keeps writing longer than this fails the round.
export const CALL_DRAIN_LIMIT_MS = 30_000;

export function createLoopGuard(): (text: string) => number {
  let checkedAt = 0;
  return (text) => {
    if (text.length - checkedAt < CHECK_EVERY_CHARS) return -1;
    checkedAt = text.length;
    return findLoopCut(text);
  };
}
