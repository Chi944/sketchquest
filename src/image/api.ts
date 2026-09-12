import type { Interpretation } from '../core/types';
import { TERRAINS } from '../core/types';

export interface InterpretationRequest {
  image: Blob;
  requestId: string;
  grid?: { width: number; height: number };
  legend?: string;
  signal: AbortSignal;
}
export class PhotoApiError extends Error {
  constructor(
    message: string,
    public code = 'request_failed',
    public retryAfter?: number,
  ) {
    super(message);
    this.name = 'PhotoApiError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** A defensive boundary check. Board rules and confidence review remain separate. */
export function isInterpretation(value: unknown): value is Interpretation {
  if (
    !isRecord(value) ||
    !['interpreted', 'needs_clarification', 'unsupported'].includes(String(value.status))
  )
    return false;
  const dimension = (n: unknown) =>
    n === null || (typeof n === 'number' && Number.isInteger(n) && n >= 4 && n <= 8);
  if (
    !dimension(value.width) ||
    !dimension(value.height) ||
    !strings(value.notes) ||
    !Array.isArray(value.cells) ||
    value.cells.length > 64
  )
    return false;
  return value.cells.every(
    (cell) =>
      isRecord(cell) &&
      typeof cell.cell === 'number' &&
      Number.isInteger(cell.cell) &&
      cell.cell >= 0 &&
      cell.cell < 64 &&
      TERRAINS.includes(cell.terrain as (typeof TERRAINS)[number]) &&
      ['none', 'player', 'crate'].includes(String(cell.occupant)) &&
      typeof cell.uncertain === 'boolean' &&
      strings(cell.alternatives) &&
      typeof cell.note === 'string',
  );
}

export async function interpretPhoto(
  request: InterpretationRequest,
): Promise<{ requestId: string; interpretation: Interpretation }> {
  const body = new FormData();
  body.append('image', request.image, 'sketchquest-crop.jpg');
  body.append('requestId', request.requestId);
  if (request.grid) {
    body.append('width', String(request.grid.width));
    body.append('height', String(request.grid.height));
  }
  if (request.legend?.trim()) body.append('legend', request.legend.trim());
  let response: Response;
  try {
    response = await fetch('/api/interpret', { method: 'POST', body, signal: request.signal });
  } catch (error) {
    if (request.signal.aborted || (error instanceof Error && error.name === 'AbortError'))
      throw error;
    throw new PhotoApiError(
      'The connection was interrupted. Your photo is still here; try again when you are online.',
      'network_error',
    );
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new PhotoApiError(
      'The server returned an unreadable response. Your photo is still here; try again.',
      'invalid_response',
    );
  }
  if (!response.ok) {
    if (isRecord(data) && isRecord(data.error) && typeof data.error.message === 'string') {
      throw new PhotoApiError(
        data.error.message,
        typeof data.error.code === 'string' ? data.error.code : 'request_failed',
        typeof data.error.retryAfter === 'number' ? data.error.retryAfter : undefined,
      );
    }
    throw new PhotoApiError(
      'The photo could not be interpreted. You can try again or build your board manually.',
      'request_failed',
    );
  }
  if (
    !isRecord(data) ||
    data.requestId !== request.requestId ||
    !isInterpretation(data.interpretation)
  ) {
    throw new PhotoApiError(
      'The interpretation did not match this photo. Try again or build your board manually.',
      'invalid_response',
    );
  }
  return { requestId: data.requestId, interpretation: data.interpretation };
}
