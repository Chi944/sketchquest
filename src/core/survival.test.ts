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
import { EXPEDITIONS } from './examples';
import { initialState, isWon, replay, transition } from './rules';

describe('version 3 survival and equipment', () => {
  it('initializes explicit survival fields without changing older state shapes', () => {
    const rows = ['PK.E', '....', '....', '....'];
    expect(initialState(boardFromAscii(rows, 1))).toEqual({ player: 0, crates: [], hasKey: false });
    expect(initialState(boardFromAscii(rows, 2))).toEqual({
      player: 0,
      crates: [],
      hasKey: false,
      collectedRelics: 0,
    });
    expect(initialState(boardFromAscii(rows, 3))).toEqual({
      player: 0,
      crates: [],
      hasKey: false,
      collectedRelics: 0,
      hasBoots: false,
      doorOpened: false,
      dead: false,
    });
  });

  it('consumes the key on gate entry and permanently opens the gate without respawning the key', () => {
    const board = boardFromAscii(['PKDE', '....', '....', '....'], 3);
    expect(replay(board, ['right'])).toMatchObject({ state: { hasKey: true, doorOpened: false } });
    const opened = replay(board, ['right', 'right']);
    expect(opened).toMatchObject({
      valid: true,
      state: { player: 2, hasKey: false, doorOpened: true, dead: false },
    });
    expect(replay(board, ['right', 'right', 'left'])).toMatchObject({
      state: { player: 1, hasKey: false, doorOpened: true },
    });
    expect(replay(board, ['right', 'right', 'left', 'right', 'right'])).toMatchObject({
      valid: true,
      won: true,
      state: { hasKey: false, doorOpened: true },
    });
    expect(board.terrain.slice(0, 4)).toEqual(['floor', 'key', 'door', 'exit']);
  });

  it('blocks gate entry without a key and preserves all inventory on invalid movement', () => {
    const board = boardFromAscii(['PKDE', '....', '....', '....'], 3);
    const state = { ...initialState(board), player: 1 };
    const before = structuredClone(state);
    expect(transition(board, state, 'right')).toMatchObject({
      ok: false,
      reason: expect.stringContaining('key'),
    });
    expect(state).toEqual(before);
  });

  it('spikes kill a player carrying a key; inventory does not imply protection', () => {
    const board = boardFromAscii(['PKSE', '....', '....', '....'], 3);
    const killed = replay(board, ['right', 'right']);
    expect(killed).toMatchObject({
      valid: true,
      won: false,
      moves: 2,
      state: { player: 2, hasKey: true, hasBoots: false, dead: true, deathCause: 'spikes' },
    });
  });

  it('boots shield spikes permanently but deep water still kills while carrying boots and a relic', () => {
    const board = EXPEDITIONS[2].board;
    expect(replay(board, ['right', 'right', 'down'])).toMatchObject({
      valid: true,
      state: { hasBoots: true, collectedRelics: 1, dead: false, player: 15 },
    });
    expect(replay(board, ['right', 'right', 'right'])).toMatchObject({
      valid: true,
      won: false,
      moves: 3,
      state: { hasBoots: true, collectedRelics: 1, dead: true, deathCause: 'water' },
    });
    const keyAndBoots = boardFromAscii(['PKF~', '...E', '....', '....'], 3);
    expect(replay(keyAndBoots, ['right', 'right', 'right'])).toMatchObject({
      state: { hasKey: true, hasBoots: true, dead: true, deathCause: 'water' },
    });
  });

  it('ice can carry an equipped or unequipped player into lethal terrain', () => {
    const water = boardFromAscii(['PII~', '...E', '....', '....'], 3);
    expect(replay(water, ['right'])).toMatchObject({
      valid: true,
      moves: 1,
      state: { player: 3, dead: true, deathCause: 'water' },
    });
    const spikes = boardFromAscii(['PIIS', '...E', '....', '....'], 3);
    expect(replay(spikes, ['right'])).toMatchObject({
      valid: true,
      moves: 1,
      state: { player: 3, dead: true, deathCause: 'spikes' },
    });
    expect(transition(spikes, { ...initialState(spikes), hasBoots: true }, 'right')).toMatchObject({
      ok: true,
      state: { player: 3, dead: false, hasBoots: true },
    });
  });

  it('death ends a valid replay; later inputs fail and undo or restart reconstructs a living state', () => {
    const board = boardFromAscii(['P~.E', '....', '....', '....'], 3);
    const dead = replay(board, ['right']);
    expect(dead).toMatchObject({ valid: true, won: false, moves: 1, state: { dead: true } });
    expect(replay(board, ['right', 'down'])).toMatchObject({
      valid: false,
      won: false,
      moves: 1,
      state: dead.state,
    });
    expect(transition(board, dead.state, 'left')).toMatchObject({ ok: false });
    expect(initialState(board)).toMatchObject({ player: 0, dead: false });
    expect(replay(board, []).state).not.toHaveProperty('deathCause');
    expect(isWon(board, { ...dead.state, player: 3 })).toBe(false);
  });

  it('crates cannot cover water, spikes, or a closed gate even if the player carries equipment', () => {
    for (const rows of [
      ['PC~E', '....', '....', '....'],
      ['PCSE', '....', '....', '....'],
      ['PCDE', '.K..', '....', '....'],
    ]) {
      const board = boardFromAscii(rows, 3);
      const state = { ...initialState(board), hasKey: true, hasBoots: true };
      expect(transition(board, state, 'right')).toMatchObject({ ok: false });
      expect(state.crates).toEqual([1]);
    }
    const open = boardFromAscii(['PCDE', '.K..', '....', '....'], 3);
    expect(transition(open, { ...initialState(open), doorOpened: true }, 'right')).toMatchObject({
      ok: true,
      pushed: true,
      state: { crates: [2], doorOpened: true, hasKey: false },
    });
  });

  it('a crate covers boots until the player pushes it away and enters the equipment cell', () => {
    const board = boardFromAscii(['PCFE', '....', '....', '....'], 3);
    expect(replay(board, ['right'])).toMatchObject({
      state: { player: 1, crates: [2], hasBoots: false },
    });
    expect(replay(board, ['right', 'right'])).toMatchObject({
      state: { player: 2, crates: [3], hasBoots: true },
    });
    expect(initialState({ ...board, player: 2, crates: [] })).toMatchObject({ hasBoots: true });
  });

  it('opens a gate reached by an ice slide and keeps the exit inactive until all relics are held', () => {
    const board = boardFromAscii(['PKID', '...E', '..R.', '....'], 3);
    const state = replay(board, ['right', 'right']);
    expect(state).toMatchObject({
      moves: 2,
      state: { player: 3, hasKey: false, doorOpened: true },
    });
    expect(replay(board, ['right', 'right', 'down'])).toMatchObject({ valid: true, won: false });
  });
});

describe('version 3 board boundaries and editing', () => {
  it('requires version 3 for new symbols and rejects duplicate equipment or hazardous initial positions', () => {
    const board = boardFromAscii(['PFSE', '.~..', '....', '....']);
    expect(board.rulesVersion).toBe(3);
    expect(parseBoard(board)).toEqual(board);
    expect(() => parseBoard({ ...board, rulesVersion: 2 })).toThrow();
    expect(() => parseBoard({ ...board, player: 2 })).toThrow();
    expect(() => parseBoard({ ...board, crates: [2] })).toThrow();
    const duplicate = {
      ...board,
      terrain: board.terrain.map((terrain, cell) => (cell === 4 ? 'boots' : terrain)),
    };
    expect(validateBoard(duplicate).some((issue) => issue.code === 'boots_count')).toBe(true);
  });

  it('upgrades on new tools, relocates boots and never downgrades v3 after later terrain edits', () => {
    const legacy = emptyBoard();
    let draft = paintCell(legacy, 0, 'boots');
    expect(draft.rulesVersion).toBe(3);
    draft = paintCell(draft, 1, 'boots');
    expect(draft.terrain.filter((terrain) => terrain === 'boots')).toHaveLength(1);
    expect(draft.terrain[0]).toBe('floor');
    expect(paintCell(draft, 2, 'water').rulesVersion).toBe(3);
    expect(
      applyCellEdits(draft, [{ cell: 2, terrain: 'ice', occupant: 'none' }]).rulesVersion,
    ).toBe(3);
    expect(
      applyCellEdits(legacy, [{ cell: 0, terrain: 'spikes', occupant: 'none' }]).rulesVersion,
    ).toBe(3);
    expect(resizeBoard(draft, 8, 8).rulesVersion).toBe(3);
    const cleared = paintCell(draft, draft.player, 'spikes');
    expect(cleared.player).toBe(-1);
    expect(paintCell(cleared, draft.player, 'player').terrain[draft.player]).toBe('floor');
  });
});
