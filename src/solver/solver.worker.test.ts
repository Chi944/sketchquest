import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boardHash, emptyBoard } from '../core/board';
import type { SolverJob, SolverRequest, SolverResponse } from '../core/types';
import { solve } from './search';

vi.mock('./search', () => ({ solve: vi.fn() }));

describe('Worker job lifecycle', () => {
  let scope: {
    onmessage: ((event: MessageEvent<SolverRequest>) => void) | null;
    postMessage: ReturnType<typeof vi.fn>;
  };
  const job = (id: string): SolverJob => {
    const board = emptyBoard();
    return { id, revisionId: `revision-${id}`, boardHash: boardHash(board), board };
  };
  const send = (data: SolverRequest) => scope.onmessage!({ data } as MessageEvent<SolverRequest>);
  const messages = (): SolverResponse[] => scope.postMessage.mock.calls.map((call) => call[0]);

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(solve).mockReset();
    scope = { onmessage: null, postMessage: vi.fn() };
    vi.stubGlobal('self', scope);
    await import('./solver.worker');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('echoes exact job and revision identities for caller-side stale-result checks', async () => {
    vi.mocked(solve).mockResolvedValue({
      status: 'unsolvable',
      stats: { explored: 4, elapsedMs: 2 },
    });
    const current = job('one');
    send({ type: 'solve', job: current });
    await vi.waitFor(() => expect(messages()).toHaveLength(1));
    expect(messages()[0]).toEqual({
      type: 'result',
      id: 'one',
      revisionId: 'revision-one',
      boardHash: current.boardHash,
      result: { status: 'unsolvable', stats: { explored: 4, elapsedMs: 2 } },
    });
  });

  it('cancels only the matching active job and produces an explicit cancellation outcome', async () => {
    vi.mocked(solve).mockImplementation(
      (_board, options) =>
        new Promise((resolve) =>
          options!.signal!.addEventListener('abort', () =>
            resolve({
              status: 'inconclusive',
              reason: 'cancelled',
              stats: { explored: 3, elapsedMs: 1 },
            }),
          ),
        ),
    );
    send({ type: 'solve', job: job('one') });
    send({ type: 'cancel', id: 'unrelated' });
    expect(vi.mocked(solve).mock.calls[0][1]!.signal!.aborted).toBe(false);
    send({ type: 'cancel', id: 'one' });
    await vi.waitFor(() => expect(messages()).toHaveLength(1));
    expect(messages()[0]).toMatchObject({
      type: 'result',
      id: 'one',
      result: { status: 'inconclusive', reason: 'cancelled' },
    });
  });

  it('aborts a superseded job without relabelling its result as the new revision', async () => {
    vi.mocked(solve).mockImplementationOnce(
      (_board, options) =>
        new Promise((resolve) =>
          options!.signal!.addEventListener('abort', () =>
            resolve({
              status: 'inconclusive',
              reason: 'cancelled',
              stats: { explored: 2, elapsedMs: 1 },
            }),
          ),
        ),
    );
    vi.mocked(solve).mockResolvedValueOnce({
      status: 'solved',
      solution: [],
      moves: 0,
      pushes: 0,
      stats: { explored: 0, elapsedMs: 0 },
    });
    send({ type: 'solve', job: job('old') });
    send({ type: 'solve', job: job('new') });
    await vi.waitFor(() => expect(messages()).toHaveLength(2));
    expect(messages()).toContainEqual(
      expect.objectContaining({
        id: 'old',
        revisionId: 'revision-old',
        result: expect.objectContaining({ status: 'inconclusive', reason: 'cancelled' }),
      }),
    );
    expect(messages()).toContainEqual(
      expect.objectContaining({
        id: 'new',
        revisionId: 'revision-new',
        result: expect.objectContaining({ status: 'solved' }),
      }),
    );
  });

  it('rejects a job with mismatching board content before running search', async () => {
    send({ type: 'solve', job: { ...job('bad'), boardHash: 'stale-content' } });
    await vi.waitFor(() => expect(messages()).toHaveLength(1));
    expect(messages()[0]).toMatchObject({ type: 'error', id: 'bad' });
    expect(solve).not.toHaveBeenCalled();
  });
});
