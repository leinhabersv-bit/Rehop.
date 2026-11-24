import type { Event, Journey, Location, RecoveryPolicy, Scenario } from '@/types';
import { readRecentRides } from '@/lib/recent-rides';
import { bookingRiderId } from '@/lib/rider-id';

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export class ApiError extends Error {
  constructor(public code: string, message: string, public status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function json<T>(path: string, options?: RequestInit): Promise<T> {
  const signal = options?.signal ?? AbortSignal.timeout(12_000);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      cache: 'no-store',
      signal,
    });
  } catch (err) {
    if (signal.aborted) throw new ApiError('TIMEOUT', 'The request timed out.');
    throw new ApiError('NETWORK_ERROR', err instanceof Error ? err.message : 'Network request failed');
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    if (signal.aborted) throw new ApiError('TIMEOUT', 'The request timed out.');
    if (!response.ok) {
      throw new ApiError(`HTTP_${response.status}`, `HTTP ${response.status}: ${response.statusText}`, response.status);
    }
    throw new ApiError('PARSE_ERROR', 'Failed to parse JSON response');
  }

  if (!response.ok) {
    const err = data as { error?: { code?: string; message?: string }; detail?: string | { msg?: string }[] };
    const code = err?.error?.code || `HTTP_${response.status}`;
    const message =
      err?.error?.message ||
      (typeof err?.detail === 'string'
        ? err.detail
        : Array.isArray(err?.detail)
        ? err.detail.map((d) => d.msg).join(', ')
        : `HTTP ${response.status}`);
    throw new ApiError(code, message, response.status);
  }
  return data as T;
}

const post = <T>(path: string, body: unknown) =>
  json<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const api = {
  locations: () => json<{ locations: Location[]; is_simulated?: boolean }>('/api/v1/locations'),
  scenarios: () => json<{ scenarios: Scenario[] }>('/api/v1/scenarios'),
  scenarioRun: (id: string) => post<Journey>(`/api/v1/scenarios/${id}/run`, {}),
  createJourney: (pickup: Location, dropoff: Location, policy: RecoveryPolicy, needBy: string, scenario: 'S01' | 'S03' = 'S01') =>
    post<Journey>(scenario === 'S01' ? '/api/v1/journeys' : '/api/v1/journeys?scenario=S03', { pickup, dropoff, policy, need_by: needBy }),
  parseIntent: (text: string) =>
    post<{
      pickup: string | null;
      dropoff: string | null;
      need_in_minutes: number | null;
      source: string;
      requires_confirmation: boolean;
    }>('/api/v1/intent/parse', { text }),
  driverMessage: (id: string, text: string) =>
    post<Journey>(`/api/v1/journeys/${id}/driver-message`, { text, idempotency_key: crypto.randomUUID() }),
  journey: (id: string): Promise<Journey> => json<Journey>(`/api/v1/journeys/${id}`),
  events: (id: string, sinceSeq = 0) =>
    json<{ events: Event[]; last_event_seq: number }>(`/api/v1/journeys/${id}/events?since_seq=${sinceSeq}`),
  book: async (id: string, quoteId: string, expectedVersion?: number, key = crypto.randomUUID()): Promise<Journey> => {
    const payload: { quote_id: string; idempotency_key: string; expected_version?: number } = {
      quote_id: quoteId,
      idempotency_key: key,
    };
    if (typeof expectedVersion === 'number') {
      payload.expected_version = expectedVersion;
    }
    let headers: Record<string, string> | undefined;
    if (typeof window !== 'undefined') {
      try {
        headers = {
          'X-Ride-Rider': await bookingRiderId(),
          'X-Ride-Recent': readRecentRides().filter((rideId) => /^journey_[a-f0-9]{12}$/.test(rideId)).join(','),
        };
      } catch {
        throw new ApiError('RIDER_STORAGE_UNAVAILABLE', 'Allow browser storage to book a ride.', 400);
      }
    }
    return json<Journey>(`/api/v1/journeys/${id}/book`, { method: 'POST', headers, body: JSON.stringify(payload) });
  },
  tick: (id: string, steps = 6) => post<Journey>(`/api/v1/journeys/${id}/tick`, { steps }),
  approve: (id: string, approved: boolean, version: number) =>
    post<Journey>(`/api/v1/journeys/${id}/rescue/approve`, {
      approved,
      expected_version: version,
      idempotency_key: crypto.randomUUID(),
    }),
  cancel: (id: string, expectedVersion?: number) =>
    post<Journey>(`/api/v1/journeys/${id}/cancel`, {
      idempotency_key: crypto.randomUUID(),
      expected_version: expectedVersion,
    }),
  confirmPickup: (id: string, expectedVersion?: number) =>
    post<Journey>(`/api/v1/journeys/${id}/pickup/confirm`, {
      idempotency_key: crypto.randomUUID(),
      expected_version: expectedVersion,
    }),
};
