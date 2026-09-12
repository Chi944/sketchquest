import { BlobPreconditionFailedError, get, put } from '@vercel/blob';
import { Hono } from 'hono';
import { z } from 'zod';
import { parseBoard } from '../src/core/board.js';
import { MODEL } from './env.js';
import { ApiFault, nextUtcDaySeconds } from './errors.js';
import { hmac } from './quota.js';
import { shareRequestSchema } from './schemas.js';
import { assertSameOrigin, readBounded, readJson } from './security.js';

export interface VercelEnv {
  BLOB_READ_WRITE_TOKEN?: string;
  BLOB_STORE_ID?: string;
  VERCEL_OIDC_TOKEN?: string;
  VERCEL_HOBBY_CONFIRMED?: string;
  QUOTA_SECRET?: string;
}

export interface SnapshotStore {
  read(path: string, consistent?: boolean): Promise<{ value: unknown; etag: string } | null>;
  write(path: string, value: unknown, previousEtag?: string): Promise<void>;
}

/** AbortError makes the Blob SDK stop retrying, and the timer is always released. */
export async function storageDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(controller.signal.reason);
    }, 5_000);
  });
  try {
    return await Promise.race([operation(controller.signal), deadline]);
  } finally {
    clearTimeout(timer!);
  }
}

/** The store is private. Only canonical snapshots pass through the public read endpoint. */
export const blobStore: SnapshotStore = {
  async read(path, consistent = false) {
    return storageDeadline(async (signal) => {
      const result = await get(path, {
        access: 'private',
        useCache: !consistent,
        abortSignal: signal,
      });
      if (!result) return null;
      if (result.statusCode !== 200 || !result.stream) throw new Error('Unexpected Blob response');
      const bytes = await readBounded(
        new Request('https://sketchquest.invalid/stored-record', {
          method: 'POST',
          body: result.stream,
          // Required by Node when a Web Request has a streaming request body.
          duplex: 'half',
        } as RequestInit),
        128 * 1024,
      );
      return { value: JSON.parse(new TextDecoder().decode(bytes)), etag: result.blob.etag };
    });
  },
  async write(path, value, previousEtag) {
    await storageDeadline((signal) =>
      put(path, JSON.stringify(value), {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: Boolean(previousEtag),
        ...(previousEtag ? { ifMatch: previousEtag } : {}),
        contentType: 'application/json',
        cacheControlMaxAge: 60,
        abortSignal: signal,
      }),
    );
  },
};

const ledgerSchema = z.object({
  version: z.literal(1),
  total: z.number().int().min(0).max(10_000),
  entries: z
    .array(z.object({ at: z.number().int(), client: z.string().regex(/^[a-f0-9]{64}$/) }))
    .max(450),
});
const snapshotSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
    title: z.string().min(1).max(80),
    board: z.unknown(),
    createdAt: z.iso.datetime(),
  })
  .strict();
const dayMs = 86_400_000;
const ledgerPath = 'private/quota-v1.json';

/** A conditional write admits requests across server instances. Stale reads never overspend. */
export async function admitVercelShare(store: SnapshotStore, client: string, now = Date.now()) {
  const stored = await store.read(ledgerPath, true);
  const ledger = stored
    ? ledgerSchema.parse(stored.value)
    : { version: 1 as const, total: 0, entries: [] };
  const entries = ledger.entries.filter((entry) => entry.at > now - 30 * dayMs);
  if (ledger.total >= 10_000 || entries.length >= 450) {
    throw new ApiFault(
      'SHARE_CAPACITY',
      'The free sharing allowance is full. Export this puzzle as JSON instead.',
      503,
    );
  }
  const today = entries.filter((entry) => entry.at >= Math.floor(now / dayMs) * dayMs);
  if (today.length >= 20 || today.filter((entry) => entry.client === client).length >= 10) {
    throw new ApiFault(
      'DAILY_LIMIT',
      'The free daily sharing allowance has been reached. You can still export puzzles as JSON.',
      429,
      nextUtcDaySeconds(now),
    );
  }
  if (entries.filter((entry) => entry.client === client && entry.at > now - 60_000).length >= 3) {
    throw new ApiFault(
      'RATE_LIMITED',
      'Three puzzles were recently shared from this connection. Try again in a minute.',
      429,
      60,
    );
  }
  try {
    await store.write(
      ledgerPath,
      {
        version: 1,
        total: ledger.total + 1,
        entries: [...entries, { at: now, client }],
      },
      stored?.etag,
    );
  } catch (error) {
    // Do not retry writes: ambiguous failures may already have reserved an admission.
    if (
      error instanceof BlobPreconditionFailedError ||
      (error instanceof Error && /already exists/i.test(error.message))
    ) {
      throw new ApiFault(
        'SHARE_BUSY',
        'Another puzzle is being shared. Try again in a moment.',
        429,
        2,
      );
    }
    throw error;
  }
}

function sharingEnabled(env: VercelEnv) {
  return (
    env.VERCEL_HOBBY_CONFIRMED === 'true' &&
    Boolean(env.QUOTA_SECRET && env.QUOTA_SECRET.length >= 32) &&
    Boolean(env.BLOB_READ_WRITE_TOKEN || (env.BLOB_STORE_ID && env.VERCEL_OIDC_TOKEN))
  );
}

export function createVercelApp(store: SnapshotStore = blobStore) {
  const app = new Hono<{ Bindings: VercelEnv }>();
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(c.req.method)) assertSameOrigin(c.req.raw);
    await next();
  });
  app.onError((error, c) => {
    const fault =
      error instanceof ApiFault
        ? error
        : error instanceof z.ZodError
          ? new ApiFault('INVALID_REQUEST', 'Check the puzzle title and request fields.')
          : new ApiFault(
              'SERVICE_UNAVAILABLE',
              'Sharing is temporarily unavailable. Your local draft is safe; export JSON or try later.',
              503,
            );
    if (fault.retryAfter) c.header('Retry-After', String(fault.retryAfter));
    return c.json(
      {
        error: {
          code: fault.code,
          message: fault.message,
          ...(fault.retryAfter ? { retryAfter: fault.retryAfter } : {}),
        },
      },
      fault.status,
    );
  });
  app.get('/api/status', (c) =>
    c.json({
      aiEnabled: false,
      sharingEnabled: sharingEnabled(c.env),
      model: MODEL,
      message:
        'Draw, play, solve, and share puzzles. Live photo and text AI are not configured on this deployment.',
    }),
  );
  for (const path of ['/api/interpret', '/api/propose']) {
    app.post(path, () => {
      throw new ApiFault(
        'AI_DISABLED',
        'Live AI is not configured. Use the drawing tools or the prepared remix example.',
        503,
      );
    });
  }
  app.post('/api/shares', async (c) => {
    if (!sharingEnabled(c.env))
      throw new ApiFault(
        'SHARING_DISABLED',
        'Sharing is not configured. Export the puzzle JSON to keep a portable copy.',
        503,
      );
    const input = shareRequestSchema.parse(await readJson(c.req.raw));
    let board;
    try {
      board = parseBoard(input.board);
    } catch {
      throw new ApiFault(
        'INVALID_BOARD',
        'Fix the puzzle rules before sharing: one player and exit, a 4–8 grid, and a key for its door.',
        422,
      );
    }
    const title = input.title.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    if (!title) throw new ApiFault('INVALID_TITLE', 'Give the shared puzzle a short title.');
    // Vercel overwrites this header at its edge. Never accept client-supplied CF/IP headers.
    const ip = c.req.header('x-vercel-forwarded-for')?.split(',')[0].trim() || 'unknown';
    const now = Date.now();
    const client = await hmac(c.env.QUOTA_SECRET!, `${Math.floor(now / dayMs)}:${ip}`);
    await admitVercelShare(store, client, now);
    const id = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url');
    await store.write(`shares/${id}.json`, {
      id,
      title,
      board,
      createdAt: new Date(now).toISOString(),
    });
    return c.json({ id, url: `${new URL(c.req.url).origin}/s/${id}` }, 201);
  });
  app.get('/api/shares/:id', async (c) => {
    if (!sharingEnabled(c.env))
      throw new ApiFault('SHARING_DISABLED', 'Shared puzzles are unavailable right now.', 503);
    const id = c.req.param('id');
    if (!/^[A-Za-z0-9_-]{22}$/.test(id))
      throw new ApiFault('SHARE_NOT_FOUND', 'This shared puzzle was not found.', 404);
    const stored = await store.read(`shares/${id}.json`);
    if (!stored) throw new ApiFault('SHARE_NOT_FOUND', 'This shared puzzle was not found.', 404);
    const snapshot = snapshotSchema.parse(stored.value);
    if (snapshot.id !== id) throw new Error('Snapshot identity mismatch');
    const board = parseBoard(snapshot.board);
    c.header('Cache-Control', 'public, max-age=86400, immutable');
    return c.json({ ...snapshot, board });
  });
  app.all('*', (c) =>
    c.json({ error: { code: 'NOT_FOUND', message: 'This API route does not exist.' } }, 404),
  );
  return app;
}

export const vercelApp = createVercelApp();
