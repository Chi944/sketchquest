import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { boardFromAscii, boardHash } from '../src/core/board';
import type { BoardDefinition, Interpretation } from '../src/core/types';
import { evaluate, parseDataset, parsePredictions, type EvaluationDataset } from './evaluate';

const board = boardFromAscii(['PKDE', '.C..', '....', '....']);
function output(expected: BoardDefinition = board): Interpretation {
  return {
    status: 'interpreted',
    width: expected.width,
    height: expected.height,
    notes: [],
    cells: expected.terrain.map((terrain, cell) => ({
      cell,
      terrain,
      occupant:
        cell === expected.player ? 'player' : expected.crates.includes(cell) ? 'crate' : 'none',
      uncertain: false,
      alternatives: [],
      note: '',
    })),
  };
}
function dataset(): EvaluationDataset {
  return parseDataset({
    schemaVersion: 1,
    name: 'Offline evaluator unit-test fixtures',
    samples: [
      {
        id: 'one',
        sourceBoardId: 'one',
        image: 'unused.svg',
        split: 'dev',
        kind: 'board',
        expectedBoard: board,
      },
    ],
  });
}

describe('offline extraction metrics', () => {
  it('counts exact terrain + occupant matches and preserves reported measurement coverage', () => {
    const interpreted = output();
    interpreted.cells[1].uncertain = true;
    const report = evaluate(
      dataset(),
      parsePredictions({
        schemaVersion: 1,
        records: [
          {
            sampleId: 'one',
            interpretation: interpreted,
            correctionActions: 0,
            measurements: {
              latencyMs: 120,
              inputTokens: 100,
              outputTokens: 80,
              neurons: null,
              costUsd: 0,
            },
          },
        ],
      }),
    );
    expect(report.overall.cellAccuracy).toEqual({ correct: 16, total: 16, rate: 1 });
    expect(report.overall.exactBoardAccuracy.rate).toBe(1);
    expect(report.overall.nonFloorSymbolRecall).toEqual({ correct: 5, total: 5, rate: 1 });
    expect(report.overall.measurements.costUsd).toMatchObject({ reportedCount: 1, total: 0 });
    expect(report.overall.measurements.neurons).toMatchObject({ reportedCount: 0, total: null });
    expect(report.overall.correctionActions).toMatchObject({ reportedCount: 1, total: 0 });
  });

  it('scores wrong dimensions as zero even when cell labels coincidentally match', () => {
    const interpreted = output();
    interpreted.width = 5;
    const report = evaluate(
      dataset(),
      parsePredictions({
        schemaVersion: 1,
        records: [{ sampleId: 'one', interpretation: interpreted }],
      }),
    );
    expect(report.overall.cellAccuracy).toEqual({ correct: 0, total: 16, rate: 0 });
    expect(report.overall.nonFloorSymbolRecall.rate).toBe(0);
    expect(report.overall.missedCriticalSymbols).toBe(5);
    expect(report.overall.exactBoardAccuracy.rate).toBe(0);
  });

  it('makes missed critical symbols visible despite many correctly blank floor cells', () => {
    const interpreted = output();
    interpreted.cells[1].terrain = 'floor';
    interpreted.cells[5].occupant = 'none';
    const report = evaluate(
      dataset(),
      parsePredictions({
        schemaVersion: 1,
        records: [{ sampleId: 'one', interpretation: interpreted }],
      }),
    );
    expect(report.overall.cellAccuracy).toEqual({ correct: 14, total: 16, rate: 0.875 });
    expect(report.overall.nonFloorSymbolRecall).toEqual({ correct: 3, total: 5, rate: 0.6 });
    expect(report.overall.missedCriticalSymbols).toBe(2);
    expect(report.overall.correctionActions.reportedCount).toBe(0);
    expect(report.overall.exactBoardAccuracy.rate).toBe(0);
  });

  it('does not silently deduplicate conflicting cells or omit failed recorded requests', () => {
    const interpreted = output();
    interpreted.cells.push({ ...interpreted.cells[0] });
    const report = evaluate(
      dataset(),
      parsePredictions({
        schemaVersion: 1,
        records: [{ sampleId: 'one', interpretation: interpreted }],
      }),
    );
    expect(report.overall.cellAccuracy.correct).toBe(15);
    expect(report.overall.exactBoardAccuracy.rate).toBe(0);
    const failed = evaluate(
      dataset(),
      parsePredictions({
        schemaVersion: 1,
        records: [
          {
            sampleId: 'one',
            interpretation: null,
            error: 'Image decode failed',
            measurements: { latencyMs: 22 },
          },
        ],
      }),
    );
    expect(failed.overall.cellAccuracy.rate).toBe(0);
    expect(failed.overall.outputErrors).toBe(1);
    expect(failed.overall.measurements.latencyMs.reportedCount).toBe(1);
  });

  it('keeps unavailable live accuracy and cost null instead of manufacturing results', () => {
    const report = evaluate(dataset(), parsePredictions({ schemaVersion: 1, records: [] }));
    expect(report.status).toBe('not_run');
    expect(report.overall.unmeasuredSamples).toBe(1);
    expect(report.overall.cellAccuracy.rate).toBeNull();
    expect(report.overall.exactBoardAccuracy.rate).toBeNull();
    expect(report.overall.measurements.costUsd.total).toBeNull();
  });

  it('separates cautious rejection from crashes and valid-board accuracy', () => {
    const data = parseDataset({
      schemaVersion: 1,
      name: 'Rejection test',
      samples: [
        {
          id: 'bad',
          sourceBoardId: 'bad',
          image: 'unused.svg',
          kind: 'rejection',
          split: 'rejection',
        },
      ],
    });
    const rejected = evaluate(
      data,
      parsePredictions({
        schemaVersion: 1,
        records: [
          {
            sampleId: 'bad',
            interpretation: {
              status: 'needs_clarification',
              width: null,
              height: null,
              cells: [],
              notes: ['Two players'],
            },
          },
        ],
      }),
    );
    expect(rejected.overall.rejectionRate.rate).toBe(1);
    expect(rejected.overall.cellAccuracy.rate).toBeNull();
    const failed = evaluate(
      data,
      parsePredictions({
        schemaVersion: 1,
        records: [{ sampleId: 'bad', error: 'Network error' }],
      }),
    );
    expect(failed.overall.rejectionRate.rate).toBe(0);
  });

  it('rejects dataset split leakage, duplicate/unknown outputs, and impossible measurements', () => {
    const first = dataset().samples[0];
    expect(() =>
      parseDataset({
        schemaVersion: 1,
        name: 'Leak',
        samples: [first, { ...first, id: 'two', split: 'heldout' }],
      }),
    ).toThrow(/leaks/);
    expect(() =>
      parseDataset({
        schemaVersion: 1,
        name: 'Leak',
        samples: [first, { ...first, id: 'two', sourceBoardId: 'renamed', split: 'heldout' }],
      }),
    ).toThrow(/leaks/);
    expect(() =>
      parsePredictions({ schemaVersion: 1, records: [{ sampleId: 'one' }, { sampleId: 'one' }] }),
    ).toThrow(/Duplicate/);
    expect(() =>
      parsePredictions({
        schemaVersion: 1,
        records: [{ sampleId: 'one', measurements: { costUsd: -1 } }],
      }),
    ).toThrow();
    expect(() =>
      evaluate(
        dataset(),
        parsePredictions({ schemaVersion: 1, records: [{ sampleId: 'missing' }] }),
      ),
    ).toThrow(/unknown/);
  });

  it('checks the committed corpus counts, source split separation, unique boards, and readable images', () => {
    const data = parseDataset(
      JSON.parse(readFileSync(new URL('./dataset.json', import.meta.url), 'utf8')),
    );
    expect(data.samples.filter((sample) => sample.split === 'dev')).toHaveLength(12);
    expect(data.samples.filter((sample) => sample.split === 'heldout')).toHaveLength(12);
    expect(data.samples.filter((sample) => sample.kind === 'rejection')).toHaveLength(6);
    expect(
      new Set(
        data.samples
          .filter((sample) => sample.expectedBoard)
          .map((sample) => boardHash(sample.expectedBoard!)),
      ).size,
    ).toBe(24);
    expect(new Set(data.samples.map((sample) => sample.sourceBoardId)).size).toBe(30);
    for (const sample of data.samples)
      expect(readFileSync(new URL(`./${sample.image}`, import.meta.url), 'utf8')).toContain(
        'not human handwriting or a photograph',
      );
  });
});
