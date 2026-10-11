/**
 * Briefs from **the Mother**: the artificial superintelligence in orbit over
 * TABAR that runs the mining war (a vast ceramic hull, a long truss mast
 * hung with solar wings). She speaks to a clone through a retro terminal
 * dialog (mother-ui.ts draws it); this is the conversation itself, kept
 * free of the DOM so tests can hold one.
 *
 * A **brief** is what she has to say at a moment (lines, typed out one
 * character at a time like a terminal) and, often, an objective, and then a
 * short **branching talk**: never more than two replies on offer at a time
 * (MAX_CHOICES), each leading on down its own branch until the branches
 * close. Anything typed in is answered too, matched to the nearest topic by
 * its key words. She remembers what she's been asked (across briefs), and
 * doesn't offer it again.
 *
 * She **cannot lie**. Everything she says is true as far as she knows;
 * asked something she has no true answer to, she says so (and declines
 * openly when she declines), never inventing one.
 */

export interface Topic {
  id: string;
  /** The question as the player puts it (on the choice). */
  ask: string;
  /** Words and phrases that bring it up when typed (lower case). */
  keys: readonly string[];
  /** Her answer, a line at a time. */
  answer: readonly string[];
}

/** A point in a brief's talk: a topic she answers (and/or lines she says), and the replies on offer from there. */
export interface TalkNode {
  topic?: string;
  say?: readonly string[];
  /** Where each reply leads (a node of the same brief); its words, or else the topic's question. None: the talk is over. */
  options?: readonly { to: string; ask?: string }[];
}

export interface Brief {
  id: string;
  /** Her lines. */
  lines: readonly string[];
  /** What she wants done (shown set apart, after her lines). */
  objective?: string;
  /** The talk after it: its nodes by id, starting at `start`. */
  talk?: Readonly<Record<string, TalkNode>>;
}

/** A reply on offer: its words, and where it leads. */
export interface Choice {
  ask: string;
  to: string;
}

export interface LogLine {
  who: 'mother' | 'you' | 'objective' | 'system';
  text: string;
}

/** Characters a second she types at. */
export const TYPE_CPS = 70;
/** The most replies offered at once. */
export const MAX_CHOICES = 2;

export class Conversation {
  /** Everything said, oldest first; the last mother lines may be part-typed (see `shown`). */
  readonly log: LogLine[] = [];
  /** Lines waiting to be typed out, in order. */
  private readonly queue: LogLine[] = [];
  /** How much of the line being typed (the log's last) shows (characters). */
  shown = 0;
  private typingLine: LogLine | null = null;
  private carry = 0;
  /** What she's been asked. */
  readonly asked = new Set<string>();
  brief: Brief | null = null;
  /** Where the talk is (null: over). */
  node: TalkNode | null = null;
  private fallback = 0;

  constructor(
    readonly topics: Readonly<Record<string, Topic>>,
    /** What she says when she has no true answer (in turn). */
    readonly unknown: readonly string[],
  ) {}

  /** A new brief: her lines and its objective queued to type, and its talk begun. */
  begin(b: Brief): void {
    this.brief = b;
    for (const l of b.lines) this.say('mother', l);
    if (b.objective) this.say('objective', b.objective);
    this.node = null;
    if (b.talk?.start) this.enter('start');
  }

  /** On to a node of the brief's talk: she answers its topic and says its lines. */
  private enter(id: string): void {
    const n = this.brief?.talk?.[id];
    this.node = n ?? null;
    if (!n) return;
    const t = n.topic ? this.topics[n.topic] : null;
    if (t) this.answer(t);
    for (const l of n.say ?? []) this.say('mother', l);
  }

  /** Queue a line to be typed out. */
  say(who: LogLine['who'], text: string): void {
    // (Your own words appear at once; hers are typed.)
    if (who === 'you' && !this.typingLine && !this.queue.length) this.log.push({ who, text });
    else this.queue.push({ who, text });
    if (!this.typingLine) this.nextLine();
  }

  private nextLine(): void {
    while (this.queue.length) {
      const l = this.queue.shift()!;
      this.log.push(l);
      if (l.who === 'you') continue;
      this.typingLine = l;
      this.shown = 0;
      return;
    }
    this.typingLine = null;
  }

  /** Is she still typing (or has more queued)? */
  get typing(): boolean {
    return this.typingLine !== null;
  }

  /** Time passes (ms): she types on. */
  tick(ms: number): void {
    this.carry += (ms / 1000) * TYPE_CPS;
    while (this.typingLine && this.carry >= 1) {
      const n = Math.min(Math.floor(this.carry), this.typingLine.text.length - this.shown);
      this.shown += n;
      this.carry -= n;
      if (this.shown >= this.typingLine.text.length) {
        this.carry = Math.min(this.carry, 1);
        this.nextLine();
      }
    }
    if (!this.typingLine) this.carry = 0;
  }

  /** Skip to the end of everything she has queued. */
  skip(): void {
    while (this.typingLine) {
      this.shown = this.typingLine.text.length;
      this.nextLine();
    }
  }

  /** How much of a log line shows (all of it, unless it's the one being typed). */
  visible(i: number): string {
    const l = this.log[i];
    return l === this.typingLine ? l.text.slice(0, this.shown) : l.text;
  }

  /** The replies on offer now (never more than MAX_CHOICES): where the talk is, less what she's already been asked. */
  choices(): Choice[] {
    const talk = this.brief?.talk;
    if (!this.node || !talk) return [];
    const out: Choice[] = [];
    for (const o of this.node.options ?? []) {
      const to = talk[o.to];
      if (!to) continue;
      const t = to.topic ? this.topics[to.topic] : null;
      if (t && this.asked.has(t.id)) continue;
      const ask = o.ask ?? t?.ask;
      if (ask) out.push({ ask, to: o.to });
    }
    return out.slice(0, MAX_CHOICES);
  }

  /** Take reply `i` of those on offer: you say it, and the talk goes down its branch. */
  choose(i: number): void {
    const c = this.choices()[i];
    if (!c) return;
    this.say('you', c.ask);
    this.enter(c.to);
  }

  private answer(t: Topic): void {
    for (const l of t.answer) this.say('mother', l);
    this.asked.add(t.id);
  }

  /** The topic typed words are about (the most key words found), or null. */
  match(text: string): Topic | null {
    const s = ` ${text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
    let best: Topic | null = null;
    let bestScore = 0;
    for (const t of Object.values(this.topics)) {
      let score = 0;
      for (const k of t.keys) if (s.includes(` ${k} `)) score += k.split(' ').length;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }

  /** Ask her in your own words: she answers the topic it's about, or says honestly that she has no answer. */
  ask(text: string): Topic | null {
    const q = text.trim();
    if (!q) return null;
    this.say('you', q);
    const t = this.match(q);
    if (t) this.answer(t);
    else this.say('mother', this.unknown[this.fallback++ % this.unknown.length]);
    return t;
  }
}
