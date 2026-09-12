import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Interpretation } from '../core/types';
import { interpretPhoto, isInterpretation } from './api';

const interpretation: Interpretation = {
  status: 'interpreted',
  width: 4,
  height: 4,
  cells: [
    {
      cell: 0,
      terrain: 'floor',
      occupant: 'player',
      uncertain: true,
      alternatives: ['crate'],
      note: 'Faint circular mark.',
    },
  ],
  notes: [],
};
const request = () => ({
  image: new Blob(['prepared pixels'], { type: 'image/jpeg' }),
  requestId: 'photo-42',
  signal: new AbortController().signal,
});
afterEach(() => vi.unstubAllGlobals());

describe('photo interpretation transport', () => {
  it('sends only a prepared image and request identifier when grid and legend are absent', async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const form = init.body as FormData;
      expect([...form.keys()]).toEqual(['image', 'requestId']);
      expect((form.get('image') as File).name).toBe('sketchquest-crop.jpg');
      expect((form.get('image') as Blob).type).toBe('image/jpeg');
      expect(form.get('requestId')).toBe('photo-42');
      return Response.json({ requestId: 'photo-42', interpretation });
    });
    vi.stubGlobal('fetch', fetcher);
    expect(await interpretPhoto(request())).toEqual({ requestId: 'photo-42', interpretation });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe('/api/interpret');
  });
  it('sends explicit dimensions and a trimmed legend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const form = init.body as FormData;
        expect(form.get('width')).toBe('5');
        expect(form.get('height')).toBe('7');
        expect(form.get('legend')).toBe('Star is exit');
        return Response.json({ requestId: 'photo-42', interpretation });
      }),
    );
    await interpretPhoto({
      ...request(),
      grid: { width: 5, height: 7 },
      legend: '  Star is exit  ',
    });
  });
  it('preserves structured quota errors and makes no automatic retry', async () => {
    const fetcher = vi.fn(async () =>
      Response.json(
        { error: { code: 'quota_exhausted', message: 'Free quota is used up.', retryAfter: 60 } },
        { status: 429 },
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    await expect(interpretPhoto(request())).rejects.toMatchObject({
      code: 'quota_exhausted',
      message: 'Free quota is used up.',
      retryAfter: 60,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects stale request IDs and malformed successful output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ requestId: 'other-photo', interpretation })),
    );
    await expect(interpretPhoto(request())).rejects.toMatchObject({ code: 'invalid_response' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          requestId: 'photo-42',
          interpretation: { ...interpretation, cells: [{ terrain: '<script>' }] },
        }),
      ),
    );
    await expect(interpretPhoto(request())).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('keeps cancellation as cancellation and reports invalid JSON', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('Aborted', 'AbortError');
      }),
    );
    await expect(interpretPhoto({ ...request(), signal: controller.signal })).rejects.toMatchObject(
      { name: 'AbortError' },
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>Gateway failed</html>', { status: 502 })),
    );
    await expect(interpretPhoto(request())).rejects.toMatchObject({ code: 'invalid_response' });
  });
});

describe('interpretation boundary', () => {
  it('preserves uncertainty and clarification without requiring a playable board', () => {
    expect(isInterpretation(interpretation)).toBe(true);
    expect(
      isInterpretation({
        status: 'needs_clarification',
        width: null,
        height: null,
        cells: [],
        notes: ['Grid boundary unclear.'],
      }),
    ).toBe(true);
    expect(isInterpretation({ ...interpretation, width: 99 })).toBe(false);
    expect(
      isInterpretation({
        ...interpretation,
        cells: [{ ...interpretation.cells[0], uncertain: 'sure' }],
      }),
    ).toBe(false);
  });
});
