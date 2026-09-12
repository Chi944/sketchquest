import { describe, expect, it } from 'vitest';
import { boardFromAscii } from './board';
import { initialState, replay, transition } from './rules';
import type { GameState } from './types';

describe('literal independent rule examples', () => {
  it('blocks boundaries and walls without changing its inputs', () => {
    const board = boardFromAscii(['P#.E', '....', '....', '....']);
    const state = initialState(board);
    const before = JSON.stringify({ board, state });
    expect(transition(board, state, 'up').ok).toBe(false);
    expect(transition(board, state, 'left').ok).toBe(false);
    expect(transition(board, state, 'right').ok).toBe(false);
    expect(JSON.stringify({ board, state })).toBe(before);
    expect(transition(board, state, 'down')).toEqual({
      ok: true,
      state: { player: 4, crates: [], hasKey: false },
      pushed: false,
      won: false,
    });
  });

  it('collects a key permanently and traverses a door', () => {
    const board = boardFromAscii(['PKDE', '####', '....', '....']);
    const first = transition(board, initialState(board), 'right');
    expect(first).toEqual({
      ok: true,
      state: { player: 1, crates: [], hasKey: true },
      pushed: false,
      won: false,
    });
    const back = transition(board, { player: 1, crates: [], hasKey: true }, 'left');
    expect(back.ok && back.state.hasKey).toBe(true);
    expect(replay(board, ['right', 'right', 'right'])).toEqual({
      valid: true,
      state: { player: 3, crates: [], hasKey: true },
      moves: 3,
      pushes: 0,
      won: true,
    });
    expect(transition(board, { player: 1, crates: [], hasKey: false }, 'right').ok).toBe(false);
  });

  it('a crate covers a key without collecting it, then reveals it when pushed', () => {
    const board = boardFromAscii(['PCKE', '....', '....', '....']);
    expect(transition(board, initialState(board), 'right')).toEqual({
      ok: true,
      state: { player: 1, crates: [2], hasKey: false },
      pushed: true,
      won: false,
    });
    expect(transition(board, { player: 1, crates: [2], hasKey: false }, 'right')).toEqual({
      ok: true,
      state: { player: 2, crates: [3], hasKey: true },
      pushed: true,
      won: false,
    });
    expect(board.terrain[2]).toBe('key');
  });

  it('uses possession before the move for crate-to-door pushes', () => {
    const board = boardFromAscii(['PKDE', '....', '....', '....']);
    const covered: GameState = { player: 0, crates: [1], hasKey: false };
    expect(transition(board, covered, 'right').ok).toBe(false);
    expect(covered).toEqual({ player: 0, crates: [1], hasKey: false });
    expect(transition(board, { ...covered, hasKey: true }, 'right')).toEqual({
      ok: true,
      state: { player: 1, crates: [2], hasKey: true },
      pushed: true,
      won: false,
    });
  });

  it('allows a crate on the exit and wins when it is pushed away', () => {
    const board = boardFromAscii(['P.E.', '....', '....', '....']);
    expect(transition(board, { player: 1, crates: [2], hasKey: false }, 'right')).toEqual({
      ok: true,
      state: { player: 2, crates: [3], hasKey: false },
      pushed: true,
      won: true,
    });
    expect(transition(board, { player: 2, crates: [3], hasKey: false }, 'down').ok).toBe(false);
  });

  it('cannot push two crates, into a wall, or outside the board', () => {
    const board = boardFromAscii(['PCCE', '.#..', '....', '....']);
    expect(transition(board, initialState(board), 'right').ok).toBe(false);
    expect(transition(board, { player: 1, crates: [2, 4], hasKey: false }, 'down').ok).toBe(false);
    expect(transition(board, { player: 2, crates: [3, 4], hasKey: false }, 'right').ok).toBe(false);
  });

  it('initializes a player on a key and permits a zero-move exit', () => {
    const board = boardFromAscii(['PK.E', '....', '....', '....']);
    expect(initialState({ ...board, player: 1 })).toEqual({ player: 1, crates: [], hasKey: true });
    expect(replay({ ...board, player: 3 }, [])).toEqual({
      valid: true,
      state: { player: 3, crates: [], hasKey: false },
      moves: 0,
      pushes: 0,
      won: true,
    });
  });

  it('reports only successful moves and pushes before a bad replay step', () => {
    const board = boardFromAscii(['PCKE', '....', '....', '....']);
    expect(replay(board, ['right', 'right', 'right'])).toEqual({
      valid: false,
      state: { player: 2, crates: [3], hasKey: true },
      moves: 2,
      pushes: 2,
      won: false,
    });
  });
});
