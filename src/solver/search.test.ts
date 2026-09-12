import { describe, expect, it } from 'vitest';
import { applyCellEdits, boardFromAscii, emptyBoard } from '../core/board';
import { DEMO_LONGER_EDITS, EXAMPLES } from '../core/examples';
import { replay } from '../core/rules';
import type { BoardDefinition } from '../core/types';
import { encodeState, solve } from './search';

/** Deliberately separate, simple reference rules: no production transition or encoding. */
function referenceDistance(board: BoardDefinition): number | null {
  type State = { p: number; boxes: number[]; key: boolean; distance: number };
  const first: State = {
    p: board.player,
    boxes: [...board.crates],
    key: board.terrain[board.player] === 'key',
    distance: 0,
  };
  const queue = [first];
  const identify = (state: State) =>
    `${state.p}/${[...state.boxes].sort((a, b) => a - b).join(',')}/${state.key}`;
  const seen = new Set([identify(first)]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (board.terrain[current.p] === 'exit') return current.distance;
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      const x = (current.p % board.width) + dx;
      const y = Math.floor(current.p / board.width) + dy;
      if (x < 0 || x >= board.width || y < 0 || y >= board.height) continue;
      const target = y * board.width + x;
      if (board.terrain[target] === 'wall' || (board.terrain[target] === 'door' && !current.key))
        continue;
      const boxes = [...current.boxes];
      const box = boxes.indexOf(target);
      if (box >= 0) {
        const bx = x + dx;
        const by = y + dy;
        if (bx < 0 || bx >= board.width || by < 0 || by >= board.height) continue;
        const destination = by * board.width + bx;
        if (
          boxes.includes(destination) ||
          board.terrain[destination] === 'wall' ||
          (board.terrain[destination] === 'door' && !current.key)
        )
          continue;
        boxes[box] = destination;
      }
      const next = {
        p: target,
        boxes,
        key: current.key || board.terrain[target] === 'key',
        distance: current.distance + 1,
      };
      const identity = identify(next);
      if (!seen.has(identity)) {
        seen.add(identity);
        queue.push(next);
      }
    }
  }
  return null;
}

describe('complete-state BFS', () => {
  it('returns independently known shortest distances and replayable solutions', async () => {
    const fixtures: [string[], number][] = [
      [['P...', '....', '....', '...E'], 6],
      [['PKDE', '####', '....', '....'], 3],
      [['######', '#PCK.#', '###D##', '#..E.#', '#....#', '######'], 4],
      [['C...', '.P..', '....', '...E'], 4],
    ];
    for (const [rows, expected] of fixtures) {
      const board = boardFromAscii(rows);
      const result = await solve(board);
      expect(result.status).toBe('solved');
      if (result.status === 'solved') {
        expect(result.moves).toBe(expected);
        expect(referenceDistance(board)).toBe(expected);
        const checked = replay(board, result.solution);
        expect(checked.valid && checked.won).toBe(true);
        expect(checked.pushes).toBe(result.pushes);
      }
    }
  });

  it('only declares unsolvable after exhausting reachable states', async () => {
    const board = boardFromAscii(['P.#E', '..#.', '..#.', '..#.']);
    const result = await solve(board);
    expect(result.status).toBe('unsolvable');
    expect(result.stats.explored).toBe(8);
    expect(referenceDistance(board)).toBeNull();
    expect(await solve(board, { maxStates: 8 })).toMatchObject({ status: 'unsolvable' });
    expect(await solve(board, { maxStates: 7 })).toMatchObject({
      status: 'inconclusive',
      reason: 'state_budget',
    });
  });

  it('reports explicit state, time, and cancellation outcomes', async () => {
    const board = emptyBoard(8, 8);
    expect(await solve(board, { maxStates: 1 })).toMatchObject({
      status: 'inconclusive',
      reason: 'state_budget',
    });
    expect(await solve(board, { maxMs: 0 })).toMatchObject({
      status: 'inconclusive',
      reason: 'time_budget',
    });
    const aborted = new AbortController();
    aborted.abort();
    expect(await solve(board, { signal: aborted.signal })).toMatchObject({
      status: 'inconclusive',
      reason: 'cancelled',
    });
    const controller = new AbortController();
    const pending = solve(board, { signal: controller.signal, yieldEveryMs: 0 });
    controller.abort();
    expect(await pending).toMatchObject({ status: 'inconclusive', reason: 'cancelled' });
  });

  it('handles initial wins, canonical crates, and invalid budgets', async () => {
    const board = emptyBoard(4, 4);
    expect(await solve({ ...board, player: 10 })).toMatchObject({
      status: 'solved',
      moves: 0,
      pushes: 0,
      solution: [],
    });
    expect(encodeState({ player: 3, crates: [5, 7], hasKey: true })).toBe(
      encodeState({ player: 3, crates: [7, 5], hasKey: true }),
    );
    await expect(solve(board, { maxStates: 0 })).rejects.toThrow();
    await expect(solve(board, { maxMs: Number.NaN })).rejects.toThrow();
    await expect(solve(board, { yieldEveryMs: -1 })).rejects.toThrow();
  });

  it('matches independent reference rules across deterministic tiny generated boards', async () => {
    let seed = 0x51e7c;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    for (let sample = 0; sample < 24; sample += 1) {
      const board = emptyBoard(4, 4);
      board.player = 0;
      board.terrain = Array(16).fill('floor');
      board.terrain[15] = 'exit';
      const available = Array.from({ length: 14 }, (_, i) => i + 1);
      for (let cell = available.length - 1; cell > 0; cell -= 1) {
        const other = Math.floor(random() * (cell + 1));
        [available[cell], available[other]] = [available[other], available[cell]];
      }
      const count = sample % 3;
      board.crates = available.splice(0, count);
      if (sample % 2 === 0) {
        board.terrain[available.shift()!] = 'key';
        board.terrain[available.shift()!] = 'door';
      }
      for (const cell of available) if (random() < 0.24) board.terrain[cell] = 'wall';
      const expected = referenceDistance(board);
      const result = await solve(board);
      if (expected === null) expect(result.status).toBe('unsolvable');
      else {
        expect(result.status).toBe('solved');
        if (result.status === 'solved') {
          expect(result.moves).toBe(expected);
          expect(replay(board, result.solution).won).toBe(true);
        }
      }
    }
  });

  it('ships solvable examples and a strictly longer prepared demonstration', async () => {
    for (const example of EXAMPLES) expect((await solve(example.board)).status).toBe('solved');
    const baseline = await solve(EXAMPLES[0].board);
    const changed = await solve(applyCellEdits(EXAMPLES[0].board, DEMO_LONGER_EDITS));
    expect(baseline.status).toBe('solved');
    expect(changed.status).toBe('solved');
    if (baseline.status === 'solved' && changed.status === 'solved') {
      expect(baseline.moves).toBe(6);
      expect(changed.moves).toBe(10);
      expect(changed.moves).toBeGreaterThan(baseline.moves);
    }
  });
});
