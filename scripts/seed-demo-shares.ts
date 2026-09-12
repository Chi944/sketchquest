import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { boardHash, parseBoard } from '../src/core/board';
import { EXAMPLES } from '../src/core/examples';
import { solve } from '../src/solver/search';

export interface DemoShareLink {
  exampleId: string;
  title: string;
  id: string;
  url: string;
  importFile: string;
  shortestMoves: number;
  pushes: number;
  readBackVerified: boolean;
}
export interface DemoLinksManifest {
  schemaVersion: 1;
  scope: 'loopback-only';
  baseUrl: string;
  createdAt: string;
  complete: boolean;
  examples: DemoShareLink[];
}
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** No public hosts, credentials, path prefixes, or redirect-based escape to a remote service. */
export function loopbackOrigin(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Provide an explicit loopback base URL, such as http://127.0.0.1:5173.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error(
      'Demo seeding is restricted to a loopback origin: localhost, 127.0.0.1, or [::1], with no credentials, path, query, or fragment.',
    );
  return url.origin;
}

async function responseJson(response: Response, expectedStatus: number): Promise<unknown> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      `The local share API returned an unreadable response (HTTP ${response.status}).`,
    );
  }
  if (response.status !== expectedStatus) {
    const error =
      isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string'
        ? body.error.message.slice(0, 300)
        : 'Check local migrations, sharing configuration, and quotas.';
    throw new Error(`Local share API failed (HTTP ${response.status}): ${error}`);
  }
  return body;
}

/** Creates at most three local shares, with no retries and no inference endpoints. */
export async function seedDemoShares(
  baseUrl: string,
  request: FetchLike = fetch,
  onProgress?: (manifest: DemoLinksManifest) => Promise<void>,
): Promise<DemoLinksManifest> {
  const origin = loopbackOrigin(baseUrl);
  const prepared = [];
  for (const example of EXAMPLES) {
    const board = parseBoard(example.board);
    const solution = await solve(board);
    if (solution.status !== 'solved')
      throw new Error(`Example ${example.id} did not verify as solvable; no shares were created.`);
    prepared.push({ example, board, solution });
  }
  const manifest: DemoLinksManifest = {
    schemaVersion: 1,
    scope: 'loopback-only',
    baseUrl: origin,
    createdAt: new Date().toISOString(),
    complete: false,
    examples: [],
  };
  const snapshot = (): DemoLinksManifest => ({
    ...manifest,
    examples: manifest.examples.map((example) => ({ ...example })),
  });
  for (const { example, board, solution } of prepared) {
    const created = await responseJson(
      await request(`${origin}/api/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify({ title: example.title, board }),
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      }),
      201,
    );
    if (
      !isRecord(created) ||
      typeof created.id !== 'string' ||
      !/^[A-Za-z0-9_-]{22}$/.test(created.id) ||
      typeof created.url !== 'string'
    )
      throw new Error('The local API returned an invalid share identifier or link.');
    const expectedUrl = `${origin}/s/${created.id}`;
    if (created.url !== expectedUrl)
      throw new Error(
        'The local API returned a share URL outside the expected loopback puzzle path.',
      );
    const link: DemoShareLink = {
      exampleId: example.id,
      title: example.title,
      id: created.id,
      url: expectedUrl,
      importFile: `/examples/${example.id}.json`,
      shortestMoves: solution.moves,
      pushes: solution.pushes,
      readBackVerified: false,
    };
    manifest.examples.push(link);
    await onProgress?.(snapshot());
    const stored = await responseJson(
      await request(`${origin}/api/shares/${created.id}`, {
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      }),
      200,
    );
    if (
      !isRecord(stored) ||
      stored.id !== created.id ||
      stored.title !== example.title ||
      boardHash(parseBoard(stored.board)) !== boardHash(board)
    )
      throw new Error(`Stored snapshot ${example.id} did not match its source board.`);
    link.readBackVerified = true;
    await onProgress?.(snapshot());
  }
  manifest.complete = true;
  await onProgress?.(snapshot());
  return snapshot();
}

async function main() {
  const args = process.argv.slice(2);
  const usage = 'Usage: npx tsx scripts/seed-demo-shares.ts --base-url http://127.0.0.1:5173';
  if (args.length === 1 && args[0] === '--help') {
    console.log(usage);
    return;
  }
  if (args.length !== 2 || args[0] !== '--base-url') throw new Error(usage);
  const output = fileURLToPath(new URL('../artifacts/demo-links.json', import.meta.url));
  const report = await seedDemoShares(args[1], fetch, async (manifest) => {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(manifest, null, 2) + '\n');
  });
  console.log(
    `Created and read-back verified ${report.examples.length} immutable local snapshots. No model calls were made.`,
  );
  console.log(
    `Saved ${output}. Links work only while this local server and its D1 data remain available.`,
  );
  for (const example of report.examples) console.log(`${example.title}: ${example.url}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Local demo seeding failed.');
    process.exitCode = 1;
  });
