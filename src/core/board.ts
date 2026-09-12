import {
  TERRAINS,
  LEGACY_TERRAINS,
  type BoardDefinition,
  type CellEdit,
  type RuleIssue,
  type Terrain,
  type Tool,
} from './types.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isTerrain = (value: unknown): value is Terrain =>
  typeof value === 'string' && (TERRAINS as readonly string[]).includes(value);
const validSize = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 4 && (value as number) <= 8;

/** Structural rule errors only. Disconnected areas can be valid and are assessed by the solver. */
export function validateBoard(input: unknown): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const add = (code: string, message: string, cells: number[] = []) =>
    issues.push({ code, message, cells });
  if (!isRecord(input))
    return [{ code: 'board_type', message: 'The board must be an object.', cells: [] }];
  if (input.schemaVersion !== 1) add('schema_version', 'This board format is not supported.');
  if (input.rulesVersion !== 1 && input.rulesVersion !== 2)
    add('rules_version', 'This rules version is not supported.');
  if (!validSize(input.width) || !validSize(input.height))
    add('dimensions', 'Boards must be between 4 × 4 and 8 × 8.');
  const size = validSize(input.width) && validSize(input.height) ? input.width * input.height : 0;
  const inBounds = (value: unknown): value is number =>
    Number.isInteger(value) && (value as number) >= 0 && (value as number) < size;
  if (!Array.isArray(input.terrain) || input.terrain.length !== size || size === 0) {
    add('terrain_length', 'The terrain must contain exactly one value for each cell.');
  }
  if (Array.isArray(input.terrain)) {
    const bad: number[] = [];
    Array.from(input.terrain).forEach((value, index) => {
      if (
        !isTerrain(value) ||
        (input.rulesVersion === 1 && !(LEGACY_TERRAINS as readonly unknown[]).includes(value))
      )
        bad.push(index);
    });
    if (bad.length)
      add(
        'terrain_type',
        'Every terrain cell must use a supported symbol for this rules version.',
        bad,
      );
    const cellsFor = (terrain: Terrain) =>
      (input.terrain as unknown[]).flatMap((value, index) => (value === terrain ? [index] : []));
    const exits = cellsFor('exit');
    const keys = cellsFor('key');
    const doors = cellsFor('door');
    const relics = cellsFor('relic');
    if (relics.length > 4)
      add('relic_count', 'An expedition can have at most four relics.', relics);
    if (exits.length !== 1) add('exit_count', 'A board needs exactly one exit.', exits);
    if (keys.length > 1) add('key_count', 'A board can have at most one key.', keys);
    if (doors.length > 1) add('door_count', 'A board can have at most one locked door.', doors);
    if (doors.length && !keys.length)
      add('door_requires_key', 'A locked door needs a key on the board.', doors);
  }
  if (!inBounds(input.player)) add('player', 'Place exactly one player inside the board.');
  if (!Array.isArray(input.crates)) {
    add('crates_type', 'Crates must be an array of cell positions.');
  } else {
    if (input.crates.length > (input.rulesVersion === 2 ? 3 : 2))
      add(
        'crate_count',
        input.rulesVersion === 2
          ? 'An expedition can have at most three crates.'
          : 'A board can have at most two crates.',
        input.crates.filter(inBounds),
      );
    if (Array.from(input.crates).some((cell) => !inBounds(cell)))
      add('crate_position', 'Every crate must be inside the board.');
    if (new Set(input.crates).size !== input.crates.length)
      add(
        'crate_overlap',
        'Two crates cannot occupy the same cell.',
        input.crates.filter(inBounds),
      );
    if (input.crates.includes(input.player))
      add(
        'player_overlap',
        'The player and a crate cannot occupy the same cell.',
        inBounds(input.player) ? [input.player] : [],
      );
  }
  if (Array.isArray(input.terrain)) {
    const terrain = input.terrain;
    const occupants = [input.player, ...(Array.isArray(input.crates) ? input.crates : [])].filter(
      inBounds,
    );
    const blocked = occupants.filter(
      (cell) => terrain[cell] === 'wall' || terrain[cell] === 'door' || terrain[cell] === 'water',
    );
    if (blocked.length)
      add(
        'blocked_start',
        'Players and crates cannot start on walls, water, or locked doors.',
        blocked,
      );
  }
  return issues;
}

/** Validate at every trust boundary, then copy only the supported public fields. */
export function parseBoard(input: unknown): BoardDefinition {
  const issues = validateBoard(input);
  if (issues.length) throw new Error(issues.map((issue) => issue.message).join(' '));
  const board = input as BoardDefinition;
  return {
    schemaVersion: 1,
    rulesVersion: board.rulesVersion,
    width: board.width,
    height: board.height,
    terrain: [...board.terrain],
    player: board.player,
    crates: [...board.crates].sort((a, b) => a - b),
  };
}

/** Exact canonical content identity, deliberately collision-free rather than cryptographic. */
export function boardHash(board: BoardDefinition): string {
  return JSON.stringify([
    board.schemaVersion,
    board.rulesVersion,
    board.width,
    board.height,
    board.terrain,
    board.player,
    [...board.crates].sort((a, b) => a - b),
  ]);
}

export function emptyBoard(width = 6, height = 6): BoardDefinition {
  if (!validSize(width) || !validSize(height))
    throw new Error('Boards must be between 4 × 4 and 8 × 8.');
  const terrain: Terrain[] = Array(width * height).fill('floor');
  terrain[(height - 2) * width + width - 2] = 'exit';
  return {
    schemaVersion: 1,
    rulesVersion: 1,
    width,
    height,
    terrain,
    player: width + 1,
    crates: [],
  };
}

export function boardFromAscii(rows: string[]): BoardDefinition {
  if (
    !rows.length ||
    !validSize(rows.length) ||
    !validSize(rows[0].length) ||
    rows.some((row) => row.length !== rows[0].length)
  )
    throw new Error('ASCII boards must be rectangular and between 4 × 4 and 8 × 8.');
  const board: BoardDefinition = {
    schemaVersion: 1,
    rulesVersion: rows.some((row) => /[~BIR]/.test(row)) ? 2 : 1,
    width: rows[0].length,
    height: rows.length,
    terrain: [],
    player: -1,
    crates: [],
  };
  const glyphs: Record<string, Terrain> = {
    '#': 'wall',
    '.': 'floor',
    P: 'floor',
    C: 'floor',
    K: 'key',
    D: 'door',
    E: 'exit',
    '~': 'water',
    B: 'bridge',
    I: 'ice',
    R: 'relic',
  };
  [...rows.join('')].forEach((glyph, cell) => {
    if (!(glyph in glyphs))
      throw new Error(`Unknown ASCII glyph ${JSON.stringify(glyph)} at cell ${cell}.`);
    board.terrain.push(glyphs[glyph]);
    if (glyph === 'P') {
      if (board.player !== -1) throw new Error('A board needs exactly one player.');
      board.player = cell;
    }
    if (glyph === 'C') board.crates.push(cell);
  });
  return parseBoard(board);
}

/** Literal patches may leave an invalid draft; acceptance must call validateBoard. */
export function applyCellEdits(board: BoardDefinition, edits: CellEdit[]): BoardDefinition {
  if (!Array.isArray(edits)) throw new Error('Edits must be an array.');
  const seen = new Set<number>();
  let incomingPlayers = 0;
  for (const edit of edits) {
    if (
      !isRecord(edit) ||
      !Number.isInteger(edit.cell) ||
      edit.cell < 0 ||
      edit.cell >= board.width * board.height ||
      !isTerrain(edit.terrain) ||
      !['none', 'player', 'crate'].includes(edit.occupant)
    )
      throw new Error('An edit contains an invalid cell, terrain, or occupant.');
    if (seen.has(edit.cell)) throw new Error('A proposal cannot edit the same cell twice.');
    seen.add(edit.cell);
    if (edit.occupant === 'player') incomingPlayers += 1;
  }
  if (incomingPlayers > 1) throw new Error('A proposal cannot place multiple players.');
  const result = {
    ...board,
    terrain: [...board.terrain],
    crates: board.crates.filter((cell) => !seen.has(cell)),
    player: seen.has(board.player) ? -1 : board.player,
  };
  for (const edit of edits) {
    result.terrain[edit.cell] = edit.terrain;
    if (!(LEGACY_TERRAINS as readonly string[]).includes(edit.terrain)) result.rulesVersion = 2;
    if (edit.occupant === 'player') result.player = edit.cell;
    if (edit.occupant === 'crate') result.crates.push(edit.cell);
  }
  result.crates.sort((a, b) => a - b);
  return result;
}

export function changedCells(a: BoardDefinition, b: BoardDefinition): number[] {
  if (a.width !== b.width || a.height !== b.height)
    return Array.from(
      { length: Math.max(a.width * a.height, b.width * b.height) },
      (_, cell) => cell,
    );
  return a.terrain.flatMap((terrain, cell) =>
    terrain !== b.terrain[cell] ||
    (a.player === cell) !== (b.player === cell) ||
    a.crates.includes(cell) !== b.crates.includes(cell)
      ? [cell]
      : [],
  );
}

/** Unique terrain symbols move; occupant tools preserve compatible underlying terrain. */
export function paintCell(board: BoardDefinition, cell: number, tool: Tool): BoardDefinition {
  if (tool === 'select') return board;
  if (!Number.isInteger(cell) || cell < 0 || cell >= board.terrain.length)
    throw new Error('Choose a cell inside the board.');
  const result = { ...board, terrain: [...board.terrain], crates: [...board.crates] };
  if (['water', 'bridge', 'ice', 'relic'].includes(tool)) result.rulesVersion = 2;
  if (tool === 'erase') {
    if (result.player === cell) result.player = -1;
    else if (result.crates.includes(cell))
      result.crates = result.crates.filter((crate) => crate !== cell);
    else result.terrain[cell] = 'floor';
    return result;
  }
  if (tool === 'player' || tool === 'crate') {
    if (
      result.terrain[cell] === 'wall' ||
      result.terrain[cell] === 'door' ||
      result.terrain[cell] === 'water'
    )
      result.terrain[cell] = 'floor';
    result.crates = result.crates.filter((crate) => crate !== cell);
    if (tool === 'player') result.player = cell;
    else {
      if (result.player === cell) result.player = -1;
      result.crates.push(cell);
    }
  } else {
    if (tool === 'exit' || tool === 'key' || tool === 'door')
      result.terrain = result.terrain.map((terrain) => (terrain === tool ? 'floor' : terrain));
    result.terrain[cell] = tool;
    if (tool === 'wall' || tool === 'door' || tool === 'water') {
      result.crates = result.crates.filter((crate) => crate !== cell);
      if (result.player === cell) result.player = -1;
    }
  }
  result.crates.sort((a, b) => a - b);
  return result;
}

/** Preserve the top-left cells. Cropped symbols remain missing for the editor to flag. */
export function resizeBoard(
  board: BoardDefinition,
  width: number,
  height: number,
): BoardDefinition {
  if (!validSize(width) || !validSize(height))
    throw new Error('Boards must be between 4 × 4 and 8 × 8.');
  const terrain: Terrain[] = Array(width * height).fill('floor');
  const remap = (cell: number) =>
    cell >= 0 && cell % board.width < width && Math.floor(cell / board.width) < height
      ? Math.floor(cell / board.width) * width + (cell % board.width)
      : -1;
  board.terrain.forEach((value, cell) => {
    const target = remap(cell);
    if (target >= 0) terrain[target] = value;
  });
  return {
    ...board,
    width,
    height,
    terrain,
    player: remap(board.player),
    crates: board.crates
      .map(remap)
      .filter((cell) => cell >= 0)
      .sort((a, b) => a - b),
  };
}
