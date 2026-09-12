import { Hono } from 'hono';
import { z } from 'zod';
import { boardHash, parseBoard } from '../src/core/board';
import type { BoardDefinition, ProposalResponse } from '../src/core/types';
import { type Env, serviceStatus } from './env';
import { ApiFault } from './errors';
import { admit } from './quota';
import { gridSize, proposalRequestSchema, requestIdSchema, shareRequestSchema } from './schemas';
import {
  assertSameOrigin,
  imageDataUrl,
  inspectImage,
  MAX_MULTIPART_BYTES,
  readBounded,
  readJson,
} from './security';
import {
  interpretationPrompt,
  interpretationSchema,
  modelProposalSchema,
  proposalPrompt,
  runJson,
  validateCandidate,
  validateInterpretation,
} from './ai';

export const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'no-referrer');
  if (!['GET', 'HEAD'].includes(c.req.method)) assertSameOrigin(c.req.raw);
  await next();
});

app.onError((error, c) => {
  const fault =
    error instanceof ApiFault
      ? error
      : error instanceof z.ZodError
        ? new ApiFault(
            'INVALID_REQUEST',
            'Check the request fields, grid dimensions, and text length.',
          )
        : new ApiFault(
            'SERVICE_UNAVAILABLE',
            'The service is temporarily unavailable. Your local draft is safe; try again later.',
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

app.get('/api/status', (c) => c.json(serviceStatus(c.env, c.req.url)));

function checkedBoard(value: unknown): BoardDefinition {
  try {
    return parseBoard(value);
  } catch {
    throw new ApiFault(
      'INVALID_BOARD',
      'The board must follow the puzzle rules: a 4–8 grid, one player and exit, up to two crates, and a key for its door.',
      422,
    );
  }
}

app.post('/api/interpret', async (c) => {
  if (!serviceStatus(c.env, c.req.url).aiEnabled) {
    throw new ApiFault(
      'AI_DISABLED',
      'AI is not configured. You can recreate the drawing with the grid tools.',
      503,
    );
  }
  const contentType = c.req.header('Content-Type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data;'))
    throw new ApiFault('CONTENT_TYPE', 'Send the drawing as a multipart image upload.', 415);
  const raw = await readBounded(c.req.raw, MAX_MULTIPART_BYTES);
  let form: FormData;
  try {
    form = await new Response(raw.buffer as ArrayBuffer, {
      headers: { 'Content-Type': contentType },
    }).formData();
  } catch {
    throw new ApiFault(
      'INVALID_UPLOAD',
      'The image upload could not be read. Select the image again.',
    );
  }
  for (const key of form.keys()) {
    if (
      !['image', 'requestId', 'width', 'height', 'legend'].includes(key) ||
      form.getAll(key).length !== 1
    ) {
      throw new ApiFault(
        'INVALID_UPLOAD',
        'The image upload contains unexpected or repeated fields.',
      );
    }
  }
  const requestId = requestIdSchema.parse(form.get('requestId'));
  const suppliedWidth = form.get('width'),
    suppliedHeight = form.get('height');
  if ((suppliedWidth === null) !== (suppliedHeight === null))
    throw new ApiFault(
      'GRID_DIMENSIONS',
      'Supply both grid width and height, or leave both automatic.',
    );
  const width =
    suppliedWidth === null
      ? undefined
      : gridSize.parse(
          typeof suppliedWidth === 'string' && /^\d+$/.test(suppliedWidth)
            ? Number(suppliedWidth)
            : null,
        );
  const height =
    suppliedHeight === null
      ? undefined
      : gridSize.parse(
          typeof suppliedHeight === 'string' && /^\d+$/.test(suppliedHeight)
            ? Number(suppliedHeight)
            : null,
        );
  const legend = z
    .string()
    .max(600)
    .parse(form.get('legend') ?? '');
  const image = form.get('image');
  if (!image || typeof image === 'string')
    throw new ApiFault('MISSING_IMAGE', 'Choose a PNG, JPEG, or WebP drawing.');
  const imageBytes = new Uint8Array(await image.arrayBuffer());
  const imageInfo = inspectImage(imageBytes, image.type);
  await admit(c, 'ai', requestId);
  const start = Date.now();
  const generated = await runJson(
    c.env.AI!,
    interpretationPrompt(width, height, legend),
    interpretationSchema,
    4096,
    imageDataUrl(imageBytes, imageInfo.mime),
  );
  const interpretation = validateInterpretation(generated.value, width, height);
  return c.json({
    requestId,
    interpretation,
    metrics: {
      latencyMs: Date.now() - start,
      ...generated.metrics,
      ...(c.env.FREE_PLAN_CONFIRMED === 'true'
        ? { actualCostUsd: 0, costBasis: 'confirmed-free-plan' }
        : {}),
    },
  });
});

app.post('/api/propose', async (c) => {
  if (!serviceStatus(c.env, c.req.url).aiEnabled)
    throw new ApiFault(
      'AI_DISABLED',
      'AI is not configured. You can make this change with the grid tools.',
      503,
    );
  const input = proposalRequestSchema.parse(await readJson(c.req.raw));
  const board = checkedBoard(input.board);
  if (boardHash(board) !== input.baseHash)
    throw new ApiFault(
      'BOARD_MISMATCH',
      'The board changed before this request. Submit the edit from the current revision.',
      409,
    );
  if (
    new Set(input.selectedCells).size !== input.selectedCells.length ||
    input.selectedCells.some((cell) => cell >= board.width * board.height)
  ) {
    throw new ApiFault(
      'INVALID_SELECTION',
      'The selected cells must be distinct positions inside the current board.',
    );
  }
  await admit(c, 'ai', input.requestId);
  const start = Date.now();
  const generated = await runJson(
    c.env.AI!,
    proposalPrompt(board, input.prompt, input.selectedCells),
    modelProposalSchema,
    1536,
  );
  const value = generated.value;
  if (value.status === 'proposed') {
    if (!value.candidates.length || (value.objective === 'edit' && value.candidates.length !== 1)) {
      throw new ApiFault(
        'INVALID_AI_RESPONSE',
        'The AI did not return a single usable edit. Try a clearer request.',
        502,
      );
    }
    const candidateHashes = value.candidates.map((candidate) =>
      boardHash(validateCandidate(board, candidate, input.prompt)),
    );
    if (new Set(candidateHashes).size !== candidateHashes.length)
      throw new ApiFault(
        'INVALID_AI_RESPONSE',
        'The AI returned repeated alternatives. Try a more specific change.',
        502,
      );
  } else if (value.candidates.length) {
    throw new ApiFault(
      'INVALID_AI_RESPONSE',
      'The AI returned an ambiguous proposal. Your draft is unchanged.',
      502,
    );
  }
  const response: ProposalResponse = {
    requestId: input.requestId,
    baseRevisionId: input.baseRevisionId,
    baseHash: input.baseHash,
    ...value,
  };
  return c.json({
    ...response,
    metrics: {
      latencyMs: Date.now() - start,
      ...generated.metrics,
      ...(c.env.FREE_PLAN_CONFIRMED === 'true'
        ? { actualCostUsd: 0, costBasis: 'confirmed-free-plan' }
        : {}),
    },
  });
});

app.post('/api/shares', async (c) => {
  if (!serviceStatus(c.env, c.req.url).sharingEnabled)
    throw new ApiFault(
      'SHARING_DISABLED',
      'Sharing is not configured. Export the puzzle JSON to keep a portable copy.',
      503,
    );
  const input = shareRequestSchema.parse(await readJson(c.req.raw));
  const board = checkedBoard(input.board);
  const title = input.title.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (!title) throw new ApiFault('INVALID_TITLE', 'Give the shared puzzle a short title.');
  await admit(c, 'share', crypto.randomUUID());
  const random = crypto.getRandomValues(new Uint8Array(16));
  const id = btoa(String.fromCharCode(...random))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const createdAt = new Date().toISOString();
  const result = await c.env
    .DB!.prepare(
      `
    INSERT INTO shares (id, title, board_json, created_at)
    SELECT ?, ?, ?, ? WHERE (SELECT count(*) FROM shares) < 10000
    RETURNING id
  `,
    )
    .bind(id, title, JSON.stringify(board), createdAt)
    .first();
  if (!result)
    throw new ApiFault(
      'SHARE_CAPACITY',
      'The public sharing allowance is full. Export this puzzle as JSON instead.',
      503,
    );
  return c.json({ id, url: `${new URL(c.req.url).origin}/s/${id}` }, 201);
});

app.get('/api/shares/:id', async (c) => {
  if (!c.env.DB)
    throw new ApiFault('SHARING_DISABLED', 'Shared puzzles are unavailable right now.', 503);
  const id = c.req.param('id');
  if (!/^[A-Za-z0-9_-]{22}$/.test(id))
    throw new ApiFault('SHARE_NOT_FOUND', 'This shared puzzle was not found.', 404);
  const row = await c.env.DB.prepare(
    'SELECT id, title, board_json, created_at FROM shares WHERE id = ?',
  )
    .bind(id)
    .first<{ id: string; title: string; board_json: string; created_at: string }>();
  if (!row) throw new ApiFault('SHARE_NOT_FOUND', 'This shared puzzle was not found.', 404);
  const board = checkedBoard(JSON.parse(row.board_json));
  c.header('Cache-Control', 'public, max-age=86400, immutable');
  return c.json({ id: row.id, title: row.title, board, createdAt: row.created_at });
});

app.all('/api/*', (c) =>
  c.json({ error: { code: 'NOT_FOUND', message: 'This API route does not exist.' } }, 404),
);
app.all('*', async (c) =>
  c.env.ASSETS
    ? await c.env.ASSETS.fetch(c.req.raw)
    : c.text('SketchQuest app assets are not built yet.', 404),
);
export default app;
