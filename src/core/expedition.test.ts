import { describe, expect, it } from 'vitest';
import {
  applyCellEdits,
  boardFromAscii,
  emptyBoard,
  paintCell,
  parseBoard,
  resizeBoard,
  validateBoard,
} from './board';
import {
  collectedRelicCount,
  initialState,
  isRelicCollected,
  isWon,
  relicCells,
  replay,
  transition,
} from './rules';
import type { GameState } from './types';

describe('versioned expedition rules', () => {
  it('preserves legacy board and state shapes while rejecting expedition terrain labeled version 1', () => {
    const legacy = boardFromAscii(['P..E', '....', '....', '....']);
    expect(parseBoard(legacy).rulesVersion).toBe(1);
    expect(initialState(legacy)).toEqual({ player: 0, crates: [], hasKey: false });
    const expanded = boardFromAscii(['P~BE', '.IR.', '....', '....']);
    expect(parseBoard(expanded).rulesVersion).toBe(2);
    expect(initialState(expanded)).toEqual({
      player: 0,
      crates: [],
      hasKey: false,
      collectedRelics: 0,
    });
    expect(
      validateBoard({ ...expanded, rulesVersion: 1 }).some(
        (issue) => issue.code === 'terrain_type',
      ),
    ).toBe(true);
    expect(
      validateBoard({ ...expanded, rulesVersion: 3 }).some(
        (issue) => issue.code === 'rules_version',
      ),
    ).toBe(true);
  });

  it('blocks water for player and crates while allowing bridges for both', () => {
    const board = boardFromAscii(['P~BE', '....', '....', '....']);
    expect(transition(board, initialState(board), 'right')).toMatchObject({
      ok: false,
      reason: expect.stringContaining('water'),
    });
    const state: GameState = { player: 5, crates: [6], hasKey: false, collectedRelics: 0 };
    expect(transition(board, state, 'up').ok).toBe(false);
    expect(transition(board, { ...state, player: 10 }, 'up')).toMatchObject({
      ok: true,
      state: { player: 6, crates: [2] },
    });
    expect(transition(board, { ...state, player: 9, crates: [5] }, 'up').ok).toBe(false);
    expect(transition(board, { ...state, player: 6, crates: [] }, 'up')).toMatchObject({
      ok: true,
      state: { player: 2 },
    });
  });

  it('slides across ice to the first non-ice cell in one counted move', () => {
    const board = boardFromAscii(['PIIE', '####', '....', '....']);
    expect(replay(board, ['right'])).toEqual({
      valid: true,
      state: { player: 3, crates: [], hasKey: false, collectedRelics: 0 },
      moves: 1,
      pushes: 0,
      won: true,
    });
    const key = boardFromAscii(['PIIK', '###D', '...E', '....']);
    expect(replay(key, ['right', 'down', 'down'])).toMatchObject({
      valid: true,
      won: true,
      moves: 3,
      state: { hasKey: true },
    });
  });

  it('stops on ice before boundaries, walls, water, or locked doors without wrapping rows', () => {
    for (const rows of [
      ['PII#', '...E', '....', '....'],
      ['PII~', '...E', '....', '....'],
      ['PIID', '..KE', '....', '....'],
      ['PIII', '...E', '....', '....'],
    ]) {
      const board = boardFromAscii(rows);
      const moved = transition(board, initialState(board), 'right');
      expect(moved).toMatchObject({ ok: true, state: { player: rows[0] === 'PIII' ? 3 : 2 } });
      if (moved.ok) expect(transition(board, moved.state, 'right').ok).toBe(false);
    }
  });

  it('never automatically pushes a crate during a slide; a later input pushes it exactly one cell', () => {
    const board = boardFromAscii(['PIIC.E', '......', '......', '......']);
    const first = transition(board, initialState(board), 'right');
    expect(first).toEqual({
      ok: true,
      state: { player: 2, crates: [3], hasKey: false, collectedRelics: 0 },
      pushed: false,
      won: false,
    });
    if (!first.ok) throw new Error('Expected a legal slide.');
    expect(transition(board, first.state, 'right')).toMatchObject({
      ok: true,
      state: { player: 3, crates: [4] },
      pushed: true,
    });
    const ontoIce = boardFromAscii(['PCI.E.', '......', '......', '......']);
    expect(transition(ontoIce, initialState(ontoIce), 'right')).toMatchObject({
      ok: true,
      state: { player: 1, crates: [2] },
      pushed: true,
    });
    expect(ontoIce.crates).toEqual([1]);
  });

  it('can stop and change direction on ice when the previous direction was blocked', () => {
    const board = boardFromAscii(['PII#', '..I.', '..E.', '....']);
    expect(replay(board, ['right', 'down'])).toMatchObject({
      valid: true,
      won: true,
      moves: 2,
      state: { player: 10 },
    });
    const startsOnIce = { ...board, player: 1 };
    expect(initialState(startsOnIce).player).toBe(1);
    expect(transition(startsOnIce, initialState(startsOnIce), 'down')).toMatchObject({
      ok: true,
      state: { player: 5 },
    });
  });

  it('requires every relic to win, retains collected relics, and permits leaving an incomplete exit', () => {
    const board = boardFromAscii(['PER.', '####', '....', '....']);
    const arrived = replay(board, ['right']);
    expect(arrived).toMatchObject({
      valid: true,
      won: false,
      state: { player: 1, collectedRelics: 0 },
    });
    const complete = replay(board, ['right', 'right', 'left']);
    expect(complete).toMatchObject({
      valid: true,
      won: true,
      moves: 3,
      state: { collectedRelics: 1 },
    });
    expect(isRelicCollected(board, complete.state, 2)).toBe(true);
    expect(isRelicCollected(board, complete.state, 1)).toBe(false);
    expect(collectedRelicCount(board, complete.state)).toBe(1);
    expect(board.terrain[2]).toBe('relic');
  });

  it('collects a relic when a slide reaches it and collects starting relics in row-major bit order', () => {
    const board = boardFromAscii(['PIIR', 'R..E', '..R.', '...R']);
    expect(relicCells(board)).toEqual([3, 4, 10, 15]);
    expect(transition(board, initialState(board), 'right')).toMatchObject({
      ok: true,
      state: { player: 3, collectedRelics: 1 },
    });
    expect(initialState({ ...board, player: 10 }).collectedRelics).toBe(4);
    expect(isWon(board, { player: 7, crates: [], hasKey: false, collectedRelics: 7 })).toBe(false);
    expect(isWon(board, { player: 7, crates: [], hasKey: false, collectedRelics: 15 })).toBe(true);
  });

  it('a crate covers a relic without collecting it, then reveals it when pushed', () => {
    const board = boardFromAscii(['PCRE', '....', '....', '....']);
    expect(replay(board, ['right'])).toMatchObject({
      state: { player: 1, crates: [2], collectedRelics: 0 },
    });
    expect(replay(board, ['right', 'right'])).toMatchObject({
      state: { player: 2, crates: [3], collectedRelics: 1 },
      won: false,
    });
  });

  it('validates three crates and four relics without permitting blocked initial occupants', () => {
    const board = boardFromAscii(['P..E', '.RRR', 'R~BI', 'CCC.']);
    expect(validateBoard(board)).toEqual([]);
    expect(
      validateBoard({ ...board, crates: [12, 13, 14, 15] }).some(
        (issue) => issue.code === 'crate_count',
      ),
    ).toBe(true);
    expect(
      validateBoard({
        ...board,
        terrain: board.terrain.map((terrain, cell) => (cell === 1 ? 'relic' : terrain)),
      }).some((issue) => issue.code === 'relic_count'),
    ).toBe(true);
    for (const occupant of [{ player: 9 }, { crates: [9] }])
      expect(
        validateBoard({ ...board, ...occupant }).some((issue) => issue.code === 'blocked_start'),
      ).toBe(true);
  });

  it('upgrades only changed drafts, keeps multiple relics, and preserves the version during resize and parse', () => {
    const board = emptyBoard();
    const first = paintCell(board, 0, 'relic');
    const second = paintCell(first, 1, 'relic');
    expect(second.rulesVersion).toBe(2);
    expect(relicCells(second)).toEqual([0, 1]);
    expect(board.rulesVersion).toBe(1);
    expect(parseBoard(resizeBoard(second, 8, 8)).rulesVersion).toBe(2);
    expect(
      applyCellEdits(board, [{ cell: 0, terrain: 'ice', occupant: 'none' }]).rulesVersion,
    ).toBe(2);
    expect(
      applyCellEdits(board, [{ cell: 0, terrain: 'wall', occupant: 'none' }]).rulesVersion,
    ).toBe(1);
    expect(paintCell({ ...board, rulesVersion: 2 }, 0, 'crate').rulesVersion).toBe(2);
  });

  it('water painting removes occupants; occupant painting replaces water with safe floor', () => {
    const board = emptyBoard();
    const flooded = paintCell(board, board.player, 'water');
    expect(flooded.player).toBe(-1);
    expect(flooded.terrain[board.player]).toBe('water');
    const repaired = paintCell(flooded, board.player, 'player');
    expect(repaired.terrain[board.player]).toBe('floor');
    expect(validateBoard(repaired)).toEqual([]);
  });
});
