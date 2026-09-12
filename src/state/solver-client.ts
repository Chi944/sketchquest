import { boardHash } from '../core/board';
import type { BoardDefinition, SolverResponse, SolverResult } from '../core/types';

export function runSolver(
  board: BoardDefinition,
  revisionId: string,
  signal?: AbortSignal,
): Promise<SolverResult> {
  const hash = boardHash(board);
  const id = crypto.randomUUID();
  const started = performance.now();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      resolve({
        status: 'inconclusive',
        reason: 'cancelled',
        stats: { explored: 0, elapsedMs: 0 },
      });
      return;
    }
    const worker = new Worker(new URL('../solver/solver.worker.ts', import.meta.url), {
      type: 'module',
    });
    let settled = false;
    const dispose = () => {
      settled = true;
      worker.terminate();
      signal?.removeEventListener('abort', cancel);
    };
    const cancel = () => {
      if (settled) return;
      dispose();
      resolve({
        status: 'inconclusive',
        reason: 'cancelled',
        stats: { explored: 0, elapsedMs: performance.now() - started },
      });
    };
    signal?.addEventListener('abort', cancel, { once: true });
    worker.onmessage = (event: MessageEvent<SolverResponse>) => {
      const response = event.data;
      if (settled || response.id !== id) return;
      if (response.type === 'error') {
        dispose();
        reject(new Error(response.message));
        return;
      }
      if (response.boardHash !== hash || response.revisionId !== revisionId) return;
      dispose();
      resolve(response.result);
    };
    worker.onerror = () => {
      if (!settled) {
        dispose();
        reject(new Error('The solver could not start. Reload and try again.'));
      }
    };
    worker.postMessage({
      type: 'solve',
      job: { id, revisionId, boardHash: hash, board, maxStates: 250000, maxMs: 5000 },
    });
  });
}
