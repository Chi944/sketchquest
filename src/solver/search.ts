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
const KEY_BIT = 1 << 18;
const STATE_SPACE = 1 << 19;
const MAX_POSSIBLE_STATES = 249_984;

export function encodeState(state: GameState): number {
  const a = state.crates[0] ?? 0;
  const b = state.crates[1] ?? 0;
  const first = state.crates.length === 2 ? Math.min(a, b) : a;
  const second = state.crates.length === 2 ? Math.max(a, b) : 0;
  return state.player | (first << 6) | (second << 12) | (state.hasKey ? KEY_BIT : 0);
}

function decodeState(encoded: number, crateCount: number): GameState {
  return {
    player: encoded & 63,
    crates:
      crateCount === 2
        ? [(encoded >> 6) & 63, (encoded >> 12) & 63]
        : crateCount === 1
          ? [(encoded >> 6) & 63]
          : [],
    hasKey: Boolean(encoded & KEY_BIT),
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
  if (!Number.isInteger(maxStates) || maxStates < 1)
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
  const predecessor = new Int32Array(STATE_SPACE).fill(-1);
  const incoming = new Uint8Array(STATE_SPACE);
  const queue = new Uint32Array(Math.min(maxStates, MAX_POSSIBLE_STATES));
  const startCode = encodeState(start);
  predecessor[startCode] = startCode;
  queue[0] = startCode;
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
    const encoded = queue[head++];
    const state = decodeState(encoded, board.crates.length);
    explored += 1;
    if (isWon(board, state)) {
      const solution: Direction[] = [];
      for (let step = encoded; step !== startCode; step = predecessor[step])
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
      if (!result.ok) continue;
      const next = encodeState(result.state);
      if (predecessor[next] !== -1) continue;
      if (tail >= maxStates) return incomplete('state_budget');
      predecessor[next] = encoded;
      incoming[next] = direction;
      queue[tail++] = next;
    }
  }
  return { status: 'unsolvable', stats: stats() };
}
