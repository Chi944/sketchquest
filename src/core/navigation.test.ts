import { describe, expect, it } from 'vitest';
import { boardFromAscii } from './board';
import { cellAhead, relativeDirection, startingFacing } from './navigation';
import { initialState, transition } from './rules';
import type { Direction } from './types';

describe('first-person navigation mapping', () => {
  it('maps left, right and turnaround against each compass facing', () => {
    const cases: [Direction, Direction, Direction, Direction][] = [
      ['up', 'left', 'right', 'down'],
      ['right', 'up', 'down', 'left'],
      ['down', 'right', 'left', 'up'],
      ['left', 'down', 'up', 'right'],
    ];
    for (const [facing, left, right, back] of cases) {
      expect(relativeDirection(facing, 0)).toBe(facing);
      expect(relativeDirection(facing, -1)).toBe(left);
      expect(relativeDirection(facing, 1)).toBe(right);
      expect(relativeDirection(facing, 2)).toBe(back);
      expect(relativeDirection(facing, -2)).toBe(back);
    }
  });

  it('normalizes repeated full rotations in either direction', () => {
    expect(relativeDirection('up', 4)).toBe('up');
    expect(relativeDirection('up', -4)).toBe('up');
    expect(relativeDirection('up', 5)).toBe('right');
    expect(relativeDirection('up', -5)).toBe('left');
    expect(relativeDirection('left', -9)).toBe('down');
  });

  it('finds adjacent cells on a rectangular board without wrapping across row or column edges', () => {
    const board = boardFromAscii(['P....E', '......', '......', '......'], 3);
    expect(cellAhead(board, 7, 'up')).toBe(1);
    expect(cellAhead(board, 7, 'right')).toBe(8);
    expect(cellAhead(board, 7, 'down')).toBe(13);
    expect(cellAhead(board, 7, 'left')).toBe(6);
    expect(cellAhead(board, 0, 'up')).toBeNull();
    expect(cellAhead(board, 0, 'left')).toBeNull();
    expect(cellAhead(board, 5, 'right')).toBeNull();
    expect(cellAhead(board, 6, 'left')).toBeNull();
    expect(cellAhead(board, 23, 'right')).toBeNull();
    expect(cellAhead(board, 23, 'down')).toBeNull();
  });

  it('chooses a safe starting direction even when the preferred legal action is fatal', () => {
    for (const firstRow of ['P~..', 'PS..', 'PII~', 'PIIS']) {
      const board = boardFromAscii([firstRow, '...E', '....', '....'], 3);
      const danger = transition(board, initialState(board), 'right');
      expect(danger).toMatchObject({ ok: true, state: { dead: true } });
      expect(startingFacing(board)).toBe('down');
    }
  });

  it('takes equipment into account when a starting cell equips spike protection', () => {
    const board = boardFromAscii(['PS.E', '....', '....', '....'], 3);
    board.terrain[0] = 'boots';
    expect(initialState(board).hasBoots).toBe(true);
    expect(startingFacing(board)).toBe('right');
    expect(transition(board, initialState(board), 'right')).toMatchObject({
      ok: true,
      state: { dead: false },
    });
  });

  it('uses a deterministic fallback when no safe first action is available', () => {
    const enclosed = boardFromAscii(['####', '#P#E', '####', '....'], 3);
    expect(startingFacing(enclosed)).toBe('up');
    const hazards = boardFromAscii(['P~#E', 'S###', '####', '....'], 3);
    expect(startingFacing(hazards)).toBe('up');
  });
});
