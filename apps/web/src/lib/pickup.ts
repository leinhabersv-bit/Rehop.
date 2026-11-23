import type { Journey, Quote } from '@/types';

export const DEFAULT_PICKUP_WAIT = 10;
export const PICKUP_WAIT_PRESETS = [5, 8, 10, 15, 20, 30];

export function recommendRide(journey: Pick<Journey, 'quotes' | 'policy' | 'simulated_time' | 'need_by'>): Quote | undefined {
  const now = Date.parse(journey.simulated_time);
  const deadline = Date.parse(journey.need_by);

  return journey.quotes.filter((quote) =>
    Date.parse(quote.expires_at) > now &&
    now + quote.pickup_eta_sec * 1000 <= deadline &&
    quote.estimated_fare_inr <= journey.policy.max_total_fare_inr
  ).sort((a, b) => a.estimated_fare_inr - b.estimated_fare_inr || a.pickup_eta_sec - b.pickup_eta_sec)[0];
}
