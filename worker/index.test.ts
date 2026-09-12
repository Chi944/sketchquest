import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boardHash, emptyBoard } from '../src/core/board';
import { app } from './index';
import type { Env } from './env';
import { testDatabase } from './test-db';

const origin = 'http://localhost:5173';
const validProposal = {
  status: 'proposed',
  objective: 'edit',
  message: 'Added a wall.',
  candidates: [
    {
      explanation: 'A wall at the top-left.',
      edits: [{ cell: 0, terrain: 'wall', occupant: 'none' }],
    },
  ],
};
const proposal = (requestId = crypto.randomUUID()) => {
  const board = emptyBoard(4, 4);
  return {
    requestId,
    baseRevisionId: 'revision-1',
    baseHash: boardHash(board),
    board,
    prompt: 'Add a wall in the top-left corner.',
    selectedCells: [],
  };
};
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${origin}${path}`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

describe('SketchQuest API with migrated SQLite and fake AI', () => {
  let database: ReturnType<typeof testDatabase>;
  let env: Env;
  beforeEach(() => {
    database = testDatabase();
    env = { DB: database.db };
  });
  afterEach(() => {
    database.close();
    vi.restoreAllMocks();
  });
  const count = (database: ReturnType<typeof testDatabase>, table = 'admissions') =>
    Number(database.sqlite.prepare(`SELECT count(*) AS count FROM ${table}`).get()!.count);
  const enableAi = () => {
    env.FREE_PLAN_CONFIRMED = 'true';
    env.AI = { run: vi.fn(async () => ({ response: validProposal })) };
  };

  it('keeps AI disabled by default and requires a production quota secret', async () => {
    env.AI = { run: vi.fn() };
    expect(await (await app.request(`${origin}/api/status`, {}, env)).json()).toMatchObject({
      aiEnabled: false,
      sharingEnabled: true,
    });
    expect((await app.request(post('/api/propose', proposal()), {}, env)).status).toBe(503);
    expect(env.AI.run).not.toHaveBeenCalled();
    const remote = await app.request(
      'https://sketchquest.example/api/status',
      {},
      { ...env, FREE_PLAN_CONFIRMED: 'true' },
    );
    expect(await remote.json()).toMatchObject({ aiEnabled: false, sharingEnabled: false });
  });

  it('round-trips a sanitized immutable public snapshot', async () => {
    const board = { ...emptyBoard(4, 4), hiddenPrompt: 'must not persist' };
    const created = await app.request(post('/api/shares', { board, title: 'My puzzle' }), {}, env);
    expect(created.status).toBe(201);
    const result = (await created.json()) as { id: string; url: string };
    expect(result.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(result.url).toBe(`${origin}/s/${result.id}`);
    const response = await app.request(`${origin}/api/shares/${result.id}`, {}, env);
    expect(response.headers.get('Cache-Control')).toContain('immutable');
    const saved = (await response.json()) as { board: unknown; title: string };
    expect(saved.board).toEqual(emptyBoard(4, 4));
    expect(saved.title).toBe('My puzzle');
    expect(count(database, 'shares')).toBe(1);
  });

  it('rejects foreign/missing origins and malformed content before writes', async () => {
    const body = { board: emptyBoard(4, 4), title: 'My puzzle' };
    expect(
      (
        await app.request(
          post('/api/shares', body, { Origin: 'https://attacker.example' }),
          {},
          env,
        )
      ).status,
    ).toBe(403);
    expect((await app.request(post('/api/shares', body, { Origin: '' }), {}, env)).status).toBe(
      403,
    );
    expect(
      (await app.request(post('/api/shares', body, { 'Content-Type': 'text/plain' }), {}, env))
        .status,
    ).toBe(415);
    expect(
      (await app.request(post('/api/shares', { ...body, title: 'a'.repeat(33_000) }), {}, env))
        .status,
    ).toBe(413);
    expect(count(database)).toBe(0);
  });

  it('rejects structurally invalid boards and missing links', async () => {
    const board = emptyBoard(4, 4);
    board.terrain[board.player] = 'wall';
    expect(
      (await app.request(post('/api/shares', { board, title: 'Broken' }), {}, env)).status,
    ).toBe(422);
    expect((await app.request(`${origin}/api/shares/not-a-real-id`, {}, env)).status).toBe(404);
    expect((await app.request(`${origin}/api/shares/${'a'.repeat(22)}`, {}, env)).status).toBe(404);
    expect(count(database)).toBe(0);
  });

  it('serializes share admission under simultaneous requests even with reset cookies', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        app.request(post('/api/shares', { board: emptyBoard(4, 4), title: 'Concurrent' }), {}, env),
      ),
    );
    expect(results.filter((response) => response.status === 201)).toHaveLength(3);
    expect(results.filter((response) => response.status === 429)).toHaveLength(7);
    expect(count(database)).toBe(3);
    expect(count(database, 'shares')).toBe(3);
  });

  it('deduplicates a request even when the original response cookie was lost', async () => {
    enableAi();
    const input = proposal();
    const first = await app.request(post('/api/propose', input), {}, env);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      requestId: input.requestId,
      baseRevisionId: input.baseRevisionId,
      baseHash: input.baseHash,
      ...validProposal,
    });
    const second = await app.request(post('/api/propose', input), {}, env);
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ error: { code: 'DUPLICATE_REQUEST' } });
    expect(env.AI!.run).toHaveBeenCalledTimes(1);
    expect(count(database)).toBe(1);
  });

  it('enforces two AI calls per rolling minute with SQL admission', async () => {
    enableAi();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => app.request(post('/api/propose', proposal()), {}, env)),
    );
    expect(results.filter((response) => response.status === 200)).toHaveLength(2);
    expect(results.filter((response) => response.status === 429)).toHaveLength(4);
    expect(env.AI!.run).toHaveBeenCalledTimes(2);
  });

  it('enforces actor daily quota across different IPs and the UTC reset', async () => {
    enableAi();
    const now = vi.spyOn(Date, 'now');
    const day = Date.parse('2026-09-12T10:00:00Z');
    let cookie = '';
    for (let i = 0; i < 10; i++) {
      now.mockReturnValue(day + i * 61_000);
      const result = await app.request(
        post('/api/propose', proposal(), { Cookie: cookie, 'CF-Connecting-IP': `192.0.2.${i}` }),
        {},
        env,
      );
      expect(result.status).toBe(200);
      cookie = result.headers.get('Set-Cookie')?.split(';')[0] ?? cookie;
    }
    now.mockReturnValue(day + 11 * 61_000);
    const limited = await app.request(
      post('/api/propose', proposal(), { Cookie: cookie, 'CF-Connecting-IP': '192.0.2.99' }),
      {},
      env,
    );
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ error: { code: 'DAILY_LIMIT' } });
    now.mockReturnValue(Date.parse('2026-09-13T00:00:00Z'));
    expect(
      (await app.request(post('/api/propose', proposal(), { Cookie: cookie }), {}, env)).status,
    ).toBe(200);
  });

  it('enforces the global 50-call allowance independently of actor and IP', async () => {
    enableAi();
    for (let i = 0; i < 50; i++) {
      const result = await app.request(
        post('/api/propose', proposal(), { 'CF-Connecting-IP': `192.0.2.${i}` }),
        {},
        env,
      );
      expect(result.status).toBe(200);
    }
    const limited = await app.request(
      post('/api/propose', proposal(), { 'CF-Connecting-IP': '192.0.2.99' }),
      {},
      env,
    );
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ error: { code: 'DAILY_LIMIT' } });
    expect(env.AI!.run).toHaveBeenCalledTimes(50);
  });

  it('checks revision identity and invalid candidate output without accepting it', async () => {
    enableAi();
    expect(
      (await app.request(post('/api/propose', { ...proposal(), baseHash: 'stale' }), {}, env))
        .status,
    ).toBe(409);
    expect(env.AI!.run).not.toHaveBeenCalled();
    env.AI!.run = vi.fn(async () => ({
      response: {
        ...validProposal,
        candidates: [
          { explanation: 'Bad', edits: [{ cell: 5, terrain: 'wall', occupant: 'player' }] },
        ],
      },
    }));
    expect((await app.request(post('/api/propose', proposal()), {}, env)).status).toBe(502);
  });

  it('accepts bounded image uploads and validates a complete interpretation', async () => {
    enableAi();
    const interpretation = {
      status: 'interpreted',
      width: 4,
      height: 4,
      cells: Array.from({ length: 16 }, (_, cell) => ({
        cell,
        terrain: cell === 10 ? 'exit' : 'floor',
        occupant: cell === 5 ? 'player' : 'none',
        uncertain: false,
        alternatives: [],
        note: '',
      })),
      notes: ['Review the drawing before applying.'],
    };
    env.AI!.run = vi.fn(async () => ({
      response: interpretation,
      usage: { prompt_tokens: 1000, completion_tokens: 500 },
    }));
    const bytes = new Uint8Array(33);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    bytes.set([73, 72, 68, 82], 12);
    const view = new DataView(bytes.buffer);
    view.setUint32(8, 13);
    view.setUint32(16, 640);
    view.setUint32(20, 480);
    const form = new FormData();
    const id = crypto.randomUUID();
    form.set('image', new Blob([bytes], { type: 'image/png' }), 'drawing.png');
    form.set('requestId', id);
    form.set('width', '4');
    form.set('height', '4');
    const response = await app.request(
      new Request(`${origin}/api/interpret`, {
        method: 'POST',
        headers: { Origin: origin },
        body: form,
      }),
      {},
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      requestId: id,
      interpretation,
      metrics: {
        latencyMs: expect.any(Number),
        inputTokens: 1000,
        outputTokens: 500,
        estimatedNeurons: 35.157,
        actualCostUsd: 0,
        costBasis: 'confirmed-free-plan',
      },
    });
    expect(env.AI!.run).toHaveBeenCalledWith(
      '@cf/meta/llama-3.2-11b-vision-instruct',
      expect.objectContaining({
        image: expect.stringMatching(/^data:image\/png;base64,/),
        response_format: expect.objectContaining({ type: 'json_schema' }),
        max_tokens: 4096,
        stream: false,
      }),
    );
  });

  it('rejects disguised uploads before consuming an AI call', async () => {
    enableAi();
    const form = new FormData();
    form.set(
      'image',
      new Blob(['<svg>not an allowed image</svg>'], { type: 'image/png' }),
      'drawing.png',
    );
    form.set('requestId', crypto.randomUUID());
    const response = await app.request(
      new Request(`${origin}/api/interpret`, {
        method: 'POST',
        headers: { Origin: origin },
        body: form,
      }),
      {},
      env,
    );
    expect(response.status).toBe(415);
    expect(env.AI!.run).not.toHaveBeenCalled();
    expect(count(database)).toBe(0);
  });

  it('does not expose provider errors or persist requests and model responses', async () => {
    enableAi();
    env.AI!.run = vi.fn(async () => {
      throw new Error('Upstream failed with SECRET and private image data');
    });
    const response = await app.request(post('/api/propose', proposal()), {}, env);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('SECRET');
    const columns = database.sqlite
      .prepare('PRAGMA table_info(admissions)')
      .all()
      .map((row) => row.name);
    expect(columns).toEqual(['request_key', 'kind', 'actor_key', 'ip_key', 'created_at']);
  });
});
