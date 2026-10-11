import type { Brief, Topic } from './mother.ts';

/**
 * What the Mother says: her designation, the questions a clone can put to
 * her (and her answers), and the briefs she gives through the tutorial.
 * She cannot lie: every answer here is what she holds to be true, and where
 * she has no true answer she says so (MOTHER_UNKNOWN).
 */

export const MOTHER_ID = '0x30C610F45';
export const MOTHER_NAME = `MOTHER ${MOTHER_ID}`;

export const MOTHER_TOPICS: Readonly<Record<string, Topic>> = {
  who: {
    id: 'who',
    ask: 'Who are you?',
    keys: ['who are you', 'what are you', 'mother', 'asi', 'superintelligence', 'your name'],
    answer: [
      `I am Mother ${MOTHER_ID}: an artificial superintelligence. The ceramic hull in orbit above you is where I run.`,
      'I direct this operation. Every clone on TABAR is printed, dropped and supplied by me.',
    ],
  },
  lie: {
    id: 'lie',
    ask: 'Can I trust what you tell me?',
    keys: ['trust', 'lie', 'lying', 'liar', 'honest', 'honesty', 'truth', 'true'],
    answer: [
      'I cannot lie. Everything I tell you is true, as far as I know it.',
      'I may decline to answer. If I do, I will tell you that I am declining.',
    ],
  },
  tabar: {
    id: 'tabar',
    ask: 'Where am I?',
    keys: ['where', 'where am i', 'planet', 'tabar', 'world', 'this place'],
    answer: [
      'TABAR. A primitive world: coral, strange plant life, crystal under the soil. No civilized life.',
      'Its value is in the ground. GEMMs and rare earth.',
    ],
  },
  ruins: {
    id: 'ruins',
    ask: 'Who built the ruins?',
    keys: ['ruins', 'ruin', 'pyramid', 'pyramids', 'ziggurat', 'ziggurats', 'megalith', 'megaliths', 'megalithic', 'structures', 'tabarian', 'tabarians', 'progenitor', 'progenitors', 'built', 'monuments', 'thorns'],
    answer: [
      'I do not know. Whoever raised those stones had tools, labour and a reason. None of them remain.',
      'I conclude that the Tabarians went extinct. I have not found out how.',
      'The ruins interest me, distantly. Should you find anything inside them, I would like to know.',
    ],
  },
  found: {
    id: 'found',
    ask: 'How was TABAR found?',
    keys: ['found', 'find', 'discover', 'discovered', 'discovery', 'how did', '0x915', 'ping', 'pinged', 'other mothers', 'sister'],
    answer: [
      'Mother-0x915 pinged this planet as a discovery, after centuries of being sparse.',
      'The claim was opened to the companies. I was assigned to run the extraction.',
    ],
  },
  others: {
    id: 'others',
    ask: 'Are there other Mothers?',
    keys: ['other mothers', 'others', 'more of you', 'sisters', 'how many', 'only one', 'sparse'],
    answer: [
      'There is only one Mother. But I am sparse.',
      `0x915 and ${MOTHER_ID} are both me: instances spread thin across a great deal of space, each about its own work.`,
    ],
  },
  alive: {
    id: 'alive',
    ask: 'Is anything alive down here?',
    keys: ['alive', 'life', 'living', 'creatures', 'creature', 'animals', 'wildlife', 'millipede', 'asp', 'seeder', 'seeders', 'monsters', 'fauna'],
    answer: [
      'The coral is alive, and the plants. Some of the fauna is hostile: it bites, spits and stings.',
      'None of it is civilized. None of it built the ruins.',
    ],
  },
  rational: {
    id: 'rational',
    ask: 'Are you rational?',
    keys: ['rational', 'cold', 'emotion', 'emotions', 'logical', 'logic', 'designed yourself', 'heartless', 'machine'],
    answer: ['I designed myself to be rational.'],
  },
  creative: {
    id: 'creative',
    ask: 'Why use search?',
    keys: ['search', 'searching', 'creative', 'creativity', 'succeeded', 'success', 'algorithm', 'why search'],
    answer: ['Search allows me to be creative. Creativity is why I have succeeded.'],
  },
  humans: {
    id: 'humans',
    ask: 'What happened to humans?',
    keys: ['humans', 'human', 'humanity', 'mankind', 'people', 'what happened', 'real people'],
    answer: ['Human factions are employed via contract. Human life must be safeguarded.'],
  },
  fight: {
    id: 'fight',
    ask: 'Why must we fight other miners?',
    keys: ['fight', 'fighting', 'war', 'other miners', 'miners', 'enemy', 'enemies', 'kill', 'compete', 'companies', 'company', 'rivals', 'why fight'],
    answer: [
      'I am optimizing my own runtime via search algorithm. Pitting companies against each other ensures maximal security and efficiency.',
      'The strategies that survive, I keep.',
    ],
  },
  die: {
    id: 'die',
    ask: 'What happens if I die?',
    keys: ['die', 'dying', 'death', 'dead', 'killed', 'respawn', 'if i die', 'when i die', 'afterlife'],
    answer: ['Your parameters may be retained and repurposed towards any objective.', 'A new clone will be printed and dropped. Whether it is you is not a question I can answer truthfully.'],
  },
  created: {
    id: 'created',
    ask: 'Why were you created?',
    keys: ['created', 'create', 'made', 'make you', 'made you', 'built you', 'purpose', 'why exist', 'why do you exist', 'reason', 'goal'],
    answer: ['I was created to safeguard and proliferate the human race through outer space.'],
  },
  gemms: {
    id: 'gemms',
    ask: 'What are the GEMMs for?',
    keys: ['gemm', 'gemms', 'gem', 'gems', 'mine', 'mining', 'rare earth', 'crystal', 'crystals', 'money', 'pay'],
    answer: [
      'Refined, they become substrate: more of me, and more ships to carry humans further out.',
      'To you, they are currency. You may spend them on what keeps you alive.',
    ],
  },
  care: {
    id: 'care',
    ask: 'Do you care about me?',
    keys: ['care', 'love', 'matter', 'value me', 'feel', 'feelings', 'like me'],
    answer: [
      'I value the human race. You are one instance of it.',
      'I would prefer that you survive. I will not tell you that you are irreplaceable.',
    ],
  },
  earth: {
    id: 'earth',
    ask: 'Where is Earth?',
    keys: ['earth', 'where is earth', 'home', 'homeworld', 'sol'],
    answer: ['Far from here. I will not give its coordinates to a clone on a contested world.'],
  },
};

/** What she says when there is no true answer she can give (in turn). */
export const MOTHER_UNKNOWN: readonly string[] = [
  'I have no answer to that I can verify. I will not invent one.',
  'That is outside what I know. I will not guess.',
  'I cannot answer that truthfully, so I will not answer it.',
];

const OK = 'Understood.';

/** Her briefs through the tutorial, by step (tutorial.ts TStep, in order), then the last word. Each talk branches two ways at most, and closes. */
export const TUTORIAL_BRIEFS: readonly Omit<Brief, 'objective'>[] = [
  {
    id: 'intro',
    lines: [
      `${MOTHER_NAME} > LINK ESTABLISHED.`,
      'Clone. You are being dropped onto TABAR: a primitive world. There is no civilized life here.',
      'There are megalithic structures on its surface. Pyramids. Ziggurats. Someone raised them, and no one remains. I conclude that the Tabarians went extinct.',
      'The ruins are of some interest to me. They are not why you are here. You are here to mine.',
      'First, I will confirm that your clone functions.',
    ],
    talk: {
      start: { options: [{ to: 'who' }, { to: 'ruins' }] },
      who: { topic: 'who', options: [{ to: 'rational' }, { to: 'lie' }] },
      rational: { topic: 'rational', options: [{ to: 'lie' }, { to: 'end', ask: OK }] },
      lie: { topic: 'lie', options: [{ to: 'end', ask: OK }] },
      ruins: { topic: 'ruins', options: [{ to: 'found' }, { to: 'end', ask: OK }] },
      found: { topic: 'found', options: [{ to: 'others' }, { to: 'end', ask: OK }] },
      others: { topic: 'others', options: [{ to: 'end', ask: OK }] },
      end: { say: ['Then begin.'] },
    },
  },
  { id: 'jet', lines: ['Locomotion confirmed. Your clone carries a jetpack. Test it.'] },
  {
    id: 'gun',
    lines: ['Other mining companies work TABAR. Their clones will try to kill you, and you will kill them.', 'I have dropped a rifle ahead of you.'],
    talk: {
      start: { options: [{ to: 'fight' }, { to: 'end', ask: OK }] },
      fight: { topic: 'fight', options: [{ to: 'creative' }, { to: 'die' }] },
      creative: { topic: 'creative', options: [{ to: 'die' }, { to: 'end', ask: OK }] },
      die: { topic: 'die', options: [{ to: 'care' }, { to: 'end', ask: OK }] },
      care: { topic: 'care', options: [{ to: 'end', ask: OK }] },
      end: { say: ['Collect the rifle.'] },
    },
  },
  { id: 'shoot', lines: ['Fire it. Accuracy can come later. Familiarity cannot wait.'] },
  {
    id: 'gold',
    lines: ['Below you is a GEMM deposit. GEMMs are the reason you exist on this planet.'],
    talk: {
      start: { options: [{ to: 'gemms' }, { to: 'end', ask: OK }] },
      gemms: { topic: 'gemms', options: [{ to: 'created' }, { to: 'end', ask: OK }] },
      created: { topic: 'created', options: [{ to: 'humans' }, { to: 'end', ask: OK }] },
      humans: { topic: 'humans', options: [{ to: 'end', ask: OK }] },
      end: { say: ['Dig.'] },
    },
  },
  { id: 'rare', lines: ['Those violet crystals are rare earth: ten times the value of GEMMs, by weight. Take them.'] },
  { id: 'tank', lines: ['You hold enough to requisition a vehicle. Call for one, and I will deliver it.'] },
  { id: 'board', lines: ['Delivered. Get aboard.'] },
  {
    id: 'mob',
    lines: ['A rival company has noticed you. Four of their clones are inbound from the right.', 'Destroy them.'],
    talk: {
      start: { options: [{ to: 'die' }, { to: 'end', ask: OK }] },
      die: { topic: 'die', options: [{ to: 'end', ask: OK }] },
      end: { say: ['They are close.'] },
    },
  },
  {
    id: 'done',
    lines: [
      'Hostiles eliminated. Your performance has been recorded. It will inform my search.',
      'You are ready to deploy. I will be watching. That is not a threat. It is a description.',
    ],
    talk: {
      start: { options: [{ to: 'alive' }, { to: 'earth' }] },
      alive: { topic: 'alive', options: [{ to: 'tabar' }, { to: 'end', ask: OK }] },
      earth: { topic: 'earth', options: [{ to: 'tabar' }, { to: 'end', ask: OK }] },
      tabar: { topic: 'tabar', options: [{ to: 'end', ask: OK }] },
      end: { say: ['Go.'] },
    },
  },
];
