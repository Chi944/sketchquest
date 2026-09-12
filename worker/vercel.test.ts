import { BlobPreconditionFailedError } from '@vercel/blob';
import { describe, expect, it, vi } from 'vitest';
import { EXAMPLES } from '../src/core/examples';
import {
  admitVercelShare,
  createVercelApp,
  storageDeadline,
  type SnapshotStore,
  type VercelEnv,
} from './vercel';

class MemoryStore implements SnapshotStore {
  records = new Map<string, { value: unknown; etag: string }>();
  writes = 0;
  async read(path: string) {
    const value = this.records.get(path);
    return value ? structuredClone(value) : null;
  }
  async write(path: string, value: unknown, previousEtag?: string) {
    const stored = this.records.get(path);
    if (stored && !previousEtag) throw new Error('Blob already exists');
    if (stored?.etag !== previousEtag) throw new BlobPreconditionFailedError();
    this.records.set(path, { value: structuredClone(value), etag: String(++this.writes) });
  }
}
const env: VercelEnv = {
  VERCEL_HOBBY_CONFIRMED: 'true',
  BLOB_READ_WRITE_TOKEN: 'mock-test-token-never-sent',
  QUOTA_SECRET: 'test-quota-secret-at-least-32-characters',
};
const origin = 'https://sketchquest.example';
function post(value: unknown, extraHeaders: Record<string, string> = {}) {
  return new Request(`${origin}/api/shares`, {
    method: 'POST',
    headers: {
      origin,
      'Content-Type': 'application/json',
      'x-vercel-forwarded-for': '192.0.2.1',
      ...extraHeaders,
    },
    body: JSON.stringify(value),
  });
}
const input = { title: 'An immutable puzzle', board: EXAMPLES[0].board };

describe('Vercel deployment adapter', () => {
  it('enforces its deadline even if a storage retry is sleeping when aborted', async () => {
    vi.useFakeTimers();
    try {
      let capturedSignal: AbortSignal | undefined;
      const operation = storageDeadline(
        (signal) =>
          new Promise<void>(() => {
            capturedSignal = signal;
          }),
      );
      const rejection = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
      await vi.advanceTimersByTimeAsync(5_000);
      await rejection;
      expect(capturedSignal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it('reports real storage availability and disabled live AI', async () => {
    const app = createVercelApp(new MemoryStore());
    const response = await app.request(`${origin}/api/status`, {}, env);
    expect(await response.json()).toMatchObject({ aiEnabled: false, sharingEnabled: true });
    const unconfirmed = await app.request(
      `${origin}/api/status`,
      {},
      { ...env, VERCEL_HOBBY_CONFIRMED: 'false' },
    );
    expect(await unconfirmed.json()).toMatchObject({ sharingEnabled: false });
  });
  it('creates a durable random-ID snapshot without retaining private editor metadata', async () => {
    const store = new MemoryStore();
    const app = createVercelApp(store);
    const response = await app.fetch(post(input), env);
    expect(response.status).toBe(201);
    const share = (await response.json()) as { id: string; url: string };
    expect(share.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(share.url).toBe(`${origin}/s/${share.id}`);
    const read = await app.request(`${origin}/api/shares/${share.id}`, {}, env);
    expect(read.headers.get('cache-control')).toContain('immutable');
    const snapshot = await read.json();
    expect(snapshot).toEqual({ ...input, id: share.id, createdAt: expect.any(String) });
    expect(store.records.size).toBe(2);
    expect(JSON.stringify(store.records.get('private/quota-v1.json'))).not.toContain('192.0.2.1');
  });
  it('rejects metadata, invalid boards, missing origins and bad IDs before writing', async () => {
    const store = new MemoryStore();
    const app = createVercelApp(store);
    expect((await app.fetch(post({ ...input, photo: 'private' }), env)).status).toBe(400);
    expect((await app.fetch(post({ ...input, board: {} }), env)).status).toBe(422);
    expect((await app.fetch(post(input, { origin: 'https://other.example' }), env)).status).toBe(
      403,
    );
    expect((await app.request(`${origin}/api/shares/not-an-id`, {}, env)).status).toBe(404);
    expect((await app.request(`${origin}/api/shares/${'A'.repeat(22)}`, {}, env)).status).toBe(404);
    expect(store.writes).toBe(0);
  });
  it('requires the verified Hobby guard and a quota secret before any storage access', async () => {
    const store = new MemoryStore();
    const response = await createVercelApp(store).fetch(post(input), {
      ...env,
      QUOTA_SECRET: undefined,
    });
    expect(response.status).toBe(503);
    expect(store.writes).toBe(0);
  });
  it('fails closed on live inference and unknown API paths', async () => {
    const app = createVercelApp(new MemoryStore());
    const response = await app.request(
      `${origin}/api/propose`,
      { method: 'POST', headers: { origin } },
      env,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'AI_DISABLED' } });
    expect((await app.request(`${origin}/api/unknown`, {}, env)).status).toBe(404);
  });
});

describe('persistent conditional-write share quotas', () => {
  const now = Date.UTC(2026, 8, 13, 12);
  const client = 'a'.repeat(64);
  it('admits only one concurrent first write and never retries an uncertain reservation', async () => {
    const store = new MemoryStore();
    const results = await Promise.allSettled([
      admitVercelShare(store, client, now),
      admitVercelShare(store, client, now),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(store.writes).toBe(1);
  });
  it('enforces a three-per-minute limit across app instances', async () => {
    const store = new MemoryStore();
    for (let i = 0; i < 3; i++) await admitVercelShare(store, client, now + i);
    await expect(admitVercelShare(store, client, now + 3)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryAfter: 60,
    });
    await expect(admitVercelShare(store, client, now + 60_003)).resolves.toBeUndefined();
  });
  it('enforces twenty global daily reservations even when client identities change', async () => {
    const store = new MemoryStore();
    for (let i = 0; i < 20; i++)
      await admitVercelShare(store, i.toString(16).padStart(64, '0'), now);
    await expect(admitVercelShare(store, client, now)).rejects.toMatchObject({
      code: 'DAILY_LIMIT',
    });
    expect(store.writes).toBe(20);
  });
  it('enforces a 450 reservation rolling-month cap and a 10000 lifetime cap', async () => {
    const store = new MemoryStore();
    await store.write('private/quota-v1.json', {
      version: 1,
      total: 450,
      entries: Array.from({ length: 450 }, () => ({ at: now - 86_400_000, client })),
    });
    await expect(admitVercelShare(store, client, now)).rejects.toMatchObject({
      code: 'SHARE_CAPACITY',
    });
    store.records.clear();
    await store.write('private/quota-v1.json', { version: 1, total: 10_000, entries: [] });
    await expect(admitVercelShare(store, client, now)).rejects.toMatchObject({
      code: 'SHARE_CAPACITY',
    });
  });
  it('drops expired quota entries without resetting the lifetime cap', async () => {
    const store = new MemoryStore();
    await store.write('private/quota-v1.json', {
      version: 1,
      total: 500,
      entries: [{ at: now - 31 * 86_400_000, client }],
    });
    await admitVercelShare(store, client, now);
    expect(store.records.get('private/quota-v1.json')?.value).toEqual({
      version: 1,
      total: 501,
      entries: [{ at: now, client }],
    });
  });
});
