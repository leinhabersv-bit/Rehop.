import { describe, it, expect } from 'vitest';
import { BookingConfirmationModal, hasConfirmedRide } from './BookingConfirmationModal';
import { CompareScreen } from './CompareScreen';
import { providerName, type Quote, type Provider, type Journey } from '@/types';

const MOCK_JOURNEY_FOR_TESTS: Journey = {
  id: 'sim-fallback-demo',
  pickup: { label: 'VIT Chennai', lat: 12.8406, lng: 80.1534 },
  dropoff: { label: 'Chennai Airport', lat: 12.9941, lng: 80.1709 },
  state: 'OFFERED',
  version: 1,
  active_ride_id: null,
  active_ride: null,
  last_ride: null,
  quotes: [
    {
      quote_id: 'q-demo-a',
      provider: 'PROVIDER_A',
      estimated_fare_inr: 890,
      pickup_eta_sec: 240, // 4 min
      expires_at: new Date(Date.now() + 540000).toISOString(),
      is_simulated: true,
    },
    {
      quote_id: 'q-demo-b',
      provider: 'PROVIDER_B',
      estimated_fare_inr: 820,
      pickup_eta_sec: 360, // 6 min
      expires_at: new Date(Date.now() + 540000).toISOString(),
      is_simulated: true,
    },
    {
      quote_id: 'q-demo-c',
      provider: 'PROVIDER_C',
      estimated_fare_inr: 1050,
      pickup_eta_sec: 300, // 5 min
      expires_at: new Date(Date.now() + 540000).toISOString(),
      is_simulated: true,
    },
    {
      quote_id: 'q-demo-d',
      provider: 'PROVIDER_D',
      estimated_fare_inr: 960,
      pickup_eta_sec: 480, // 8 min
      expires_at: new Date(Date.now() + 540000).toISOString(),
      is_simulated: true,
    },
  ],
  risk: null,
  pending_backup: null,
  recovery_attempts: 0,
  policy: {
    auto_rebook_on_confirmed_driver_cancel: true,
    max_total_fare_inr: 1200,
    max_recovery_attempts: 2,
    preemptive_switch_requires_approval: true,
    allow_same_provider_retry: true,
    max_cancellation_fee_inr: 100,
  },
  scenario: 'S01',
  simulated_time: new Date().toISOString(),
  is_simulated: true,
  booking_uncertain: false,
  last_event_seq: 0,
  need_by: new Date(Date.now() + 25 * 60000).toISOString(),
  driver_chat_signal: null,
  deadline_decision: null,
  cancellation_fee_notice: null,
};

describe('Compare & Confirmation Components & Business Logic', () => {
  it('exports valid React components', () => {
    expect(BookingConfirmationModal).toBeDefined();
    expect(typeof BookingConfirmationModal).toBe('function');
    expect(CompareScreen).toBeDefined();
    expect(typeof CompareScreen).toBe('function');
  });

  it('adheres to neutral simulated provider constraints (Provider A to D)', () => {
    const allowedProviders: Provider[] = ['PROVIDER_A', 'PROVIDER_B', 'PROVIDER_C', 'PROVIDER_D'];

    for (const p of allowedProviders) {
      expect(providerName[p]).toMatch(/^Provider [A-D]$/);
      // Ensure no real taxi/cab brand names exist
      expect(providerName[p]).not.toMatch(/uber|ola|rapido|redtaxi/i);
    }
  });

  it('validates mock journey specifications for testing', () => {
    expect(MOCK_JOURNEY_FOR_TESTS.id).toBe('sim-fallback-demo');
    expect(MOCK_JOURNEY_FOR_TESTS.is_simulated).toBe(true);
    expect(MOCK_JOURNEY_FOR_TESTS.quotes.length).toBe(4);

    const providerList = MOCK_JOURNEY_FOR_TESTS.quotes.map((q) => q.provider);
    expect(providerList).toEqual(['PROVIDER_A', 'PROVIDER_B', 'PROVIDER_C', 'PROVIDER_D']);

    // Check all simulated flags and values
    for (const quote of MOCK_JOURNEY_FOR_TESTS.quotes) {
      expect(quote.is_simulated).toBe(true);
      expect(quote.estimated_fare_inr).toBeGreaterThan(0);
      expect(quote.pickup_eta_sec).toBeGreaterThan(0);
      expect(quote.expires_at).toBeDefined();
    }
  });

  it('correctly sorts quotes by fastest ETA', () => {
    const quotes = [...MOCK_JOURNEY_FOR_TESTS.quotes];
    const sortedByEta = [...quotes].sort((a, b) => a.pickup_eta_sec - b.pickup_eta_sec);

    expect(sortedByEta[0].provider).toBe('PROVIDER_A'); // 240s
    expect(sortedByEta[1].provider).toBe('PROVIDER_C'); // 300s
    expect(sortedByEta[2].provider).toBe('PROVIDER_B'); // 360s
    expect(sortedByEta[3].provider).toBe('PROVIDER_D'); // 480s
  });

  it('correctly sorts quotes by lowest price', () => {
    const quotes = [...MOCK_JOURNEY_FOR_TESTS.quotes];
    const sortedByPrice = [...quotes].sort((a, b) => a.estimated_fare_inr - b.estimated_fare_inr);

    expect(sortedByPrice[0].provider).toBe('PROVIDER_B'); // ₹820
    expect(sortedByPrice[1].provider).toBe('PROVIDER_A'); // ₹890
    expect(sortedByPrice[2].provider).toBe('PROVIDER_D'); // ₹960
    expect(sortedByPrice[3].provider).toBe('PROVIDER_C'); // ₹1050
  });

  it('correctly flags quotes exceeding policy max fare', () => {
    const maxFare = 900;
    const affordable = MOCK_JOURNEY_FOR_TESTS.quotes.filter(
      (q) => q.estimated_fare_inr <= maxFare
    );
    const exceeding = MOCK_JOURNEY_FOR_TESTS.quotes.filter(
      (q) => q.estimated_fare_inr > maxFare
    );

    expect(affordable.map((q) => q.provider)).toEqual(['PROVIDER_A', 'PROVIDER_B']);
    expect(exceeding.map((q) => q.provider)).toEqual(['PROVIDER_C', 'PROVIDER_D']);
  });

  it('calculates human-readable pickup ETA minutes accurately', () => {
    const quote: Quote = {
      quote_id: 'q-test-1',
      provider: 'PROVIDER_A',
      estimated_fare_inr: 890,
      pickup_eta_sec: 240,
      expires_at: new Date().toISOString(),
      is_simulated: true,
    };

    const etaMin = Math.max(1, Math.ceil(quote.pickup_eta_sec / 60));
    expect(etaMin).toBe(4);

    const quoteOddSec: Quote = {
      ...quote,
      pickup_eta_sec: 185,
    };
    expect(Math.max(1, Math.ceil(quoteOddSec.pickup_eta_sec / 60))).toBe(4);
  });

  it('detects quote expiry correctly based on expires_at timestamp', () => {
    const expiredQuote: Quote = {
      quote_id: 'q-expired',
      provider: 'PROVIDER_A',
      estimated_fare_inr: 850,
      pickup_eta_sec: 240,
      expires_at: new Date(Date.now() - 10000).toISOString(),
      is_simulated: true,
    };

    const isExpired = Date.now() >= new Date(expiredQuote.expires_at).getTime();
    expect(isExpired).toBe(true);
  });
});

it('confirms only the authoritative active booking for the requested quote', () => {
  const original = MOCK_JOURNEY_FOR_TESTS;
  const activeRide: NonNullable<Journey['active_ride']> = {
    ride_id: 'ride-1',
    journey_id: original.id,
    provider: 'PROVIDER_A',
    quote_id: 'q-demo-a',
    state: 'DRIVER_EN_ROUTE',
    booked_at: original.simulated_time,
    driver_id: 'SIM_DRIVER_1',
    distance_to_pickup_m: 1200,
    eta_sec: 240,
    last_position_at: original.simulated_time,
    is_simulated: true,
  };
  const booked: Journey = {
    ...original,
    state: 'MONITORING',
    active_ride_id: activeRide.ride_id,
    active_ride: activeRide,
  };

  expect(hasConfirmedRide(original, 'q-demo-a')).toBe(false);
  expect(hasConfirmedRide(booked, 'q-demo-a')).toBe(true);
  expect(hasConfirmedRide(booked, 'q-demo-b')).toBe(false);
  expect(hasConfirmedRide({ ...booked, active_ride_id: 'different-ride' })).toBe(false);
  expect(hasConfirmedRide({ ...booked, booking_uncertain: true })).toBe(false);
  expect(hasConfirmedRide({ ...booked, state: 'RECONCILING' })).toBe(false);
});
