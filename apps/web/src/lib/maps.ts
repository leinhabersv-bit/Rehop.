import type { Location } from '@/types';

export interface DrivingRoute {
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
}

class MapRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/maps?${new URLSearchParams(params)}`, { signal });
  const data = await response.json();
  if (!response.ok) throw new MapRequestError(data.error || 'Map service is unavailable.', response.status);
  return data;
}

export function searchPlaces(query: string, signal: AbortSignal) {
  return request<{ places: Location[] }>({ q: query }, signal);
}

export function getDrivingRoute(from: string, to: string, signal: AbortSignal) {
  return request<DrivingRoute>({ from, to }, signal);
}

export function retryMapRequest(count: number, error: Error) {
  return count < 1 && error instanceof MapRequestError && error.status === 429;
}
