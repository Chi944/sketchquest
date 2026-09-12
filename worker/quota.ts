import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { Env } from './env';
import { isLocal, quotaSecret } from './env.js';
import { ApiFault, nextUtcDaySeconds } from './errors.js';

type Kind = 'ai' | 'share';
type AppContext = Context<{ Bindings: Env }>;
const encoder = new TextEncoder();
const cookieName = 'sq_actor';
const dayMs = 86_400_000;
const limits = {
  ai: { minute: 2, actorDay: 10, globalDay: 50 },
  share: { minute: 3, actorDay: 20, globalDay: 100 },
};

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (x) => x.toString(16).padStart(2, '0')).join('');
}

export async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

async function verifyCookie(secret: string, actor: string, signature: string) {
  if (!/^[a-f0-9-]{36}$/i.test(actor) || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const bytes = new Uint8Array(signature.match(/.{2}/g)!.map((pair) => parseInt(pair, 16)));
  return crypto.subtle.verify('HMAC', key, bytes, encoder.encode(`cookie:${actor}`));
}

async function identity(c: AppContext) {
  const secret = quotaSecret(c.env, c.req.url);
  if (!secret)
    throw new ApiFault('SERVICE_UNCONFIGURED', 'This service is not configured yet.', 503);
  const parts = (getCookie(c, cookieName) ?? '').split('.');
  let actor = parts[0];
  if (parts.length !== 2 || !(await verifyCookie(secret, actor, parts[1]))) {
    actor = crypto.randomUUID();
    const signature = await hmac(secret, `cookie:${actor}`);
    setCookie(c, cookieName, `${actor}.${signature}`, {
      path: '/',
      httpOnly: true,
      secure: !isLocal(c.req.url),
      sameSite: 'Lax',
      maxAge: 30 * 24 * 60 * 60,
    });
  }
  // CF-Connecting-IP is supplied/overwritten by Cloudflare. Never trust X-Forwarded-For.
  const ip = c.req.header('CF-Connecting-IP') ?? (isLocal(c.req.url) ? 'local' : 'unknown');
  const [actorKey, ipKey] = await Promise.all([
    hmac(secret, `actor:${actor}`),
    hmac(secret, `ip:${ip}`),
  ]);
  return { actor, secret, actorKey, ipKey };
}

/** One SQLite write statement admits or rejects the whole operation, even under concurrency.
 * No prompt, photo, result, or raw network address enters this table.
 */
export async function admit(c: AppContext, kind: Kind, requestId: string, now = Date.now()) {
  if (!c.env.DB)
    throw new ApiFault('SERVICE_UNCONFIGURED', 'This service is not configured yet.', 503);
  const db = c.env.DB;
  const who = await identity(c);
  // UUIDs identify operations globally, including a retry whose first cookie response was lost.
  const requestKey = await hmac(who.secret, `${kind}:${requestId}`);
  const limit = limits[kind];
  const dayStart = Math.floor(now / dayMs) * dayMs;
  const minuteStart = now - 60_000;
  const insert = db
    .prepare(
      `
    INSERT INTO admissions (request_key, kind, actor_key, ip_key, created_at)
    SELECT ?1, ?2, ?3, ?4, ?5
    WHERE NOT EXISTS (SELECT 1 FROM admissions WHERE request_key = ?1)
      AND (SELECT count(*) FROM admissions WHERE kind = ?2 AND actor_key = ?3 AND created_at > ?6) < ?7
      AND (SELECT count(*) FROM admissions WHERE kind = ?2 AND ip_key = ?4 AND created_at > ?6) < ?7
      AND (SELECT count(*) FROM admissions WHERE kind = ?2 AND actor_key = ?3 AND created_at >= ?8) < ?9
      AND (SELECT count(*) FROM admissions WHERE kind = ?2 AND ip_key = ?4 AND created_at >= ?8) < ?9
      AND (SELECT count(*) FROM admissions WHERE kind = ?2 AND created_at >= ?8) < ?10
    RETURNING request_key
  `,
    )
    .bind(
      requestKey,
      kind,
      who.actorKey,
      who.ipKey,
      now,
      minuteStart,
      limit.minute,
      dayStart,
      limit.actorDay,
      limit.globalDay,
    );
  // Cleanup and admission are a D1 transaction. Each request removes up to 256 records older than seven days.
  const results = await db.batch([
    db
      .prepare(
        'DELETE FROM admissions WHERE request_key IN (SELECT request_key FROM admissions WHERE created_at < ? ORDER BY created_at LIMIT 256)',
      )
      .bind(now - 7 * dayMs),
    insert,
  ]);
  if (results[1].results.length) return;
  const duplicate = await db
    .prepare('SELECT request_key FROM admissions WHERE request_key = ?')
    .bind(requestKey)
    .first();
  if (duplicate)
    throw new ApiFault(
      'DUPLICATE_REQUEST',
      'This request was already submitted. Review its result before submitting a new request.',
      409,
    );
  const counts = await db
    .prepare(
      `
    SELECT
      (SELECT count(*) FROM admissions WHERE kind = ?1 AND actor_key = ?2 AND created_at > ?4) AS actor_minute,
      (SELECT count(*) FROM admissions WHERE kind = ?1 AND ip_key = ?3 AND created_at > ?4) AS ip_minute
  `,
    )
    .bind(kind, who.actorKey, who.ipKey, minuteStart)
    .first<{ actor_minute: number; ip_minute: number }>();
  if (counts && (counts.actor_minute >= limit.minute || counts.ip_minute >= limit.minute)) {
    throw new ApiFault(
      'RATE_LIMITED',
      'A few requests are already in progress. Try again in a minute.',
      429,
      60,
    );
  }
  throw new ApiFault(
    'DAILY_LIMIT',
    'The free daily allowance has been reached. Drawing and playing still work.',
    429,
    nextUtcDaySeconds(now),
  );
}
