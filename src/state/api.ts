import type { ApiError } from '../core/types';

export interface ServiceStatus {
  aiEnabled: boolean;
  sharingEnabled: boolean;
  model: string;
  message: string;
}
export async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error('The service is unavailable. Your puzzle is still saved in this browser.');
  }
  if (!response.ok)
    throw new Error(
      (data as ApiError)?.error?.message || 'The request could not be completed. Try again.',
    );
  return data as T;
}

export function postJson<T>(url: string, value: unknown, signal?: AbortSignal) {
  return apiJson<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
    signal,
  });
}
