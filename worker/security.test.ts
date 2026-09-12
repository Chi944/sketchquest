import { describe, expect, it } from 'vitest';
import { inspectImage, readBounded } from './security';
import {
  anchorPermission,
  providerMetrics,
  runJson,
  validateCandidate,
  validateInterpretation,
  interpretationSchema,
} from './ai';
import { emptyBoard } from '../src/core/board';

const pngHeader = (width: number, height: number) => {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.set([73, 72, 68, 82], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
};

describe('untrusted inputs and model results', () => {
  it('bounds chunked uploads without relying on Content-Length', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(5));
        controller.enqueue(new Uint8Array(6));
        controller.close();
      },
    });
    const request = new Request('http://localhost/upload', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit);
    await expect(readBounded(request, 10)).rejects.toMatchObject({ code: 'BODY_TOO_LARGE' });
  });

  it('checks image signatures, MIME agreement, and dimensions', () => {
    expect(inspectImage(pngHeader(640, 480), 'image/png')).toEqual({
      width: 640,
      height: 480,
      mime: 'image/png',
    });
    expect(() => inspectImage(pngHeader(640, 480), 'image/jpeg')).toThrow('PNG, JPEG, or WebP');
    expect(() => inspectImage(pngHeader(9999, 480), 'image/png')).toThrow('1536');
    expect(() =>
      inspectImage(new TextEncoder().encode('<svg onload="alert(1)"></svg>'), 'image/png'),
    ).toThrow('PNG, JPEG, or WebP');
  });

  it('keeps anchors fixed for absent, negated, or ambiguous permissions', () => {
    expect(anchorPermission('Move the player one square right.', 'player')).toBe(true);
    expect(anchorPermission('Do not move the player.', 'player')).toBe(false);
    expect(anchorPermission('Please keep the exit and move a wall.', 'exit')).toBe(false);
    const board = emptyBoard(4, 4);
    const candidate = {
      explanation: 'Move',
      edits: [{ cell: 6, terrain: 'floor' as const, occupant: 'player' as const }],
    };
    expect(() => validateCandidate(board, candidate, 'Add a wall')).toThrow(
      'without a clear request',
    );
    expect(validateCandidate(board, candidate, 'Move the player right').player).toBe(6);
  });

  it('counts implicit old occupant changes toward the six-cell limit', () => {
    const board = emptyBoard(4, 4);
    const candidate = {
      explanation: 'Too much',
      edits: [
        { cell: 6, terrain: 'floor' as const, occupant: 'player' as const },
        ...[0, 1, 2, 3, 4].map((cell) => ({
          cell,
          terrain: 'wall' as const,
          occupant: 'none' as const,
        })),
      ],
    };
    expect(() => validateCandidate(board, candidate, 'Move the player right')).toThrow(
      'between one and six cells',
    );
  });

  it('rejects incomplete or duplicated interpretations while preserving explicit uncertainty', () => {
    const cell = {
      cell: 0,
      terrain: 'floor' as const,
      occupant: 'none' as const,
      uncertain: true,
      alternatives: ['wall'],
      note: 'Faint line',
    };
    expect(() =>
      validateInterpretation({
        status: 'interpreted',
        width: 4,
        height: 4,
        cells: [cell],
        notes: [],
      }),
    ).toThrow('entire grid');
    expect(() =>
      validateInterpretation({
        status: 'needs_clarification',
        width: 4,
        height: 4,
        cells: [cell, cell],
        notes: [],
      }),
    ).toThrow('inconsistent');
    const value = {
      status: 'needs_clarification' as const,
      width: 4,
      height: 4,
      cells: [cell],
      notes: ['Confirm geometry'],
    };
    expect(validateInterpretation(value)).toEqual(value);
  });

  it('handles JSON Mode objects, strings, and invalid provider output', async () => {
    const value = {
      status: 'unsupported',
      width: null,
      height: null,
      cells: [],
      notes: ['No puzzle found'],
    };
    const ai = { run: async () => ({ response: JSON.stringify(value) }) };
    expect(await runJson(ai, 'test', interpretationSchema, 100)).toEqual({ value, metrics: {} });
    await expect(
      runJson(
        { run: async () => ({ response: { ...value, status: 'made_up' } }) },
        'test',
        interpretationSchema,
        100,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_AI_RESPONSE' });
    await expect(
      runJson(
        {
          run: async () => {
            throw new Error('3036 daily free allocation');
          },
        },
        'test',
        interpretationSchema,
        100,
      ),
    ).rejects.toMatchObject({ code: 'AI_DAILY_LIMIT', status: 429 });
  });

  it('reports only provider-supplied token counters and labels neuron calculation as estimated', () => {
    expect(providerMetrics({ usage: { prompt_tokens: 1000, completion_tokens: 500 } })).toEqual({
      inputTokens: 1000,
      outputTokens: 500,
      estimatedNeurons: 35.157,
    });
    expect(providerMetrics({ usage: { input_tokens: 1000 } })).toEqual({ inputTokens: 1000 });
    expect(providerMetrics({ usage: { prompt_tokens: -1, completion_tokens: '500' } })).toEqual({});
    expect(providerMetrics({ response: 'No usage supplied' })).toEqual({});
  });
});
