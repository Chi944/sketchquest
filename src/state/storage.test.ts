import { describe, expect, it } from 'vitest';
import { boardHash, boardFromAscii, emptyBoard } from '../core/board';
import { replay } from '../core/rules';
import { validateWorkspace, type DraftReview, type SavedWorkspace } from './storage';

const board = () => emptyBoard(4, 4);
const date = '2026-09-13T00:00:00.000Z';
const workspace = (): SavedWorkspace => ({
  version: 1,
  revisions: [
    {
      id: 'revision-1',
      parentId: null,
      title: 'A puzzle',
      source: 'manual',
      createdAt: date,
      board: board(),
    },
  ],
  activeRevisionId: 'revision-1',
  sessions: { 'revision-1': { revisionId: 'revision-1', moves: ['right', 'down'], cursor: 1 } },
  draft: null,
  draftTitle: 'My draft',
  draftReview: null,
  savedAt: date,
});
const review = (): DraftReview => ({
  source: 'text',
  baseHash: boardHash(board()),
  explanation: 'Try a detour',
  notes: ['Verify this draft.'],
  uncertain: [],
  extraPlayers: [],
  objective: 'longer',
  corrections: 0,
  baselineMoves: 2,
});

describe('untrusted saved workspace validation', () => {
  it('restores version 3 revisions, hazardous drafts, and a valid terminal death session', () => {
    const value = workspace();
    const expedition = boardFromAscii(['PF~E', '.S..', '....', '....'], 3);
    value.revisions[0].board = expedition;
    value.sessions['revision-1'] = {
      revisionId: 'revision-1',
      moves: ['right', 'right'],
      cursor: 2,
    };
    value.draft = { ...expedition, player: -1 };
    value.parkedDrafts = [
      { baseRevisionId: 'revision-1', board: value.draft, title: 'Survival draft', review: null },
    ];
    const restored = validateWorkspace(value);
    expect(restored.revisions[0].board).toEqual(expedition);
    expect(restored.draft).toEqual(value.draft);
    expect(restored.parkedDrafts?.[0].board.rulesVersion).toBe(3);
    expect(
      replay(restored.revisions[0].board, restored.sessions['revision-1'].moves),
    ).toMatchObject({ valid: true, state: { hasBoots: true, dead: true, deathCause: 'water' } });
    value.sessions['revision-1'].moves.push('down');
    expect(() => validateWorkspace(value)).toThrow('history');
  });
  it('preserves expedition rules in saved revisions, editable drafts and parked drafts', () => {
    const value = workspace();
    const expedition = { ...board(), rulesVersion: 2 as const };
    expedition.terrain[4] = 'water';
    expedition.terrain[8] = 'bridge';
    expedition.terrain[6] = 'ice';
    expedition.terrain[9] = 'relic';
    value.revisions[0].board = expedition;
    value.draft = { ...expedition, player: -1 };
    value.parkedDrafts = [
      { baseRevisionId: 'revision-1', board: value.draft, title: 'An icy draft', review: null },
    ];
    const restored = validateWorkspace(value);
    expect(restored.revisions[0].board).toEqual(expedition);
    expect(restored.draft).toEqual(value.draft);
    expect(restored.parkedDrafts?.[0].board.rulesVersion).toBe(2);
  });
  it('copies only supported fields while preserving revision and play history', () => {
    const value = workspace();
    const result = validateWorkspace({ ...value, extra: 'discard me' });
    expect(result).toEqual(value);
    expect(result).not.toBe(value);
    expect(result.revisions[0].board).not.toBe(value.revisions[0].board);
    result.sessions['revision-1'].moves.push('up');
    expect(value.sessions['revision-1'].moves).toEqual(['right', 'down']);
  });

  it('preserves incomplete drafts with missing players and excess or overlapping pieces', () => {
    const value = workspace();
    value.draft = { ...board(), player: -1, crates: [0, 1, 2, 3] };
    value.draft.terrain[10] = 'floor';
    value.draftReview = {
      ...review(),
      source: 'image',
      objective: 'edit',
      uncertain: [2],
      extraPlayers: [2],
      baselineMoves: null,
    };
    expect(validateWorkspace(value).draft).toEqual(value.draft);
    expect(validateWorkspace(value).draftReview).toEqual(value.draftReview);
  });

  it('rejects unsafe draft representations without demanding a playable draft', () => {
    for (const change of [
      { player: -2 },
      { player: 16 },
      { crates: [16] },
      { crates: [1.5] },
      { width: 100 },
      { schemaVersion: 2 },
      { terrain: ['lava'] },
    ]) {
      expect(() => validateWorkspace({ ...workspace(), draft: { ...board(), ...change } })).toThrow(
        'draft',
      );
    }
  });

  it('rejects malformed review fields that would crash render or fabricate proof', () => {
    for (const change of [
      { notes: 'not an array' },
      { uncertain: {} },
      { extraPlayers: [1000] },
      { source: 'injected' },
      { objective: 'optimal' },
      { corrections: -1 },
      { prepared: 'yes' },
      { baselineMoves: Infinity },
      { baselineMoves: 1.5 },
      { baseHash: {} },
    ]) {
      expect(() =>
        validateWorkspace({
          ...workspace(),
          draft: board(),
          draftReview: { ...review(), ...change },
        }),
      ).toThrow('review');
    }
    expect(() => validateWorkspace({ ...workspace(), draftTitle: {} })).toThrow('notebook');
    expect(() => validateWorkspace({ ...workspace(), draftReview: review() })).toThrow('review');
  });

  it('checks sessions against their revision and rejects illegal future moves too', () => {
    for (const session of [
      { revisionId: 'different', moves: [], cursor: 0 },
      { revisionId: 'revision-1', moves: ['up', 'up'], cursor: 1 }, // second up crosses the top edge
      { revisionId: 'revision-1', moves: ['right', 'down', 'left'], cursor: 0 }, // move after winning
      { revisionId: 'revision-1', moves: ['diagonal'], cursor: 0 },
      { revisionId: 'revision-1', moves: [], cursor: -1 },
    ])
      expect(() =>
        validateWorkspace({ ...workspace(), sessions: { 'revision-1': session } }),
      ).toThrow('history');
    expect(() =>
      validateWorkspace({
        ...workspace(),
        sessions: { missing: { revisionId: 'missing', moves: [], cursor: 0 } },
      }),
    ).toThrow('history');
  });

  it('rejects duplicate identities, missing ancestry, cycles, and invalid dates', () => {
    const value = workspace(),
      revision = value.revisions[0];
    expect(() => validateWorkspace({ ...value, revisions: [revision, revision] })).toThrow(
      'revision',
    );
    expect(() =>
      validateWorkspace({ ...value, revisions: [{ ...revision, parentId: 'missing' }] }),
    ).toThrow('ancestry');
    expect(() =>
      validateWorkspace({
        ...value,
        revisions: [
          { ...revision, parentId: 'revision-2' },
          { ...revision, id: 'revision-2', parentId: 'revision-1' },
        ],
      }),
    ).toThrow('ancestry');
    expect(() =>
      validateWorkspace({ ...value, revisions: [{ ...revision, createdAt: 'nonsense' }] }),
    ).toThrow('revision');
  });

  it('round-trips parked drafts and requires known base revisions', () => {
    const value = workspace();
    value.parkedDrafts = [
      {
        baseRevisionId: 'revision-1',
        board: { ...board(), player: -1 },
        title: 'Unfinished sketch',
        review: review(),
      },
    ];
    expect(validateWorkspace(value).parkedDrafts).toEqual(value.parkedDrafts);
    expect(() =>
      validateWorkspace({
        ...value,
        parkedDrafts: [{ ...value.parkedDrafts![0], baseRevisionId: 'missing' }],
      }),
    ).toThrow('parked draft');
    expect(() =>
      validateWorkspace({
        ...value,
        parkedDrafts: [{ ...value.parkedDrafts![0], review: { ...review(), uncertain: [999] } }],
      }),
    ).toThrow('review');
  });
});
