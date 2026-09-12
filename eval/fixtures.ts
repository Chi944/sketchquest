/** Independently authored ASCII annotations. These are synthetic diagrams, not photographed handwriting. */
export const VALID_SKETCHES = [
  { id: 'dev-01-corner-path', split: 'dev', ascii: ['P..E', '.#..', '.C..', '....'] },
  { id: 'dev-02-key-lane', split: 'dev', ascii: ['.P#.', '.KD.', '.C..', '...E'] },
  { id: 'dev-03-small-court', split: 'dev', ascii: ['#####', '#P.K#', '#C#.#', '#..E#', '#####'] },
  { id: 'dev-04-two-boxes', split: 'dev', ascii: ['P....', '.#C#.', '..K..', '.C#D.', '....E'] },
  {
    id: 'dev-05-narrow-hall',
    split: 'dev',
    ascii: ['######', '#P...#', '#.##K#', '#C.D.#', '#...E#', '######'],
  },
  {
    id: 'dev-06-open-islands',
    split: 'dev',
    ascii: ['P...#.', '.#C...', '..#K..', '.C..#.', '.#D...', '.....E'],
  },
  {
    id: 'dev-07-long-court',
    split: 'dev',
    ascii: ['#######', '#P....#', '#.C##.#', '#..K..#', '##.D..#', '#....E#', '#######'],
  },
  {
    id: 'dev-08-large-field',
    split: 'dev',
    ascii: [
      'P.......',
      '.##..C..',
      '....#...',
      '..K.#...',
      '.C......',
      '...D.##.',
      '........',
      '.......E',
    ],
  },
  { id: 'dev-09-key-only', split: 'dev', ascii: ['P.K.', '.##.', '....', '.E..'] },
  { id: 'dev-10-box-path', split: 'dev', ascii: ['..P..', '.C#..', '.....', '..#C.', 'E....'] },
  { id: 'dev-11-wide-room', split: 'dev', ascii: ['P.....E', '.#C#...', '..K.D..', '.......'] },
  {
    id: 'dev-12-tall-room',
    split: 'dev',
    ascii: ['P...', '.C#.', '....', '.K..', '..D.', '#...', '...E'],
  },
  { id: 'heldout-01-left-exit', split: 'heldout', ascii: ['..#P', '.C..', '.#K.', 'E.D.'] },
  { id: 'heldout-02-central-player', split: 'heldout', ascii: ['E...', '..#.', '.PC.', '....'] },
  {
    id: 'heldout-03-crooked-room',
    split: 'heldout',
    ascii: ['#####', '#..P#', '#K#C#', '#ED.#', '#####'],
  },
  {
    id: 'heldout-04-crossing',
    split: 'heldout',
    ascii: ['..P..', 'C.#..', '.KD#.', '..#C.', '.E...'],
  },
  {
    id: 'heldout-05-bottom-start',
    split: 'heldout',
    ascii: ['######', '#E.D.#', '#.#K.#', '#.C..#', '#..P.#', '######'],
  },
  {
    id: 'heldout-06-scattered',
    split: 'heldout',
    ascii: ['.....P', '..C.#.', '.#..K.', '...#..', '.D.C#.', 'E.....'],
  },
  {
    id: 'heldout-07-key-pocket',
    split: 'heldout',
    ascii: ['#######', '#E....#', '#.##C.#', '#D..#.#', '#..K..#', '#....P#', '#######'],
  },
  {
    id: 'heldout-08-spacious',
    split: 'heldout',
    ascii: [
      '.......P',
      '..C.##..',
      '.#......',
      '....K#..',
      '...#....',
      '..C.D...',
      '.##.....',
      'E.......',
    ],
  },
  { id: 'heldout-09-collectible', split: 'heldout', ascii: ['E.#.', '....', '.K#.', '..P.'] },
  {
    id: 'heldout-10-separated',
    split: 'heldout',
    ascii: ['P.#.E', '..#..', 'C.#..', '..#C.', '..#..'],
  },
  {
    id: 'heldout-11-wide-bottom',
    split: 'heldout',
    ascii: ['...C..P', '.##.K..', '..D.#..', 'E......'],
  },
  {
    id: 'heldout-12-tall-bottom',
    split: 'heldout',
    ascii: ['E...', '.#D.', '..K.', 'C...', '..#.', '....', '...P'],
  },
] as const;

export const REJECTED_SKETCHES = [
  {
    id: 'reject-01-no-player',
    ascii: ['...E', '.C..', '....', '....'],
    reason: 'No player is drawn. Ask the user to place one.',
  },
  {
    id: 'reject-02-two-players',
    ascii: ['P..E', '..P.', '....', '....'],
    reason: 'Two player glyphs conflict. Ask which one is the start.',
  },
  {
    id: 'reject-03-no-exit',
    ascii: ['P...', '.C..', '....', '....'],
    reason: 'No exit is drawn. Ask the user to add an exit.',
  },
  {
    id: 'reject-04-two-exits',
    ascii: ['P...E', '..#..', '.C...', '.....', 'E....'],
    reason: 'Two exits conflict. Ask which exit is intended.',
  },
  {
    id: 'reject-05-key-missing',
    ascii: ['P...E', '..D..', '.#...', '.....', '.....'],
    reason: 'A locked door is drawn without a key. Request a key or removal of the door.',
  },
  {
    id: 'reject-06-overlap',
    ascii: ['@..E', '.#..', '....', '....'],
    reason:
      'A player and crate are superimposed in the same cell. Request a correction; do not silently choose one.',
  },
] as const;
