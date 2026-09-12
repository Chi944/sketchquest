export class ApiFault extends Error {
  constructor(
    public code: string,
    message: string,
    public status: 400 | 403 | 404 | 409 | 413 | 415 | 422 | 429 | 500 | 502 | 503 | 504 = 400,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

export const nextUtcDaySeconds = (now = Date.now()) =>
  Math.max(1, Math.ceil((Math.floor(now / 86_400_000) * 86_400_000 + 86_400_000 - now) / 1000));
