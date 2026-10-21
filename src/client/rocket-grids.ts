/** The rockets in flight: their pixel grids and palette (data only, no DOM): drawn by rocket-art.ts. */

export type Grid = readonly string[];

/** Worn drab, rust and soot. */
export const PAL: Record<string, string> = {
  K: '#17130f', // outline
  O: '#626842', // olive paint
  o: '#454a2e', // olive, shaded
  h: '#848a5c', // olive, worn edge
  u: '#8a4a22', // rust
  U: '#b0602a', // rust, fresh
  R: '#a8301c', // red warhead
  r: '#641a10', // red, shaded
  g: '#3a3428', // fins, sooted metal
  s: '#2a2622', // soot
  w: '#c0b8a0', // stencil / rivet
  e: '#d8b030', // band
};

/** Bazooka rocket (an RPG's warhead): a fat rusty-red cone on a thin drab tube, four fins at the tail. 13x5. */
export const ROCKET: Grid = [
  '.KK.....KKK..',
  'KgsKKKKKrRRK.',
  'KgsOhOuOwRRRK',
  'KgsKKKKKrrRK.',
  '.KK.....KKK..',
];
/** AT missile: a drab finned body gone to rust in patches, the seeker head in front (it blinks red). 12x5. */
export const MISSILE: Grid = [
  '.KK......K..',
  'KgKKKKKKKKK.',
  'KgOhOuUOeOSK',
  'KgKKKKKKKKK.',
  '.KK......K..',
];
/** Tarantula missile: slim and drab, a yellow nose band. 9x3. */
export const DART: Grid = ['.KKKKKKK.', 'gsOuOOeRK', '.KKKKKKK.'];

/** Every grid here (tests: rectangular, every character in the palette; the missile's seeker 'S' is coloured as it blinks). */
export const ROCKET_GRIDS: readonly Grid[] = [ROCKET, MISSILE, DART];
export const ROCKET_PAL_KEYS = Object.keys(PAL).concat('S');
