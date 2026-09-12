import { boardHash, parseBoard, validateBoard } from '../src/core/board';
import {
  TERRAINS,
  type BoardDefinition,
  type Interpretation,
  type InterpretationCell,
} from '../src/core/types';

export type Split = 'dev' | 'heldout' | 'rejection';
export interface EvaluationSample {
  id: string;
  sourceBoardId: string;
  split: Split;
  kind: 'board' | 'rejection';
  image: string;
  expectedBoard?: BoardDefinition;
  reason?: string;
  provenance?: Record<string, unknown>;
}
export interface EvaluationDataset {
  schemaVersion: 1;
  name: string;
  description?: string;
  samples: EvaluationSample[];
}
export interface Measurements {
  latencyMs?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  neurons?: number | null;
  costUsd?: number | null;
}
export interface PredictionRecord {
  sampleId: string;
  interpretation: unknown;
  error?: string;
  correctionActions?: number | null;
  measurements?: Measurements;
}
export interface Predictions {
  schemaVersion: 1;
  run?: Record<string, unknown>;
  records: PredictionRecord[];
}
const symbols = ['wall', 'player', 'crate', 'key', 'door', 'exit'] as const;
type SymbolName = (typeof symbols)[number];
const critical: readonly SymbolName[] = ['player', 'crate', 'key', 'door', 'exit'];
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && Array.from(value).every((item) => typeof item === 'string');

export function parseDataset(input: unknown): EvaluationDataset {
  if (
    !record(input) ||
    input.schemaVersion !== 1 ||
    typeof input.name !== 'string' ||
    !Array.isArray(input.samples)
  )
    throw new Error('Dataset must provide schemaVersion:1, name, and samples.');
  const identifiers = new Set<string>();
  const sourceSplits = new Map<string, Split>();
  const boardSplits = new Map<string, Split>();
  const samples: EvaluationSample[] = input.samples.map((raw) => {
    if (
      !record(raw) ||
      typeof raw.id !== 'string' ||
      !raw.id ||
      typeof raw.sourceBoardId !== 'string' ||
      !raw.sourceBoardId ||
      typeof raw.image !== 'string' ||
      !['dev', 'heldout', 'rejection'].includes(String(raw.split)) ||
      !['board', 'rejection'].includes(String(raw.kind))
    )
      throw new Error('Every sample needs an ID, sourceBoardId, image, split, and kind.');
    if (identifiers.has(raw.id)) throw new Error(`Duplicate sample ID ${raw.id}.`);
    identifiers.add(raw.id);
    const split = raw.split as Split;
    if (sourceSplits.has(raw.sourceBoardId) && sourceSplits.get(raw.sourceBoardId) !== split)
      throw new Error(`Source board ${raw.sourceBoardId} leaks across splits.`);
    sourceSplits.set(raw.sourceBoardId, split);
    if ((raw.kind === 'rejection') !== (split === 'rejection'))
      throw new Error('Rejection samples belong in the rejection split.');
    const sample: EvaluationSample = {
      id: raw.id,
      sourceBoardId: raw.sourceBoardId,
      image: raw.image,
      split,
      kind: raw.kind as 'board' | 'rejection',
    };
    if (raw.kind === 'board') {
      sample.expectedBoard = parseBoard(raw.expectedBoard);
      const identity = boardHash(sample.expectedBoard);
      if (boardSplits.has(identity) && boardSplits.get(identity) !== split)
        throw new Error(`Identical expected board ${raw.id} leaks across splits.`);
      boardSplits.set(identity, split);
    }
    if (typeof raw.reason === 'string') sample.reason = raw.reason;
    if (record(raw.provenance)) sample.provenance = raw.provenance;
    return sample;
  });
  return {
    schemaVersion: 1,
    name: input.name,
    description: typeof input.description === 'string' ? input.description : undefined,
    samples,
  };
}

export function parsePredictions(input: unknown): Predictions {
  if (!record(input) || input.schemaVersion !== 1 || !Array.isArray(input.records))
    throw new Error('Predictions must provide schemaVersion:1 and records.');
  const seen = new Set<string>();
  const records = input.records.map((raw) => {
    if (!record(raw) || typeof raw.sampleId !== 'string' || !raw.sampleId)
      throw new Error('Every prediction needs a sampleId.');
    if (seen.has(raw.sampleId)) throw new Error(`Duplicate prediction for ${raw.sampleId}.`);
    seen.add(raw.sampleId);
    const result: PredictionRecord = {
      sampleId: raw.sampleId,
      interpretation: raw.interpretation ?? null,
    };
    if (raw.error !== undefined && typeof raw.error !== 'string')
      throw new Error('Prediction error must be a string.');
    if (typeof raw.error === 'string') result.error = raw.error;
    if (raw.correctionActions !== undefined) {
      if (
        raw.correctionActions !== null &&
        (!Number.isInteger(raw.correctionActions) || (raw.correctionActions as number) < 0)
      )
        throw new Error('Correction actions must be a non-negative integer or null.');
      result.correctionActions = raw.correctionActions as number | null;
    }
    if (raw.measurements !== undefined) {
      if (!record(raw.measurements)) throw new Error('Measurements must be an object.');
      result.measurements = {};
      for (const metric of [
        'latencyMs',
        'inputTokens',
        'outputTokens',
        'neurons',
        'costUsd',
      ] as const) {
        const value = raw.measurements[metric];
        if (value !== undefined) {
          if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0))
            throw new Error(`${metric} must be a non-negative finite number or null.`);
          if (
            (metric === 'inputTokens' || metric === 'outputTokens') &&
            value !== null &&
            !Number.isInteger(value)
          )
            throw new Error(`${metric} must be an integer.`);
          result.measurements[metric] = value as number | null;
        }
      }
    }
    return result;
  });
  return { schemaVersion: 1, records, run: record(input.run) ? input.run : undefined };
}

/** Shared Interpretation contract, validated independently from server response parsing. */
function interpretation(input: unknown): Interpretation {
  if (
    !record(input) ||
    !['interpreted', 'needs_clarification', 'unsupported'].includes(String(input.status)) ||
    !Array.isArray(input.cells) ||
    !strings(input.notes)
  )
    throw new Error('Malformed Interpretation fields.');
  if (![input.width, input.height].every((value) => value === null || Number.isInteger(value)))
    throw new Error('Interpretation dimensions must be integers or null.');
  const cells: InterpretationCell[] = input.cells.map((raw) => {
    if (
      !record(raw) ||
      !Number.isInteger(raw.cell) ||
      (raw.cell as number) < 0 ||
      !(TERRAINS as readonly unknown[]).includes(raw.terrain) ||
      !['none', 'player', 'crate'].includes(String(raw.occupant)) ||
      typeof raw.uncertain !== 'boolean' ||
      !strings(raw.alternatives) ||
      typeof raw.note !== 'string'
    )
      throw new Error('Malformed interpretation cell.');
    return raw as unknown as InterpretationCell;
  });
  return {
    status: input.status as Interpretation['status'],
    width: input.width as number | null,
    height: input.height as number | null,
    cells,
    notes: input.notes,
  };
}

function expectedOccupant(board: BoardDefinition, cell: number) {
  return board.player === cell ? 'player' : board.crates.includes(cell) ? 'crate' : 'none';
}
const ratio = (correct: number, total: number) => ({
  correct,
  total,
  rate: total ? correct / total : null,
});
function measurement(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const total = values.reduce((sum, value) => sum + value, 0);
  const percentile = (p: number) =>
    sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] : null;
  return {
    reportedCount: values.length,
    total: values.length ? total : null,
    mean: values.length ? total / values.length : null,
    p50: percentile(0.5),
    p95: percentile(0.95),
  };
}

export function evaluate(dataset: EvaluationDataset, predictions: Predictions) {
  const samplesById = new Map(dataset.samples.map((sample) => [sample.id, sample]));
  const output = predictions.records.map((prediction) => {
    const sample = samplesById.get(prediction.sampleId);
    if (!sample) throw new Error(`Prediction references unknown sample ${prediction.sampleId}.`);
    let parsed: Interpretation | null = null;
    let outputError = prediction.error ?? null;
    if (!outputError) {
      try {
        parsed = interpretation(prediction.interpretation);
      } catch (error) {
        outputError = error instanceof Error ? error.message : 'Malformed model output.';
      }
    }
    const base = {
      sampleId: sample.id,
      split: sample.split,
      kind: sample.kind,
      status: parsed?.status ?? null,
      outputError,
      measurements: prediction.measurements ?? {},
      correctionActions: prediction.correctionActions ?? null,
    };
    if (sample.kind === 'rejection')
      return {
        ...base,
        kind: 'rejection' as const,
        appropriatelyRejected: Boolean(parsed && parsed.status !== 'interpreted'),
        expectedReason: sample.reason ?? null,
      };
    const expected = sample.expectedBoard!;
    const total = expected.width * expected.height;
    const dimensionsCorrect =
      parsed?.width === expected.width && parsed?.height === expected.height;
    const cells = new Map<number, InterpretationCell | null>();
    for (const cell of parsed?.cells ?? [])
      cells.set(cell.cell, cells.has(cell.cell) ? null : cell);
    const invalidCellLayout =
      (parsed?.cells.length ?? 0) !== total ||
      [...cells.entries()].some(([cell, value]) => cell >= total || value === null);
    let correctCells = 0;
    const symbolRecall = Object.fromEntries(
      symbols.map((symbol) => [symbol, { correct: 0, total: 0 }]),
    ) as Record<SymbolName, { correct: number; total: number }>;
    const missedCriticalSymbols: { cell: number; symbol: SymbolName }[] = [];
    for (let cell = 0; cell < total; cell += 1) {
      const predicted = dimensionsCorrect ? cells.get(cell) : undefined;
      const occupant = expectedOccupant(expected, cell);
      if (
        predicted &&
        predicted.terrain === expected.terrain[cell] &&
        predicted.occupant === occupant
      )
        correctCells += 1;
      const present: SymbolName[] = [];
      if (expected.terrain[cell] !== 'floor') present.push(expected.terrain[cell] as SymbolName);
      if (occupant !== 'none') present.push(occupant);
      for (const symbol of present) {
        symbolRecall[symbol].total += 1;
        const correct =
          predicted &&
          (symbol === 'player' || symbol === 'crate'
            ? predicted.occupant === symbol
            : predicted.terrain === symbol);
        if (correct) symbolRecall[symbol].correct += 1;
        else if (critical.includes(symbol)) missedCriticalSymbols.push({ cell, symbol });
      }
    }
    let structurallyValid = false;
    if (parsed && dimensionsCorrect && !invalidCellLayout) {
      const ordered = Array.from({ length: total }, (_, cell) => cells.get(cell)!);
      const players = ordered.flatMap((cell, index) =>
        cell?.occupant === 'player' ? [index] : [],
      );
      structurallyValid =
        players.length === 1 &&
        validateBoard({
          schemaVersion: 1,
          rulesVersion: 1,
          width: parsed.width,
          height: parsed.height,
          terrain: ordered.map((cell) => cell?.terrain),
          player: players[0],
          crates: ordered.flatMap((cell, index) => (cell?.occupant === 'crate' ? [index] : [])),
        }).length === 0;
    }
    return {
      ...base,
      kind: 'board' as const,
      dimensionsCorrect,
      structurallyValid,
      cellAccuracy: ratio(correctCells, total),
      exactBoard: correctCells === total && !invalidCellLayout && structurallyValid,
      symbolRecall,
      missedCriticalSymbols,
      mismatchedCells: total - correctCells,
      uncertainCells: parsed?.cells.filter((cell) => cell.uncertain).length ?? 0,
    };
  });

  const aggregate = (selected: typeof output, available: EvaluationSample[]) => {
    const boards = selected.filter((item) => item.kind === 'board');
    const rejected = selected.filter((item) => item.kind === 'rejection');
    const correctCells = boards.reduce((sum, item) => sum + (item.cellAccuracy?.correct ?? 0), 0);
    const totalCells = boards.reduce((sum, item) => sum + (item.cellAccuracy?.total ?? 0), 0);
    const symbolRecall = Object.fromEntries(
      symbols.map((symbol) => [
        symbol,
        ratio(
          boards.reduce((sum, item) => sum + (item.symbolRecall?.[symbol].correct ?? 0), 0),
          boards.reduce((sum, item) => sum + (item.symbolRecall?.[symbol].total ?? 0), 0),
        ),
      ]),
    );
    const allSymbols = Object.values(symbolRecall);
    const read = (name: keyof Measurements) =>
      selected.flatMap((item) => {
        const value = item.measurements[name];
        return typeof value === 'number' ? [value] : [];
      });
    return {
      availableSamples: available.length,
      recordedSamples: selected.length,
      unmeasuredSamples: available.length - selected.length,
      boardSamples: boards.length,
      rejectionSamples: rejected.length,
      outputErrors: selected.filter((item) => item.outputError).length,
      cellAccuracy: ratio(correctCells, totalCells),
      exactBoardAccuracy: ratio(boards.filter((item) => item.exactBoard).length, boards.length),
      nonFloorSymbolRecall: ratio(
        allSymbols.reduce((sum, metric) => sum + metric.correct, 0),
        allSymbols.reduce((sum, metric) => sum + metric.total, 0),
      ),
      perSymbolRecall: symbolRecall,
      missedCriticalSymbols: boards.reduce(
        (sum, item) => sum + (item.missedCriticalSymbols?.length ?? 0),
        0,
      ),
      rejectionRate: ratio(
        rejected.filter((item) => item.appropriatelyRejected).length,
        rejected.length,
      ),
      correctionActions: measurement(
        selected.flatMap((item) =>
          typeof item.correctionActions === 'number' ? [item.correctionActions] : [],
        ),
      ),
      measurements: {
        latencyMs: measurement(read('latencyMs')),
        inputTokens: measurement(read('inputTokens')),
        outputTokens: measurement(read('outputTokens')),
        neurons: measurement(read('neurons')),
        costUsd: measurement(read('costUsd')),
      },
    };
  };
  return {
    evaluationVersion: 1,
    dataset: dataset.name,
    status: output.length ? 'imported_outputs_scored' : 'not_run',
    declaredRun: predictions.run ?? null,
    evidence:
      'Offline scoring only. No model calls are made. Imported output provenance is supplied by the caller, not independently verified by this harness.',
    metricNotes: [
      'Wrong dimensions yield zero correct cells and zero symbol recall for that sample.',
      'Cell accuracy requires both terrain and occupant to match. Non-floor recall counts walls, player, crates, key, door, and exit separately.',
      'Critical misses are expected player/crate/key/door/exit symbols absent or misplaced at their annotated cell; walls are tracked by symbol recall.',
      'Uncertain but correct cells receive credit. Exact-board accuracy scores the grid independently of the model status label.',
      'Correction actions are observed user actions only when supplied; mismatched cell count is not presented as observed correction effort.',
      'Unknown measurements remain null with reportedCount:0. Unmeasured samples do not enter accuracy denominators; failed recorded outputs do.',
      'p50/p95 use nearest-rank percentiles over supplied measurements. Synthetic sketches cannot establish real handwriting/photo accuracy.',
    ],
    overall: aggregate(output, dataset.samples),
    splits: Object.fromEntries(
      (['dev', 'heldout', 'rejection'] as const).map((split) => [
        split,
        aggregate(
          output.filter((item) => item.split === split),
          dataset.samples.filter((sample) => sample.split === split),
        ),
      ]),
    ),
    samples: output,
  };
}
