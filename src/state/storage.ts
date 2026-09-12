import { openDB } from 'idb';
import { parseBoard } from '../core/board';
import { replay } from '../core/rules';
import {
  DIRECTIONS,
  TERRAINS,
  type BoardDefinition,
  type PlaySession,
  type Revision,
} from '../core/types';

export interface SavedWorkspace {
  version: 1;
  revisions: Revision[];
  activeRevisionId: string;
  sessions: Record<string, PlaySession>;
  draft: BoardDefinition | null;
  draftTitle: string;
  draftReview?: DraftReview | null;
  parkedDrafts?: ParkedDraft[];
  savedAt: string;
}

export interface ParkedDraft {
  baseRevisionId: string;
  board: BoardDefinition;
  title: string;
  review: DraftReview | null;
}

export interface DraftReview {
  source: 'image' | 'text';
  baseHash: string;
  explanation: string;
  notes: string[];
  uncertain: number[];
  extraPlayers: number[];
  objective: 'edit' | 'longer';
  corrections: number;
  prepared?: boolean;
  baselineMoves?: number | null;
}

const database = () =>
  openDB('sketchquest', 1, {
    upgrade(db) {
      db.createObjectStore('workspace');
    },
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const shortText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max;
const idValue = (value: unknown): value is string =>
  shortText(value, 100) &&
  value.length > 0 &&
  !['__proto__', 'constructor', 'prototype'].includes(value);
const safeInteger = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const timestamp = (value: unknown): value is string =>
  shortText(value, 40) && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const damage = (part: string): never => {
  throw new Error(
    `The saved ${part} is damaged. Your original browser data has been left in place.`,
  );
};

/** Drafts are editable representations: missing players/exits, blocked pieces, or excess crates
 * are valid drafts, but unknown terrain, oversized grids, and out-of-range indexes are not.
 */
function readDraft(value: unknown): BoardDefinition {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    ![1, 2, 3].includes(value.rulesVersion as number) ||
    !safeInteger(value.width, 4, 8) ||
    !safeInteger(value.height, 4, 8)
  )
    return damage('draft');
  const count = value.width * value.height;
  if (
    !Array.isArray(value.terrain) ||
    value.terrain.length !== count ||
    !value.terrain.every((cell) => TERRAINS.includes(cell)) ||
    !safeInteger(value.player, -1, count - 1) ||
    !Array.isArray(value.crates) ||
    value.crates.length > count ||
    !value.crates.every((cell) => safeInteger(cell, 0, count - 1))
  )
    return damage('draft');
  return {
    schemaVersion: 1,
    rulesVersion: value.rulesVersion as BoardDefinition['rulesVersion'],
    width: value.width,
    height: value.height,
    terrain: [...value.terrain],
    player: value.player,
    crates: [...value.crates],
  };
}

function readReview(value: unknown, board: BoardDefinition): DraftReview | null {
  if (value === undefined || value === null) return null;
  if (
    !isRecord(value) ||
    typeof value.source !== 'string' ||
    !['image', 'text'].includes(value.source) ||
    !shortText(value.baseHash, 2048) ||
    !value.baseHash.length ||
    !shortText(value.explanation, 2000) ||
    !Array.isArray(value.notes) ||
    value.notes.length > 100 ||
    !value.notes.every((note) => shortText(note, 1000)) ||
    typeof value.objective !== 'string' ||
    !['edit', 'longer'].includes(value.objective) ||
    !safeInteger(value.corrections, 0) ||
    (value.prepared !== undefined && typeof value.prepared !== 'boolean') ||
    (value.baselineMoves !== undefined &&
      value.baselineMoves !== null &&
      !safeInteger(value.baselineMoves, 0))
  )
    return damage('draft review');
  const count = board.width * board.height;
  const indexes = (cells: unknown): cells is number[] =>
    Array.isArray(cells) &&
    cells.length <= count &&
    cells.every((cell) => safeInteger(cell, 0, count - 1)) &&
    new Set(cells).size === cells.length;
  if (!indexes(value.uncertain) || !indexes(value.extraPlayers)) return damage('draft review');
  return {
    source: value.source as DraftReview['source'],
    baseHash: value.baseHash,
    explanation: value.explanation,
    notes: [...value.notes],
    uncertain: [...value.uncertain],
    extraPlayers: [...value.extraPlayers],
    objective: value.objective as DraftReview['objective'],
    corrections: value.corrections,
    ...(value.prepared !== undefined ? { prepared: value.prepared as boolean } : {}),
    ...(value.baselineMoves !== undefined
      ? { baselineMoves: value.baselineMoves as number | null }
      : {}),
  };
}

/** Treat IndexedDB data as untrusted and return fresh objects containing only supported fields. */
export function validateWorkspace(value: unknown): SavedWorkspace {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Array.isArray(value.revisions) ||
    !value.revisions.length ||
    value.revisions.length > 10000 ||
    !isRecord(value.sessions) ||
    !idValue(value.activeRevisionId) ||
    !shortText(value.draftTitle, 80) ||
    !timestamp(value.savedAt)
  )
    return damage('notebook');
  const revisionIds = new Set<string>();
  const revisions: Revision[] = value.revisions.map((input) => {
    if (
      !isRecord(input) ||
      !idValue(input.id) ||
      revisionIds.has(input.id) ||
      !shortText(input.title, 80) ||
      !(input.parentId === null || idValue(input.parentId)) ||
      !timestamp(input.createdAt) ||
      typeof input.source !== 'string' ||
      !['manual', 'image', 'text', 'example', 'import'].includes(input.source)
    )
      return damage('revision');
    let board: BoardDefinition;
    try {
      board = parseBoard(input.board);
    } catch {
      return damage('revision');
    }
    revisionIds.add(input.id);
    return {
      id: input.id,
      parentId: input.parentId,
      title: input.title,
      board,
      createdAt: input.createdAt,
      source: input.source as Revision['source'],
    };
  });
  if (!revisionIds.has(value.activeRevisionId)) return damage('active revision');
  const byId = new Map(revisions.map((revision) => [revision.id, revision]));
  for (const revision of revisions) {
    if (
      revision.parentId !== null &&
      (!revisionIds.has(revision.parentId) || revision.parentId === revision.id)
    )
      return damage('revision ancestry');
  }
  // Each ancestry chain is walked once. Corrupt cycles cannot hang a notebook restore.
  const visited = new Set<string>();
  for (const revision of revisions) {
    const chain = new Set<string>();
    let node: Revision | undefined = revision;
    while (node && !visited.has(node.id)) {
      if (chain.has(node.id)) return damage('revision ancestry');
      chain.add(node.id);
      node = node.parentId ? byId.get(node.parentId) : undefined;
    }
    chain.forEach((id) => visited.add(id));
  }
  const sessionEntries = Object.entries(value.sessions);
  if (sessionEntries.length > revisions.length) return damage('move history');
  const sessions: Record<string, PlaySession> = {};
  for (const [id, input] of sessionEntries) {
    const revision = byId.get(id);
    if (
      !revision ||
      !isRecord(input) ||
      input.revisionId !== id ||
      !Array.isArray(input.moves) ||
      input.moves.length > 100000 ||
      !input.moves.every((move) => DIRECTIONS.includes(move)) ||
      !safeInteger(input.cursor, 0, input.moves.length)
    )
      return damage('move history');
    if (!replay(revision.board, input.moves).valid) return damage('move history');
    sessions[id] = { revisionId: id, moves: [...input.moves], cursor: input.cursor };
  }
  const draft = value.draft === null ? null : readDraft(value.draft);
  if (!draft && value.draftReview !== undefined && value.draftReview !== null)
    return damage('draft review');
  const draftReview = draft ? readReview(value.draftReview, draft) : null;
  let parkedDrafts: ParkedDraft[] | undefined;
  if (value.parkedDrafts !== undefined) {
    if (!Array.isArray(value.parkedDrafts) || value.parkedDrafts.length > 1000)
      return damage('parked drafts');
    parkedDrafts = value.parkedDrafts.map((input) => {
      if (
        !isRecord(input) ||
        !idValue(input.baseRevisionId) ||
        !revisionIds.has(input.baseRevisionId) ||
        !shortText(input.title, 80)
      )
        return damage('parked draft');
      const board = readDraft(input.board);
      return {
        baseRevisionId: input.baseRevisionId,
        board,
        title: input.title,
        review: readReview(input.review, board),
      };
    });
  }
  return {
    version: 1,
    revisions,
    activeRevisionId: value.activeRevisionId,
    sessions,
    draft,
    draftTitle: value.draftTitle,
    draftReview,
    ...(parkedDrafts ? { parkedDrafts } : {}),
    savedAt: value.savedAt,
  };
}

export async function loadWorkspace(): Promise<SavedWorkspace | null> {
  const db = await database();
  try {
    const saved = await db.get('workspace', 'current');
    return saved ? validateWorkspace(saved) : null;
  } finally {
    db.close();
  }
}

export async function saveWorkspace(value: SavedWorkspace): Promise<void> {
  const db = await database();
  try {
    await db.put('workspace', value, 'current');
  } finally {
    db.close();
  }
}

export function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
