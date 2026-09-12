import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { boardHash, parseBoard } from '../src/core/board';
import { EXAMPLES } from '../src/core/examples';
import {
  loopbackOrigin,
  seedDemoShares,
  type DemoLinksManifest,
} from '../scripts/seed-demo-shares';

describe('portable demo artifacts and loopback-only sharing', () => {
  it('ships the exact canonical import wrapper for every built-in example', () => {
    for (const example of EXAMPLES) {
      const raw = JSON.parse(
        readFileSync(new URL(`../public/examples/${example.id}.json`, import.meta.url), 'utf8'),
      );
      expect(Object.keys(raw).sort()).toEqual(['board', 'title']);
      expect(raw.title).toBe(example.title);
      expect(boardHash(parseBoard(raw.board))).toBe(boardHash(example.board));
    }
  });

  it('accepts only explicit loopback origins', () => {
    expect(loopbackOrigin('http://127.0.0.1:5173')).toBe('http://127.0.0.1:5173');
    expect(loopbackOrigin('http://localhost:5173/')).toBe('http://localhost:5173');
    expect(loopbackOrigin('http://[::1]:5173')).toBe('http://[::1]:5173');
    for (const url of [
      'https://example.com',
      'http://127.0.0.1.example.com',
      'http://user:secret@localhost:5173',
      'http://localhost:5173/api',
      'http://localhost:5173/?redirect=remote',
      'file:///tmp/local',
      'not a url',
    ])
      expect(() => loopbackOrigin(url)).toThrow();
  });

  it('refuses remote hosts before any HTTP call', async () => {
    const request = vi.fn();
    await expect(seedDemoShares('https://example.com', request)).rejects.toThrow(/loopback/);
    expect(request).not.toHaveBeenCalled();
  });

  it('creates exactly three shares, verifies read-back, preserves progress, and forbids redirects', async () => {
    let created = 0;
    const progress: DemoLinksManifest[] = [];
    const request = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.redirect).toBe('error');
      expect(new URL(url).origin).toBe('http://127.0.0.1:5173');
      if (init?.method === 'POST') {
        const example = EXAMPLES[created++];
        expect(init.headers).toEqual({
          'Content-Type': 'application/json',
          Origin: 'http://127.0.0.1:5173',
        });
        expect(JSON.parse(String(init.body))).toEqual({
          title: example.title,
          board: parseBoard(example.board),
        });
        const id = String(created).repeat(22);
        return Response.json({ id, url: `http://127.0.0.1:5173/s/${id}` }, { status: 201 });
      }
      const example = EXAMPLES[created - 1];
      return Response.json({
        id: String(created).repeat(22),
        title: example.title,
        board: example.board,
        createdAt: '2026-09-13T00:00:00.000Z',
      });
    });
    const manifest = await seedDemoShares('http://127.0.0.1:5173', request, async (value) => {
      progress.push(value);
    });
    expect(request).toHaveBeenCalledTimes(6);
    expect(created).toBe(3);
    expect(manifest.complete).toBe(true);
    expect(manifest.examples.map((example) => example.shortestMoves)).toEqual([6, 4, 10]);
    expect(manifest.examples.every((example) => example.readBackVerified)).toBe(true);
    expect(progress[0].complete).toBe(false);
    expect(progress[0].examples[0].readBackVerified).toBe(false);
    expect(progress.at(-1)?.complete).toBe(true);
  });

  it('rejects foreign returned links and does not retry a quota failure', async () => {
    const foreign = vi.fn(async () =>
      Response.json(
        { id: 'x'.repeat(22), url: `https://example.com/s/${'x'.repeat(22)}` },
        { status: 201 },
      ),
    );
    await expect(seedDemoShares('http://127.0.0.1:5173', foreign)).rejects.toThrow(/outside/);
    expect(foreign).toHaveBeenCalledTimes(1);
    const limited = vi.fn(async () =>
      Response.json({ error: { message: 'Sharing quota reached.' } }, { status: 429 }),
    );
    await expect(seedDemoShares('http://localhost:5173', limited)).rejects.toThrow(/429/);
    expect(limited).toHaveBeenCalledTimes(1);
  });
});
