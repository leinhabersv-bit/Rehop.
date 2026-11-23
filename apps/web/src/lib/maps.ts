import type { Location } from '@/types';

export interface DrivingRoute {
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  provider?: 'google';
  trafficAware?: boolean;
  distanceText?: string;
  durationText?: string;
  roadAccessMeters?: [number, number];
}

export function formatDrivingDuration(seconds: number) {
  if (seconds < 60) return '<1 min';
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours} hr${remainder ? ` ${remainder} min` : ''}` : `${minutes} min`;
}

export function formatDrivingDistance(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
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
