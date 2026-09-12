import { parseBoard } from '../core/board';
import { initialState, isWon, replay, transition } from '../core/rules';
import {
  DIRECTIONS,
  type BoardDefinition,
  type Direction,
  type GameState,
  type SolverResult,
} from '../core/types';

export interface SolveOptions {
  maxStates?: number;
  maxMs?: number;
  signal?: AbortSignal;
  yieldEveryMs?: number;
}
const KEY_BIT = 1 << 24;
const RELIC_SHIFT = 25;
const BOOTS_BIT = 1 << 29;
const DOOR_BIT = 1 << 30;

export function encodeState(state: GameState): number {
  const crates = [...state.crates].sort((a, b) => a - b);
  return (
    state.player |
    ((crates[0] ?? 0) << 6) |
    ((crates[1] ?? 0) << 12) |
    ((crates[2] ?? 0) << 18) |
    (state.hasKey ? KEY_BIT : 0) |
    ((state.collectedRelics ?? 0) << RELIC_SHIFT) |
    (state.hasBoots ? BOOTS_BIT : 0) |
    (state.doorOpened ? DOOR_BIT : 0)
  );
}

function decodeState(
  encoded: number,
  crateCount: number,
  rulesVersion: BoardDefinition['rulesVersion'],
): GameState {
  return {
    player: encoded & 63,
    crates: Array.from({ length: crateCount }, (_, index) => (encoded >> ((index + 1) * 6)) & 63),
    hasKey: Boolean(encoded & KEY_BIT),
    ...(rulesVersion >= 2 ? { collectedRelics: (encoded >> RELIC_SHIFT) & 15 } : {}),
    ...(rulesVersion === 3
      ? {
          hasBoots: Boolean(encoded & BOOTS_BIT),
          doorOpened: Boolean(encoded & DOOR_BIT),
          dead: false,
        }
      : {}),
  };
}

/** BFS over full state. A discovered-state cap never turns a partial search into “unsolvable”. */
export async function solve(
  input: BoardDefinition,
  options: SolveOptions = {},
): Promise<SolverResult> {
  const started = performance.now();
  const board = parseBoard(input);
  const maxStates = options.maxStates ?? 250_000;
  const maxMs = options.maxMs ?? 5_000;
  const yieldEveryMs = options.yieldEveryMs ?? 12;
  if (!Number.isSafeInteger(maxStates) || maxStates < 1)
    throw new Error('maxStates must be a positive integer.');
  if (!Number.isFinite(maxMs) || maxMs < 0)
    throw new Error('maxMs must be a finite, non-negative number.');
  if (!Number.isFinite(yieldEveryMs) || yieldEveryMs < 0)
    throw new Error('yieldEveryMs must be a finite, non-negative number.');
  let explored = 0;
  const stats = () => ({ explored, elapsedMs: performance.now() - started });
  const incomplete = (reason: 'cancelled' | 'time_budget' | 'state_budget'): SolverResult => ({
    status: 'inconclusive',
    reason,
    stats: stats(),
  });
  if (options.signal?.aborted) return incomplete('cancelled');
  const start = initialState(board);
  if (isWon(board, start))
    return { status: 'solved', solution: [], moves: 0, pushes: 0, stats: stats() };
  if (maxMs === 0) return incomplete('time_budget');
  const startCode = encodeState(start);
  // Expedition state spaces must never allocate a dense 2^31 table.
  // Store only discovered states and retain the same explicit search budgets.
  const predecessor: number[] = [-1];
  const incoming: number[] = [-1];
  const queue: number[] = [startCode];
  const visited = new Map<number, number>([[startCode, 0]]);
  let head = 0;
  let tail = 1;
  let lastYield = performance.now();
  while (head < tail) {
    if (options.signal?.aborted) return incomplete('cancelled');
    const now = performance.now();
    if (now - started >= maxMs) return incomplete('time_budget');
    if (now - lastYield >= yieldEveryMs) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      lastYield = performance.now();
      if (options.signal?.aborted) return incomplete('cancelled');
      if (lastYield - started >= maxMs) return incomplete('time_budget');
    }
    const currentIndex = head++;
    const encoded = queue[currentIndex];
    const state = decodeState(encoded, board.crates.length, board.rulesVersion);
    explored += 1;
    if (isWon(board, state)) {
      const solution: Direction[] = [];
      for (let step = currentIndex; predecessor[step] !== -1; step = predecessor[step])
        solution.push(DIRECTIONS[incoming[step]]);
      solution.reverse();
      const checked = replay(board, solution);
      if (!checked.valid || !checked.won || checked.moves !== solution.length)
        throw new Error(
          'Solver verification failed: the returned path did not replay to the exit.',
        );
      return {
        status: 'solved',
        solution,
        moves: checked.moves,
        pushes: checked.pushes,
        stats: stats(),
      };
    }
    for (let direction = 0; direction < DIRECTIONS.length; direction += 1) {
      const result = transition(board, state, DIRECTIONS[direction]);
      if (!result.ok || result.state.dead) continue;
      const next = encodeState(result.state);
      if (visited.has(next)) continue;
      if (tail >= maxStates) return incomplete('state_budget');
      visited.set(next, tail);
      predecessor[tail] = currentIndex;
      incoming[tail] = direction;
      queue[tail++] = next;
    }
  }
  return { status: 'unsolvable', stats: stats() };
}
