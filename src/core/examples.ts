import { boardFromAscii } from './board';
import type { BoardDefinition, CellEdit } from './types';

export const EXAMPLES: {
  id: string;
  title: string;
  description: string;
  board: BoardDefinition;
}[] = [
  {
    id: 'little-escape',
    title: 'The little escape',
    description: 'A key, a crate, and a way out. A small adventure with room for a detour.',
    board: boardFromAscii(['######', '#P.K.#', '#.C#.#', '#..D.#', '#.#.E#', '######']),
  },
  {
    id: 'key-under-cover',
    title: 'Under cover',
    description: 'Push the crate over the key, then uncover it to open the only way out.',
    board: boardFromAscii(['######', '#PCK.#', '###D##', '#..E.#', '#....#', '######']),
  },
  {
    id: 'two-company',
    title: 'Two’s company',
    description: 'Two crates share a winding little room. Find a route without boxing yourself in.',
    board: boardFromAscii([
      '#######',
      '#P..#E#',
      '#.C.#.#',
      '#...D.#',
      '#.C.K.#',
      '#.....#',
      '#######',
    ]),
  },
];

/** A transparent, prepared demo fallback; this is never represented as a live AI response. */
export const DEMO_LONGER_EDITS: CellEdit[] = [{ cell: 10, terrain: 'wall', occupant: 'none' }];
