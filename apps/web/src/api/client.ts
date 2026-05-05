/**
 * Thin REST client. Single fetch wrapper that surfaces non-2xx as a typed
 * error. All endpoints live under apps/api/; the Vite proxy rewrites /api/*
 * → http://localhost:3000 in dev (see vite.config.ts).
 */

const BASE_URL = '/api';

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // body stays null when the response wasn't JSON.
    }
    throw new ApiError(res.status, body, `API ${res.status} on ${path}`);
  }
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}
