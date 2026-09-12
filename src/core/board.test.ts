import { describe, expect, it } from 'vitest';
import {
  applyCellEdits,
  boardFromAscii,
  boardHash,
  changedCells,
  emptyBoard,
  paintCell,
  parseBoard,
  resizeBoard,
  validateBoard,
} from './board';

describe('board trust boundaries and editor operations', () => {
  it('validates the full symbol and occupancy rules', () => {
    const board = emptyBoard(4, 4);
    expect(validateBoard(board)).toEqual([]);
    for (const malformed of [
      null,
      [],
      { ...board, width: 3 },
      { ...board, height: 9 },
      { ...board, player: 16 },
      { ...board, crates: [2, 2] },
      { ...board, crates: [2, 3, 4] },
      { ...board, crates: [board.player] },
      { ...board, schemaVersion: 2 },
    ])
      expect(validateBoard(malformed).length).toBeGreaterThan(0);
    expect(
      validateBoard({
        ...board,
        terrain: board.terrain.map((value) => (value === 'exit' ? 'floor' : value)),
      }).some((issue) => issue.code === 'exit_count'),
    ).toBe(true);
    expect(
      validateBoard({
        ...board,
        terrain: board.terrain.map((value, cell) => (cell === 0 ? 'door' : value)),
      }).some((issue) => issue.code === 'door_requires_key'),
    ).toBe(true);
    expect(() => parseBoard({ ...board, terrain: ['lava'] })).toThrow();
    const sparseTerrain = [...board.terrain];
    delete sparseTerrain[2];
    expect(
      validateBoard({ ...board, terrain: sparseTerrain }).some(
        (issue) => issue.code === 'terrain_type',
      ),
    ).toBe(true);
    expect(
      validateBoard({ ...board, crates: Array(1) }).some(
        (issue) => issue.code === 'crate_position',
      ),
    ).toBe(true);
  });

  it('allows occupants on keys and exits but rejects walls and initially locked doors', () => {
    const board = boardFromAscii(['PKDE', '....', '....', '....']);
    expect(validateBoard({ ...board, player: 1 })).toEqual([]);
    expect(validateBoard({ ...board, player: 3, crates: [1] })).toEqual([]);
    expect(
      validateBoard({ ...board, crates: [2] }).some((issue) => issue.code === 'blocked_start'),
    ).toBe(true);
    expect(
      validateBoard({
        ...board,
        terrain: board.terrain.map((value, cell) => (cell === 0 ? 'wall' : value)),
      }).some((issue) => issue.code === 'blocked_start'),
    ).toBe(true);
  });

  it('canonicalizes crate order and strips unrelated shared fields', () => {
    const board = { ...emptyBoard(), crates: [15, 8], privateImage: 'do not share' };
    const parsed = parseBoard(board);
    expect(parsed.crates).toEqual([8, 15]);
    expect(parsed).not.toHaveProperty('privateImage');
    expect(boardHash(parsed)).toBe(boardHash({ ...parsed, crates: [15, 8] }));
    expect(boardHash(parsed)).not.toBe(boardHash({ ...parsed, player: 9 }));
  });

  it('rejects malformed ASCII and extra player glyphs', () => {
    expect(() => boardFromAscii(['PP.E', '....', '....', '....'])).toThrow();
    expect(() => boardFromAscii(['P?.E', '....', '....', '....'])).toThrow();
    expect(() => boardFromAscii(['P..E', '...', '....', '....'])).toThrow();
  });

  it('relocates unique terrain symbols while preserving compatible occupants', () => {
    const board = boardFromAscii(['PKDE', '....', '....', '....']);
    for (const tool of ['key', 'door', 'exit'] as const) {
      const painted = paintCell(board, 5, tool);
      expect(painted.terrain.filter((value) => value === tool)).toHaveLength(1);
      expect(painted.terrain[5]).toBe(tool);
    }
    const covered = paintCell(board, 1, 'crate');
    expect(covered.terrain[1]).toBe('key');
    expect(covered.crates).toEqual([1]);
    const erased = paintCell(covered, 1, 'erase');
    expect(erased.terrain[1]).toBe('key');
    expect(erased.crates).toEqual([]);
    expect(board.crates).toEqual([]);
  });

  it('retains a missing player as a correctable draft and relocates players', () => {
    const board = emptyBoard();
    const erased = paintCell(board, board.player, 'erase');
    expect(erased.player).toBe(-1);
    expect(validateBoard(erased).some((issue) => issue.code === 'player')).toBe(true);
    expect(validateBoard(paintCell(erased, 10, 'player'))).toEqual([]);
    expect(paintCell(board, 10, 'player').player).toBe(10);
  });

  it('applies a simultaneous literal patch without mutating the revision', () => {
    const board = emptyBoard();
    const edited = applyCellEdits(board, [
      { cell: 8, terrain: 'key', occupant: 'player' },
      { cell: 15, terrain: 'floor', occupant: 'crate' },
    ]);
    expect(edited.player).toBe(8);
    expect(edited.crates).toEqual([15]);
    expect(changedCells(board, edited)).toEqual([7, 8, 15]);
    expect(board.player).toBe(7);
    expect(() =>
      applyCellEdits(board, [{ cell: 90, terrain: 'floor', occupant: 'none' }]),
    ).toThrow();
    expect(() =>
      applyCellEdits(board, [
        { cell: 8, terrain: 'floor', occupant: 'none' },
        { cell: 8, terrain: 'key', occupant: 'none' },
      ]),
    ).toThrow();
  });

  it('preserves cell coordinates during resizing and flags cropped symbols', () => {
    const board = emptyBoard();
    const enlarged = resizeBoard(board, 8, 8);
    expect(enlarged.player).toBe(9);
    expect(enlarged.terrain[36]).toBe('exit');
    const smaller = resizeBoard(board, 4, 4);
    expect(smaller.player).toBe(5);
    expect(validateBoard(smaller).some((issue) => issue.code === 'exit_count')).toBe(true);
  });
});
