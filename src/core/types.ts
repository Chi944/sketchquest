export const TERRAINS = ['floor', 'wall', 'key', 'door', 'exit'] as const;
export type Terrain = (typeof TERRAINS)[number];
export const DIRECTIONS = ['up', 'right', 'down', 'left'] as const;
export type Direction = (typeof DIRECTIONS)[number];
export type Tool = Terrain | 'player' | 'crate' | 'erase' | 'select';

export interface BoardDefinition {
  schemaVersion: 1;
  rulesVersion: 1;
  width: number;
  height: number;
  terrain: Terrain[];
  player: number;
  crates: number[];
}
export interface GameState {
  player: number;
  crates: number[];
  hasKey: boolean;
}
export interface RuleIssue {
  code: string;
  message: string;
  cells: number[];
}
export interface Revision {
  id: string;
  parentId: string | null;
  title: string;
  board: BoardDefinition;
  createdAt: string;
  source: 'manual' | 'image' | 'text' | 'example' | 'import';
}
export interface PlaySession {
  revisionId: string;
  moves: Direction[];
  cursor: number;
}
export interface SearchStats {
  explored: number;
  elapsedMs: number;
}
export type SolverResult =
  | { status: 'solved'; solution: Direction[]; moves: number; pushes: number; stats: SearchStats }
  | { status: 'unsolvable'; stats: SearchStats }
  | {
      status: 'inconclusive';
      reason: 'time_budget' | 'state_budget' | 'cancelled';
      stats: SearchStats;
    };
export interface SolverJob {
  id: string;
  revisionId: string;
  boardHash: string;
  board: BoardDefinition;
  maxStates?: number;
  maxMs?: number;
}
export type SolverRequest = { type: 'solve'; job: SolverJob } | { type: 'cancel'; id: string };
export type SolverResponse =
  | { type: 'result'; id: string; revisionId: string; boardHash: string; result: SolverResult }
  | { type: 'error'; id: string; message: string };
export interface CellEdit {
  cell: number;
  terrain: Terrain;
  occupant: 'none' | 'player' | 'crate';
}
export interface InterpretationCell extends CellEdit {
  uncertain: boolean;
  alternatives: string[];
  note: string;
}
export interface Interpretation {
  status: 'interpreted' | 'needs_clarification' | 'unsupported';
  width: number | null;
  height: number | null;
  cells: InterpretationCell[];
  notes: string[];
}
export interface ProposalCandidate {
  explanation: string;
  edits: CellEdit[];
}
export interface ProposalResponse {
  requestId: string;
  baseRevisionId: string;
  baseHash: string;
  status: 'proposed' | 'needs_clarification' | 'unsupported';
  objective: 'longer' | 'edit';
  message: string;
  candidates: ProposalCandidate[];
}
export interface ApiError {
  error: { code: string; message: string; retryAfter?: number };
}
