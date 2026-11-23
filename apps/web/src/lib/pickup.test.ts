import { describe, expect, it } from 'vitest';
import type { Journey, Quote } from '@/types';
import { recommendRide } from './pickup';

const simulatedTime = '2026-11-23T08:30:00Z';
const offer: Quote = {
  quote_id: 'eligible', provider: 'PROVIDER_B', estimated_fare_inr: 285,
  pickup_eta_sec: 300, expires_at: '2026-11-23T08:30:30Z', is_simulated: true,
};
const trip: Pick<Journey, 'quotes' | 'policy' | 'simulated_time' | 'need_by'> = {
  simulated_time: simulatedTime,
  need_by: '2026-11-23T08:35:00Z',
  quotes: [],
  policy: {
    max_total_fare_inr: 350,
    max_recovery_attempts: 2,
    auto_rebook_on_confirmed_driver_cancel: false,
    preemptive_switch_requires_approval: true,
    allow_same_provider_retry: false,
    max_cancellation_fee_inr: 0,
  },
};

describe('ride recommendation', () => {
  it('keeps a deadline-equal quote and filters late, expired, and over-budget quotes', () => {
    const quotes = [
      { ...offer, quote_id: 'late', estimated_fare_inr: 180, pickup_eta_sec: 301 },
      { ...offer, quote_id: 'expired', estimated_fare_inr: 200, expires_at: simulatedTime },
      { ...offer, quote_id: 'over-budget', estimated_fare_inr: 351, pickup_eta_sec: 240 },
      offer,
    ];
    expect(recommendRide({ ...trip, quotes })).toBe(offer);
    expect(recommendRide({ ...trip, quotes: quotes.slice(0, -1) })).toBeUndefined();
  });

  it('uses pickup ETA to break a fare tie', () => {
    const faster = { ...offer, quote_id: 'faster', pickup_eta_sec: 240 };
    expect(recommendRide({ ...trip, quotes: [offer, faster] })).toBe(faster);
  });
});
