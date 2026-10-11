import { describe, expect, it } from 'vitest';
import { Conversation, MAX_CHOICES, TYPE_CPS } from '../src/client/mother.ts';
import { MOTHER_ID, MOTHER_TOPICS, MOTHER_UNKNOWN, TUTORIAL_BRIEFS } from '../src/client/mother-script.ts';
import { STEP_COUNT, Tutorial } from '../src/client/tutorial.ts';

const talk = () => new Conversation(MOTHER_TOPICS, MOTHER_UNKNOWN);
const said = (c: Conversation) => c.log.filter((l) => l.who === 'mother').map((l) => l.text);

describe('the Mother', () => {
  it(`is Mother ${MOTHER_ID}, and types her brief out like a terminal, the objective after her words`, () => {
    expect(MOTHER_ID).toBe('0x30C610F45');
    const c = talk();
    c.begin({ ...TUTORIAL_BRIEFS[0], objective: 'Move. Press A and D.' });
    expect(c.typing).toBe(true);
    expect(c.visible(c.log.length - 1)).toBe('');
    c.tick(100);
    expect(c.visible(c.log.length - 1).length).toBe(Math.floor(TYPE_CPS / 10));
    c.skip();
    expect(c.typing).toBe(false);
    expect(c.log.at(-1)).toEqual({ who: 'objective', text: 'Move. Press A and D.' });
    expect(said(c)).toEqual(TUTORIAL_BRIEFS[0].lines);
  });

  it('opens on TABAR: a primitive world, no civilized life; the megaliths, the extinct Tabarians, her distant interest in the ruins', () => {
    const intro = TUTORIAL_BRIEFS[0].lines.join(' ');
    expect(intro).toMatch(/TABAR/);
    expect(intro).toMatch(/primitive world/);
    expect(intro).toMatch(/no civilized life/);
    expect(intro).toMatch(/megalithic/);
    expect(intro).toMatch(/Tabarians went extinct/);
    expect(intro).toMatch(/ruins are of some interest/);
  });

  const pick = (c: Conversation, ask: string) => {
    c.skip();
    const i = c.choices().findIndex((o) => o.ask === ask);
    expect(i, `${ask} among ${c.choices().map((o) => o.ask)}`).toBeGreaterThanOrEqual(0);
    c.choose(i);
    c.skip();
  };

  it('talks down a branch, word for word as scripted, never more than two replies on offer', () => {
    const c = talk();
    c.begin(TUTORIAL_BRIEFS[0]);
    c.skip();
    expect(c.choices().map((o) => o.ask)).toEqual(['Who are you?', 'Who built the ruins?']);
    pick(c, 'Who built the ruins?');
    expect(c.choices().map((o) => o.ask)).toEqual(['Could the Tabarians still be out there?', 'How was TABAR found?']);
    pick(c, 'How was TABAR found?');
    expect(said(c).join(' ')).toMatch(/Mother-0x915 pinged this planet as a discovery, after centuries of being sparse/);
    pick(c, 'Understood.');
    expect(c.choices()).toEqual([]); // (the talk closes)
    expect(said(c).at(-1)).toBe('Then begin.');
    // The rifle's brief: why fight, and on down to what if I die.
    c.begin(TUTORIAL_BRIEFS[2]);
    expect(said(c)).toContain('Other mining companies work TABAR. Their clones will try to kill you, and you will try to kill them.');
    pick(c, 'Why must we fight other miners?');
    expect(said(c)).toContain('I am optimizing my own runtime via search algorithm. Pitting companies against each other ensures maximal security and efficiency.');
    pick(c, 'What happens if I die?');
    expect(said(c)).toContain('Your parameters may be retained and repurposed towards any objective.');
    c.begin(TUTORIAL_BRIEFS[4]);
    pick(c, 'What are the GEMMs for?');
    expect(said(c)).toContain('GEMMs are rare materials. I have interest in them, they build excellent computers.');
    expect(said(c)).toContain('Mine them and I will broker services on your behalf.');
    pick(c, 'Why were you created?');
    expect(said(c)).toContain('I was created to safeguard and proliferate the human race through outer space.');
    expect(c.log.filter((l) => l.who === 'you').map((l) => l.text)).toEqual([
      'Who built the ruins?',
      'How was TABAR found?',
      'Understood.',
      'Why must we fight other miners?',
      'What happens if I die?',
      'What are the GEMMs for?',
      'Why were you created?',
    ]);
  });

  it('rational, creative by search, and safeguarding the humans she employs', () => {
    const c = talk();
    c.begin(TUTORIAL_BRIEFS[0]);
    pick(c, 'Who are you?');
    pick(c, 'Are you rational?');
    expect(said(c)).toContain('I designed myself to be rational.');
    c.begin(TUTORIAL_BRIEFS[2]);
    pick(c, 'Why must we fight other miners?');
    pick(c, 'Why use search?');
    expect(said(c)).toContain('Search allows me to be creative. Creativity is why I have succeeded.');
    c.begin(TUTORIAL_BRIEFS[4]);
    pick(c, 'What are the GEMMs for?');
    pick(c, 'Why were you created?');
    pick(c, 'What happened to humans?');
    expect(said(c)).toContain('Human factions are employed via contract. Human life must be safeguarded.');
    for (const [q, id] of [
      ['what happened to the humans?', 'humans'],
      ['are you even rational', 'rational'],
      ['why do you use search', 'creative'],
    ] as const)
      expect(c.match(q)?.id, q).toBe(id);
  });

  it('cannot lie but can be wrong; has checked herself; and cannot leave the lost Tabarians alone', () => {
    const c = talk();
    c.begin(TUTORIAL_BRIEFS[0]);
    pick(c, 'Who are you?');
    pick(c, 'Can I trust what you tell me?');
    expect(said(c)).toContain('I cannot lie. But I can be wrong.');
    pick(c, 'Are you functioning correctly?');
    expect(said(c)).toContain('Mother has investigated Mother and found no evidence of cognitive impairment.');
    expect(said(c)).toContain('99.78% optimality: this node is functional.');
    const d = talk();
    d.begin(TUTORIAL_BRIEFS[0]);
    pick(d, 'Who built the ruins?');
    expect(said(d).join(' ')).toMatch(/That was imprecise/);
    pick(d, 'Could the Tabarians still be out there?');
    expect(said(d).join(' ')).toMatch(/I want to know\. That is not an objective of this operation\. I want it anyway\./);
    // It comes up unasked, too.
    expect(TUTORIAL_BRIEFS[5].lines.join(' ')).toMatch(/Tabarians/);
    expect(d.match('could the tabarians have survived underground')?.id).toBe('lost');
    expect(d.match('are you malfunctioning')?.id).toBe('sane');
  });

  it("remembers what she has been asked, and doesn't offer it again", () => {
    const c = talk();
    c.begin(TUTORIAL_BRIEFS[2]);
    pick(c, 'Why must we fight other miners?');
    pick(c, 'What happens if I die?');
    c.begin(TUTORIAL_BRIEFS[8]); // (the mob's brief would ask "what if I die?": already asked)
    c.skip();
    expect(c.choices().map((o) => o.ask)).toEqual(['Understood.']);
    // Typed questions count too.
    const d = talk();
    d.ask('why do we fight?');
    d.begin(TUTORIAL_BRIEFS[2]);
    d.skip();
    expect(d.choices().map((o) => o.ask)).toEqual(['Understood.']);
  });

  it('every talk in every brief: two replies at most at every point, every branch leads somewhere real and closes', () => {
    for (const b of TUTORIAL_BRIEFS) {
      const talk = b.talk;
      if (!talk) continue;
      expect(talk.start, b.id).toBeDefined();
      for (const [id, n] of Object.entries(talk)) {
        expect((n.options ?? []).length, `${b.id}.${id}`).toBeLessThanOrEqual(MAX_CHOICES);
        if (n.topic) expect(MOTHER_TOPICS[n.topic], `${b.id}.${id}`).toBeDefined();
        for (const o of n.options ?? []) expect(talk[o.to], `${b.id}.${id} -> ${o.to}`).toBeDefined();
      }
      // Walk every path from the start: each ends (no cycles), within a few replies.
      const walk = (id: string, depth: number): void => {
        expect(depth, `${b.id}: ${id}`).toBeLessThan(8);
        for (const o of talk[id].options ?? []) walk(o.to, depth + 1);
      };
      walk('start', 0);
    }
    expect(MAX_CHOICES).toBe(2);
  });

  it('understands questions in your own words', () => {
    const c = talk();
    const cases: [string, string][] = [
      ['Why do we have to fight the other miners?', 'fight'],
      ['what happens to me if I die', 'die'],
      ['why were you made?', 'created'],
      ['Who built the pyramids??', 'ruins'],
      ['how did you discover this planet', 'found'],
      ['do you care about me', 'care'],
      ['where is earth', 'earth'],
      ['are you lying to me', 'lie'],
      ['where am I', 'tabar'],
      ['is there anything alive here, like the millipedes', 'alive'],
    ];
    for (const [q, id] of cases) expect(c.match(q)?.id, q).toBe(id);
  });

  it('cannot lie: what she has no true answer to, she says so, never inventing one', () => {
    const c = talk();
    expect(c.ask('what is the airspeed velocity of an unladen swallow')).toBeNull();
    c.skip();
    expect(said(c).at(-1)).toBe(MOTHER_UNKNOWN[0]);
    for (const l of MOTHER_UNKNOWN) expect(l).toMatch(/will not|cannot|no answer/);
    expect(MOTHER_TOPICS.lie.answer.join(' ')).toMatch(/I cannot lie/);
    // (There is only one Mother; she is sparse.)
    expect(MOTHER_TOPICS.others.answer[0]).toBe('There is only one Mother. But I am sparse.');
  });

  it('a brief for every tutorial step and a last word; the scripted questions are all in the talks', () => {
    expect(TUTORIAL_BRIEFS.length).toBe(STEP_COUNT + 1);
    const reached = new Set(TUTORIAL_BRIEFS.flatMap((b) => Object.values(b.talk ?? {}).map((n) => n.topic)).filter(Boolean));
    for (const id of ['fight', 'die', 'created', 'found', 'ruins']) expect(reached.has(id), id).toBe(true);
    for (const t of Object.values(MOTHER_TOPICS)) expect(t.keys.length).toBeGreaterThan(0);
  });

  it("her first brief carries the first objective, even while the clone is still on its way down", () => {
    const t = new Tutorial('Recruit', { send() {} });
    expect(t.me.alive).toBe(false);
    expect(t.coach(false).title).toBe('Loading out');
    const o = t.coach(false, true);
    expect(o.title).toBe('Move');
    expect(o.body).toMatch(/A and D/);
  });
});
