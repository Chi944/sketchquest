import { describe, expect, it } from 'vitest';
import { boardFromAscii, validateBoard } from '../core/board';
import { CLASSIC_EXPEDITIONS as EXPEDITIONS } from '../core/examples';
import { collectedRelicCount, relicCells, replay } from '../core/rules';
import { encodeState, solve } from './search';

describe('expedition search state and campaign', () => {
  it('encodes every relic mask and all three crates without collisions', () => {
    const identities = new Set<number>();
    for (let third = 9; third < 64; third += 1)
      for (let relics = 0; relics < 16; relics += 1)
        for (const hasKey of [false, true])
          identities.add(
            encodeState({ player: 1, crates: [3, 7, third], hasKey, collectedRelics: relics }),
          );
    expect(identities.size).toBe(55 * 16 * 2);
    expect(encodeState({ player: 1, crates: [3, 7, 63], hasKey: true, collectedRelics: 15 })).toBe(
      encodeState({ player: 1, crates: [63, 3, 7], hasKey: true, collectedRelics: 15 }),
    );
  });

  it('counts an ice run as one input and revisits the same cell with a newly collected relic', async () => {
    expect(await solve(boardFromAscii(['PIIE', '####', '....', '....']))).toMatchObject({
      status: 'solved',
      moves: 1,
      solution: ['right'],
    });
    const gated = boardFromAscii(['PER.', '####', '....', '....']);
    expect(await solve(gated)).toMatchObject({
      status: 'solved',
      moves: 3,
      solution: ['right', 'right', 'left'],
    });
    expect(await solve(gated, { maxStates: 2 })).toMatchObject({
      status: 'inconclusive',
      reason: 'state_budget',
    });
  });

  it('reports isolated relics and blocked water crossings as unsolvable only after exhaustion', async () => {
    expect(await solve(boardFromAscii(['P.E#', '####', 'R...', '....']))).toMatchObject({
      status: 'unsolvable',
    });
    expect(await solve(boardFromAscii(['P~.E', '#~..', '#~..', '#~..']))).toMatchObject({
      status: 'unsolvable',
      stats: { explored: 1 },
    });
  });

  it('ships six bounded, replay-verified expeditions across three themes', async () => {
    expect(EXPEDITIONS).toHaveLength(6);
    expect(new Set(EXPEDITIONS.map((expedition) => expedition.id)).size).toBe(6);
    expect(new Set(EXPEDITIONS.map((expedition) => expedition.theme))).toEqual(
      new Set(['forest', 'coast', 'frost']),
    );
    const distances = [8, 15, 11, 25, 6, 13];
    for (const [index, expedition] of EXPEDITIONS.entries()) {
      expect(validateBoard(expedition.board)).toEqual([]);
      expect(expedition.board.rulesVersion).toBe(2);
      expect(expedition.board.width).toBeGreaterThanOrEqual(6);
      const result = await solve(expedition.board);
      expect(result.status).toBe('solved');
      if (result.status !== 'solved') throw new Error(`${expedition.id}: ${result.status}`);
      expect(result.moves).toBe(distances[index]);
      const checked = replay(expedition.board, result.solution);
      expect(checked).toMatchObject({
        valid: true,
        won: true,
        moves: result.moves,
        pushes: result.pushes,
      });
      expect(collectedRelicCount(expedition.board, checked.state)).toBe(
        relicCells(expedition.board).length,
      );
    }
  });
});
