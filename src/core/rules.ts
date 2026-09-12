import type { BoardDefinition, Direction, GameState } from './types';

export type TransitionResult =
  { ok: true; state: GameState; pushed: boolean; won: boolean } | { ok: false; reason: string };

export function initialState(board: BoardDefinition): GameState {
  return {
    player: board.player,
    crates: [...board.crates].sort((a, b) => a - b),
    hasKey: board.terrain[board.player] === 'key',
  };
}

export function isWon(board: BoardDefinition, state: GameState): boolean {
  return board.terrain[state.player] === 'exit';
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
  if (board.terrain[cell] === 'door' && !hasKey) return 'Collect the key to unlock this door.';
  return null;
}

/** Shared by interactive play, exhaustive search, and solution replay. Never mutates inputs. */
export function transition(
  board: BoardDefinition,
  state: GameState,
  direction: Direction,
): TransitionResult {
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
  const next = { player: target, crates, hasKey: state.hasKey || board.terrain[target] === 'key' };
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
