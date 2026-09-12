import { initialState, transition } from './rules';
import { DIRECTIONS, type BoardDefinition, type Direction } from './types';

export const COMPASS = { up: 'North', right: 'East', down: 'South', left: 'West' };

/** Turning is a camera action; recorded moves remain absolute board directions. */
export function relativeDirection(facing: Direction, quarterTurns: number): Direction {
  return DIRECTIONS[(((DIRECTIONS.indexOf(facing) + quarterTurns) % 4) + 4) % 4];
}

export function startingFacing(board: BoardDefinition): Direction {
  const state = initialState(board);
  return (
    (['right', 'down', 'up', 'left'] as Direction[]).find((direction) => {
      const outcome = transition(board, state, direction);
      return outcome.ok && !outcome.state.dead;
    }) ?? 'up'
  );
}

export function cellAhead(board: BoardDefinition, cell: number, facing: Direction): number | null {
  const x = cell % board.width;
  const y = Math.floor(cell / board.width);
  const nextX = x + (facing === 'right' ? 1 : facing === 'left' ? -1 : 0);
  const nextY = y + (facing === 'down' ? 1 : facing === 'up' ? -1 : 0);
  return nextX < 0 || nextX >= board.width || nextY < 0 || nextY >= board.height
    ? null
    : nextY * board.width + nextX;
}
