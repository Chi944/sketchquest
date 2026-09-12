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

export type ExpeditionTheme = 'forest' | 'coast' | 'frost';
export interface Expedition {
  id: string;
  title: string;
  description: string;
  theme: ExpeditionTheme;
  difficulty: 'Trailhead' | 'Explorer' | 'Pathfinder';
  mechanics: string[];
  board: BoardDefinition;
}

/** Separate from the original examples so old imports and the 6→10 demo stay identical. */
export const EXPEDITIONS: Expedition[] = [
  {
    id: 'relic-grove',
    title: 'Relic grove',
    description: 'Follow the overgrown courtyard and recover both relics before you leave.',
    theme: 'forest',
    difficulty: 'Trailhead',
    mechanics: ['Relics', 'Crates'],
    board: boardFromAscii(['######', '#P.R.#', '#.##.#', '#C.R.#', '#...E#', '######']),
  },
  {
    id: 'wardens-gate',
    title: 'Warden’s gate',
    description:
      'A sealed passage divides the ruins. Find its key and recover relics on both sides.',
    theme: 'forest',
    difficulty: 'Explorer',
    mechanics: ['Relics', 'Locked gate', 'Three crates'],
    board: boardFromAscii([
      '#######',
      '#P.CK.#',
      '#R....#',
      '###D###',
      '#R.CC.#',
      '#...E.#',
      '#######',
    ]),
  },
  {
    id: 'tidal-crossing',
    title: 'Tidal crossing',
    description:
      'Two shores, one narrow bridge. Gather the relics without stepping into deep water.',
    theme: 'coast',
    difficulty: 'Trailhead',
    mechanics: ['Water', 'Bridge', 'Relics'],
    board: boardFromAscii(['######', '#P~R.#', '#.~..#', '#.B.E#', '#R~..#', '######']),
  },
  {
    id: 'smugglers-cove',
    title: 'Smuggler’s cove',
    description:
      'Explore three pockets of the coast, then unlock the final inlet with the brass key.',
    theme: 'coast',
    difficulty: 'Pathfinder',
    mechanics: ['Water', 'Bridges', 'Locked gate', 'Three relics'],
    board: boardFromAscii([
      '########',
      '#P.R~K.#',
      '#C..B..#',
      '#.~~B~~#',
      '#R..~R##',
      '#.#.~DE#',
      '#...B.##',
      '########',
    ]),
  },
  {
    id: 'frozen-footsteps',
    title: 'Frozen footsteps',
    description:
      'The ice carries you to the next safe footing. Plan each turn to collect both relics.',
    theme: 'frost',
    difficulty: 'Explorer',
    mechanics: ['Sliding ice', 'Relics'],
    board: boardFromAscii(['######', '#PIIR#', '#.#I.#', '#RII.#', '#..IE#', '######']),
  },
  {
    id: 'winter-vault',
    title: 'Winter vault',
    description:
      'Read the ice lanes, move the supply crates, and choose your crossing to the last relic.',
    theme: 'frost',
    difficulty: 'Pathfinder',
    mechanics: ['Sliding ice', 'Water', 'Bridge', 'Locked gate', 'Relics'],
    board: boardFromAscii([
      '########',
      '#PII.R.#',
      '#.#I#C.#',
      '#R.I.K.#',
      '#~~B~D##',
      '#CII.R.#',
      '#...I.E#',
      '########',
    ]),
  },
];
