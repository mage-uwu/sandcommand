/**
 * The big centre-screen messages ("WAVE 3 IN 2", "RED WINS"): their
 * subtitle, laid out so it never runs off the screen (render.ts draws them).
 *
 * A subtitle is written as segments joined by " · ". The first segment is
 * the headline (what's happening to you: "redeploying in 0:04"); the rest
 * are hints ("spectating Rex · click for next"), packed onto as few lines
 * as fit, a segment never split unless it's too long for a line by itself.
 */
export interface BannerSub {
  /** The first segment: the status line. */
  head: string;
  /** The rest, packed into lines that each fit. */
  hints: string[];
}

export const HINT_SEP = '  ·  ';

/**
 * Split `sub` (" · "-separated) into the headline and hint lines no wider
 * than `maxW` by `measure` (a line's width in the hint font). A single
 * segment wider than a line is broken at spaces.
 */
export function layoutSub(sub: string, maxW: number, measure: (s: string) => number): BannerSub {
  const segs = sub
    .split(' · ')
    .map((x) => x.trim())
    .filter(Boolean);
  const head = segs.shift() ?? '';
  const hints: string[] = [];
  let line = '';
  const push = (seg: string) => {
    const next = line ? line + HINT_SEP + seg : seg;
    if (!line || measure(next) <= maxW) line = next;
    else {
      hints.push(line);
      line = seg;
    }
  };
  for (const seg of segs) {
    if (measure(seg) <= maxW) {
      push(seg);
      continue;
    }
    // Too long for a line by itself: break it at spaces.
    if (line) {
      hints.push(line);
      line = '';
    }
    let part = '';
    for (const word of seg.split(' ')) {
      const next = part ? part + ' ' + word : word;
      if (!part || measure(next) <= maxW) part = next;
      else {
        hints.push(part);
        part = word;
      }
    }
    line = part;
  }
  if (line) hints.push(line);
  return { head, hints };
}
