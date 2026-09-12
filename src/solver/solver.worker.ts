import { boardHash } from '../core/board';
import type { SolverRequest, SolverResponse } from '../core/types';
import { solve } from './search';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<SolverRequest>) => void) | null;
  postMessage: (message: SolverResponse) => void;
};
let active: { id: string; controller: AbortController } | null = null;

scope.onmessage = (event) => {
  const request = event.data;
  if (request.type === 'cancel') {
    if (active?.id === request.id) active.controller.abort();
    return;
  }
  active?.controller.abort();
  const controller = new AbortController();
  const { job } = request;
  active = { id: job.id, controller };
  void (async () => {
    try {
      if (boardHash(job.board) !== job.boardHash)
        throw new Error('The solver job does not match the board revision.');
      const result = await solve(job.board, {
        maxStates: job.maxStates,
        maxMs: job.maxMs,
        signal: controller.signal,
      });
      scope.postMessage({
        type: 'result',
        id: job.id,
        revisionId: job.revisionId,
        boardHash: job.boardHash,
        result,
      });
    } catch (error) {
      scope.postMessage({
        type: 'error',
        id: job.id,
        message:
          error instanceof Error ? error.message : 'The solver could not inspect this board.',
      });
    } finally {
      if (active?.controller === controller) active = null;
    }
  })();
};
