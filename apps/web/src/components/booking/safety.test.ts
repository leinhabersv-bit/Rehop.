import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, ApiError } from '@/lib/api/client';
import { calculateNeedBy, SIMULATED_BASE_TIME } from './BookingForm';
import { isQuoteExpired, isQuoteWithinPolicy } from './ProviderCard';
import type { Journey, Quote, RecoveryPolicy } from '@/types';

// In Node environment, polyfill sessionStorage for safety assertion checks
class MockStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

const mockStorage = new MockStorage();

describe('Booking Regression & Safety Verification', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', mockStorage);
    mockStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockStorage.clear();
  });

  // Requirement 1
  it('Backend unavailable -> no confirmed booking', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.book('journey-123', 'q-1')).rejects.toThrow(ApiError);
    await expect(api.book('journey-123', 'q-1')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'NETWORK_ERROR',
      message: 'Failed to fetch',
    });

    // Assert that sessionStorage contains no fake journey or ride
    expect(sessionStorage.getItem('journey')).toBeNull();
    expect(sessionStorage.getItem('ride')).toBeNull();
    expect(sessionStorage.getItem('active_ride')).toBeNull();
    expect(sessionStorage.getItem('journey-123')).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  // Requirement 2
  it('Backend returns 500 -> no confirmed booking', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({
        error: { code: 'INTERNAL_ERROR', message: 'Database failure' },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    let thrownError: unknown;
    try {
      await api.book('journey-123', 'q-1');
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(ApiError);
    expect((thrownError as ApiError).code).toBe('INTERNAL_ERROR');
    expect((thrownError as ApiError).message).toBe('Database failure');

    // Assert that no confirmed booking was fabricated or placed in sessionStorage
    expect(sessionStorage.getItem('journey')).toBeNull();
    expect(sessionStorage.getItem('ride')).toBeNull();
    expect(sessionStorage.getItem('journey-123')).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  // Requirement 3
  it('Booking request times out / BOOKING_UNCONFIRMED -> unknown/unconfirmed, not success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      json: async () => ({
        error: {
          code: 'BOOKING_UNCONFIRMED',
          message: 'Booking response timed out; verification required.',
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.book('journey-123', 'q-1')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'BOOKING_UNCONFIRMED',
      message: 'Booking response timed out; verification required.',
    });

    // Ensure it is treated as unconfirmed/error, not success
    expect(sessionStorage.getItem('journey')).toBeNull();
    expect(sessionStorage.getItem('ride')).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  // Requirement 4
  it('Duplicate booking attempts do not create multiple ride requests / idempotency', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'journey-123',
        state: 'MONITORING',
        version: 2,
        is_simulated: true,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    // Call with expected_version
    await api.book('journey-123', 'q-1', 2);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url1, options1] = fetchMock.mock.calls[0];
    expect(url1).toContain('/api/v1/journeys/journey-123/book');
    expect(options1?.method).toBe('POST');

    const body1 = JSON.parse(options1?.body as string);
    expect(body1.quote_id).toBe('q-1');
    expect(body1.expected_version).toBe(2);
    expect(typeof body1.idempotency_key).toBe('string');
    expect(body1.idempotency_key.length).toBeGreaterThanOrEqual(3);

    // UUID v4 format verification
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(body1.idempotency_key).toMatch(uuidRegex);

    // Call without expected_version
    await api.book('journey-123', 'q-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, options2] = fetchMock.mock.calls[1];
    const body2 = JSON.parse(options2?.body as string);
    expect(body2.quote_id).toBe('q-2');
    expect(body2.expected_version).toBeUndefined();
    expect(body2.idempotency_key).toMatch(uuidRegex);

    // Idempotency keys must be unique per mutation attempt
    expect(body1.idempotency_key).not.toBe(body2.idempotency_key);
  });

  // Requirement 5
  it('Confirmed booking response -> correct journey state', async () => {
    const authoritativeJourney: Partial<Journey> = {
      id: 'journey-123',
      state: 'MONITORING',
      version: 2,
      active_ride_id: 'ride_1_journey-123',
      active_ride: {
        ride_id: 'ride_1_journey-123',
        journey_id: 'journey-123',
        provider: 'PROVIDER_A',
        quote_id: 'q-1',
        driver_id: 'SIM_DRIVER_1',
        state: 'DRIVER_EN_ROUTE',
        booked_at: '2026-11-23T08:30:00Z',
        distance_to_pickup_m: 2200,
        eta_sec: 240,
        last_position_at: '2026-11-23T08:30:00Z',
        is_simulated: true,
      },
      recovery_attempts: 0,
      is_simulated: true,
      booking_uncertain: false,
      need_by: '2026-11-23T08:55:00Z',
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => authoritativeJourney,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.book('journey-123', 'q-1', 1);

    expect(result.id).toBe('journey-123');
    expect(result.state).toBe('MONITORING');
    expect(result.version).toBe(2);
    expect(result.active_ride_id).toBe('ride_1_journey-123');
    expect(result.active_ride).toBeDefined();
    expect(result.active_ride?.ride_id).toBe('ride_1_journey-123');
    expect(result.active_ride?.driver_id).toBe('SIM_DRIVER_1');
    expect(result.active_ride?.state).toBe('DRIVER_EN_ROUTE');
    expect(result.active_ride?.is_simulated).toBe(true);
    expect(result.is_simulated).toBe(true);
  });

  // Requirement 6
  it('need_by represents latest acceptable PICKUP timestamp with timezone offset', () => {
    const baseTime = '2026-11-23T08:30:00Z';
    expect(SIMULATED_BASE_TIME).toBe('2026-11-23T08:30:00Z');

    // Urgent (5m -> 08:35:00Z)
    const urgentNeedBy = calculateNeedBy(5, baseTime);
    expect(urgentNeedBy).toBe('2026-11-23T08:35:00.000Z');
    expect(urgentNeedBy.endsWith('Z')).toBe(true);

    // Relaxed (30m -> 09:00:00Z)
    const relaxedNeedBy = calculateNeedBy(30, baseTime);
    expect(relaxedNeedBy).toBe('2026-11-23T09:00:00.000Z');
    expect(relaxedNeedBy.endsWith('Z')).toBe(true);

    // Default base time fallback test
    const defaultNeedBy = calculateNeedBy(10);
    expect(defaultNeedBy).toBe('2026-11-23T08:40:00.000Z');

    // Verify UTC offset and exact millisecond difference from simulated base
    const baseMs = new Date(baseTime).getTime();
    expect(new Date(urgentNeedBy).getTime() - baseMs).toBe(5 * 60 * 1000);
    expect(new Date(relaxedNeedBy).getTime() - baseMs).toBe(30 * 60 * 1000);

    const parsedDate = new Date(urgentNeedBy);
    expect(parsedDate.getUTCHours()).toBe(8);
    expect(parsedDate.getUTCMinutes()).toBe(35);
    expect(parsedDate.toISOString()).toMatch(/T08:35:00(\.000)?Z$/);
  });

  // Requirement 7
  it('Expired quotes cannot be booked', async () => {
    const pastExpiresAt = '2026-11-23T08:29:00Z';
    const futureExpiresAt = '2026-11-23T08:45:00Z';
    const simulatedClock = '2026-11-23T08:30:00Z';
    const simulatedClockMs = new Date(simulatedClock).getTime();

    const expiredQuote: Pick<Quote, 'quote_id' | 'expires_at' | 'estimated_fare_inr'> = {
      quote_id: 'q-expired',
      expires_at: pastExpiresAt,
      estimated_fare_inr: 850,
    };

    const validQuote: Pick<Quote, 'quote_id' | 'expires_at' | 'estimated_fare_inr'> = {
      quote_id: 'q-valid',
      expires_at: futureExpiresAt,
      estimated_fare_inr: 850,
    };

    // Verify detection logic
    expect(isQuoteExpired(expiredQuote, simulatedClockMs)).toBe(true);
    expect(isQuoteExpired(validQuote, simulatedClockMs)).toBe(false);

    // Verify backend rejection handling for expired quotes
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      json: async () => ({
        error: { code: 'QUOTE_EXPIRED', message: 'Request an updated quote.' },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.book('journey-123', 'q-expired')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'QUOTE_EXPIRED',
      message: 'Request an updated quote.',
    });

    expect(sessionStorage.getItem('journey')).toBeNull();
  });

  // Requirement 8
  it('Quotes exceeding policy fare limit are blocked', async () => {
    const policy: Pick<RecoveryPolicy, 'max_total_fare_inr'> = {
      max_total_fare_inr: 900,
    };

    const expensiveQuote: Pick<Quote, 'quote_id' | 'estimated_fare_inr'> = {
      quote_id: 'q-expensive',
      estimated_fare_inr: 1050, // exceeds 900
    };

    const compliantQuote: Pick<Quote, 'quote_id' | 'estimated_fare_inr'> = {
      quote_id: 'q-compliant',
      estimated_fare_inr: 850, // within 900
    };

    const exactBudgetQuote: Pick<Quote, 'quote_id' | 'estimated_fare_inr'> = {
      quote_id: 'q-exact',
      estimated_fare_inr: 900, // exactly at limit
    };

    // Verify policy compliance evaluation
    expect(isQuoteWithinPolicy(expensiveQuote, policy)).toBe(false);
    expect(isQuoteWithinPolicy(compliantQuote, policy)).toBe(true);
    expect(isQuoteWithinPolicy(exactBudgetQuote, policy)).toBe(true);

    // Also supports raw number maxFare overload
    expect(isQuoteWithinPolicy(expensiveQuote, 900)).toBe(false);
    expect(isQuoteWithinPolicy(compliantQuote, 900)).toBe(true);

    // Verify backend rejection when quote exceeds policy fare limit
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      json: async () => ({
        error: {
          code: 'POLICY_FARE_LIMIT',
          message: 'Ride exceeds the user-approved fare limit.',
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.book('journey-123', 'q-expensive')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'POLICY_FARE_LIMIT',
      message: 'Ride exceeds the user-approved fare limit.',
    });

    expect(sessionStorage.getItem('journey')).toBeNull();
  });
});
