import type { BoardDefinition, Direction, GameState } from './types';

export type TransitionResult =
  { ok: true; state: GameState; pushed: boolean; won: boolean } | { ok: false; reason: string };

export function initialState(board: BoardDefinition): GameState {
  return {
    player: board.player,
    crates: [...board.crates].sort((a, b) => a - b),
    hasKey: board.terrain[board.player] === 'key',
    ...(board.rulesVersion >= 2 ? { collectedRelics: relicBit(board, board.player) } : {}),
    ...(board.rulesVersion === 3
      ? { hasBoots: board.terrain[board.player] === 'boots', doorOpened: false, dead: false }
      : {}),
  };
}

export function isWon(board: BoardDefinition, state: GameState): boolean {
  return (
    !state.dead &&
    board.terrain[state.player] === 'exit' &&
    (board.rulesVersion === 1 ||
      (state.collectedRelics ?? 0) === (1 << relicCells(board).length) - 1)
  );
}

export function relicCells(board: BoardDefinition): number[] {
  return board.terrain.flatMap((terrain, cell) => (terrain === 'relic' ? [cell] : []));
}

function relicBit(board: BoardDefinition, cell: number): number {
  if (board.terrain[cell] !== 'relic') return 0;
  let index = 0;
  for (let previous = 0; previous < cell; previous += 1)
    if (board.terrain[previous] === 'relic') index += 1;
  return 1 << index;
}

export function isRelicCollected(board: BoardDefinition, state: GameState, cell: number): boolean {
  return Boolean((state.collectedRelics ?? 0) & relicBit(board, cell));
}

export function collectedRelicCount(board: BoardDefinition, state: GameState): number {
  return relicCells(board).filter((cell) => isRelicCollected(board, state, cell)).length;
}

function neighbour(board: BoardDefinition, cell: number, direction: Direction): number {
  const x = cell % board.width;
  const y = Math.floor(cell / board.width);
  if (direction === 'up') return y > 0 ? cell - board.width : -1;
  if (direction === 'right') return x < board.width - 1 ? cell + 1 : -1;
  if (direction === 'down') return y < board.height - 1 ? cell + board.width : -1;
  if (direction === 'left') return x > 0 ? cell - 1 : -1;
  return -1;
}

function obstacle(board: BoardDefinition, cell: number, hasKey: boolean): string | null {
  if (cell < 0 || cell >= board.width * board.height)
    return 'The edge of the board blocks the way.';
  if (board.terrain[cell] === 'wall') return 'A wall blocks the way.';
  if (board.terrain[cell] === 'water') return 'Deep water blocks the way. Find a bridge.';
  if (board.terrain[cell] === 'door' && !hasKey) return 'Collect the key to unlock this door.';
  return null;
}

/** Shared by interactive play, exhaustive search, and solution replay. Never mutates inputs. */
export function transition(
  board: BoardDefinition,
  state: GameState,
  direction: Direction,
): TransitionResult {
  if (board.rulesVersion === 3) return expeditionTransition(board, state, direction);
  if (isWon(board, state))
    return { ok: false, reason: 'You reached the exit. Restart to play again.' };
  const target = neighbour(board, state.player, direction);
  const blocked = obstacle(board, target, state.hasKey);
  if (blocked) return { ok: false, reason: blocked };
  const crate = state.crates.indexOf(target);
  const crates = [...state.crates];
  if (crate !== -1) {
    const destination = neighbour(board, target, direction);
    const crateBlocked = obstacle(board, destination, state.hasKey);
    if (crateBlocked) return { ok: false, reason: crateBlocked };
    if (crates.includes(destination))
      return { ok: false, reason: 'Only one crate can be pushed at a time.' };
    crates[crate] = destination;
    crates.sort((a, b) => a - b);
  }
  const next: GameState = {
    player: target,
    crates,
    hasKey: state.hasKey || board.terrain[target] === 'key',
  };
  if (board.rulesVersion === 2) {
    next.collectedRelics = (state.collectedRelics ?? 0) | relicBit(board, target);
    // One input crosses an ice run. Sliding stops at a crate; momentum never auto-pushes it.
    // Each step stays in the same direction on this finite, non-wrapping grid.
    while (board.terrain[next.player] === 'ice') {
      const slideTarget = neighbour(board, next.player, direction);
      if (obstacle(board, slideTarget, next.hasKey) || crates.includes(slideTarget)) break;
      next.player = slideTarget;
      next.hasKey ||= board.terrain[slideTarget] === 'key';
      next.collectedRelics |= relicBit(board, slideTarget);
    }
  }
  return { ok: true, state: next, pushed: crate !== -1, won: isWon(board, next) };
}

function expeditionObstacle(
  board: BoardDefinition,
  cell: number,
  state: GameState,
  crate: boolean,
): string | null {
  if (cell < 0 || cell >= board.terrain.length) return 'The edge of the board blocks the way.';
  const terrain = board.terrain[cell];
  if (terrain === 'wall') return 'A wall blocks the way.';
  if (crate && (terrain === 'water' || terrain === 'spikes'))
    return 'Crates cannot cover deep water or spikes. Find a safe route for the crate.';
  if (terrain === 'door' && !state.doorOpened) {
    if (crate) return 'Open the gate yourself before pushing a crate through it.';
    if (!state.hasKey) return 'Collect the key to unlock this door.';
  }
  return null;
}

/** Version 3 deliberately has a separate transition branch to preserve historical shared boards. */
function expeditionTransition(
  board: BoardDefinition,
  state: GameState,
  direction: Direction,
): TransitionResult {
  if (state.dead)
    return { ok: false, reason: 'Your expedition ended. Undo or restart to try again.' };
  if (isWon(board, state))
    return { ok: false, reason: 'You reached the exit. Restart to play again.' };
  const target = neighbour(board, state.player, direction);
  const blocked = expeditionObstacle(board, target, state, false);
  if (blocked) return { ok: false, reason: blocked };
  const crates = [...state.crates];
  const crate = crates.indexOf(target);
  if (crate !== -1) {
    const destination = neighbour(board, target, direction);
    const crateBlocked = expeditionObstacle(board, destination, state, true);
    if (crateBlocked) return { ok: false, reason: crateBlocked };
    if (crates.includes(destination))
      return { ok: false, reason: 'Only one crate can be pushed at a time.' };
    crates[crate] = destination;
    crates.sort((a, b) => a - b);
  }
  const next: GameState = {
    player: target,
    crates,
    hasKey: state.hasKey,
    collectedRelics: state.collectedRelics ?? 0,
    hasBoots: state.hasBoots ?? false,
    doorOpened: state.doorOpened ?? false,
    dead: false,
  };
  const enter = (cell: number) => {
    next.player = cell;
    const terrain = board.terrain[cell];
    if (terrain === 'key' && !next.doorOpened) next.hasKey = true;
    if (terrain === 'boots') next.hasBoots = true;
    if (terrain === 'door' && !next.doorOpened) {
      next.hasKey = false;
      next.doorOpened = true;
    }
    next.collectedRelics! |= relicBit(board, cell);
    if (terrain === 'water' || (terrain === 'spikes' && !next.hasBoots)) {
      next.dead = true;
      next.deathCause = terrain;
    }
  };
  enter(target);
  while (!next.dead && board.terrain[next.player] === 'ice') {
    const slideTarget = neighbour(board, next.player, direction);
    if (expeditionObstacle(board, slideTarget, next, false) || crates.includes(slideTarget)) break;
    enter(slideTarget);
  }
  return { ok: true, state: next, pushed: crate !== -1, won: isWon(board, next) };
}

export function replay(
  board: BoardDefinition,
  directions: readonly Direction[],
): { valid: boolean; state: GameState; moves: number; pushes: number; won: boolean } {
  let state = initialState(board);
  let pushes = 0;
  let moves = 0;
  for (const direction of directions) {
    const result = transition(board, state, direction);
    if (!result.ok) return { valid: false, state, moves, pushes, won: isWon(board, state) };
    state = result.state;
    moves += 1;
    if (result.pushed) pushes += 1;
  }
  return { valid: true, state, moves, pushes, won: isWon(board, state) };
}
