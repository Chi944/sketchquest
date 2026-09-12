import { describe, expect, it } from 'vitest';
import { boardFromAscii, parseBoard } from '../core/board';
import { EXPEDITIONS } from '../core/examples';
import { replay } from '../core/rules';
import { encodeState, solve } from './search';

describe('survival-aware exhaustive search', () => {
  it('distinguishes equipment and permanently opened gates without colliding with relic or crate bits', () => {
    const codes = new Set<number>();
    for (const hasBoots of [false, true])
      for (const doorOpened of [false, true])
        for (const hasKey of [false, true])
          for (let collectedRelics = 0; collectedRelics < 16; collectedRelics++)
            codes.add(
              encodeState({
                player: 63,
                crates: [60, 61, 62],
                hasKey,
                collectedRelics,
                hasBoots,
                doorOpened,
              }),
            );
    expect(codes.size).toBe(128);
    expect([...codes].every((value) => value >= 0 && value <= 0x7fffffff)).toBe(true);
  });

  it('prunes fatal water and spike paths and finds a longer safe detour', async () => {
    const water = boardFromAscii(['P~.E', '....', '....', '....'], 3);
    const result = await solve(water);
    expect(result).toMatchObject({ status: 'solved', moves: 5 });
    if (result.status === 'solved')
      expect(replay(water, result.solution)).toMatchObject({ won: true, state: { dead: false } });
    expect(await solve(boardFromAscii(['PS.E', '####', '....', '....'], 3))).toMatchObject({
      status: 'unsolvable',
      stats: { explored: 1 },
    });
    expect(await solve(boardFromAscii(['P~.E', '####', '....', '....'], 3))).toMatchObject({
      status: 'unsolvable',
      stats: { explored: 1 },
    });
  });

  it('solves every authored expedition with required gates, equipment, relics and crate pushes', async () => {
    const expected = [10, 18, 9, 24, 8, 25];
    for (const [index, expedition] of EXPEDITIONS.entries()) {
      const board = parseBoard(expedition.board);
      expect(board.rulesVersion).toBe(3);
      const result = await solve(board);
      expect(result).toMatchObject({ status: 'solved', moves: expected[index] });
      if (result.status !== 'solved') throw new Error(expedition.title);
      const checked = replay(board, result.solution);
      expect(checked).toMatchObject({ valid: true, won: true, state: { dead: false } });
      if (board.crates.length) expect(result.pushes).toBeGreaterThan(0);
      if (board.terrain.includes('door')) {
        expect(checked.state).toMatchObject({ hasKey: false, doorOpened: true });
        // Closing the only gate permanently makes required progress impossible.
        const sealed = parseBoard({
          ...board,
          terrain: board.terrain.map((terrain) => (terrain === 'door' ? 'wall' : terrain)),
        });
        expect(await solve(sealed)).toMatchObject({ status: 'unsolvable' });
      }
      if (board.terrain.includes('boots')) {
        expect(checked.state.hasBoots).toBe(true);
        const unequipped = parseBoard({
          ...board,
          terrain: board.terrain.map((terrain) => (terrain === 'boots' ? 'floor' : terrain)),
        });
        expect(await solve(unequipped)).toMatchObject({ status: 'unsolvable' });
      }
    }
  });

  it('retains declared inconclusive budgets for surviving states', async () => {
    expect(await solve(EXPEDITIONS[5].board, { maxStates: 1 })).toMatchObject({
      status: 'inconclusive',
      reason: 'state_budget',
    });
    expect(await solve(EXPEDITIONS[5].board, { maxMs: 0 })).toMatchObject({
      status: 'inconclusive',
      reason: 'time_budget',
    });
  });
});
