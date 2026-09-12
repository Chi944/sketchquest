/** Deliberately narrow interface: only the documented, fixed model is callable. */
export interface AiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

export interface Env {
  DB?: D1Database;
  AI?: AiBinding;
  ASSETS?: Fetcher;
  FREE_PLAN_CONFIRMED?: string;
  QUOTA_SECRET?: string;
}

export const MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
export const isLocal = (url: string) =>
  ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
export function quotaSecret(env: Env, url: string): string | undefined {
  if (env.QUOTA_SECRET && env.QUOTA_SECRET.length >= 32) return env.QUOTA_SECRET;
  // This key is only usable on localhost; deployments fail closed without a real secret.
  return isLocal(url) ? 'sketchquest-local-development-only-key' : undefined;
}

export function serviceStatus(env: Env, url: string) {
  const sharingEnabled = Boolean(env.DB && quotaSecret(env, url));
  const aiEnabled = Boolean(sharingEnabled && env.AI && env.FREE_PLAN_CONFIRMED === 'true');
  return {
    aiEnabled,
    sharingEnabled,
    model: MODEL,
    message: aiEnabled
      ? 'AI is available within the shared free daily allowance.'
      : 'AI is not configured. You can draw, play, validate, and edit puzzles locally.',
  };
}
