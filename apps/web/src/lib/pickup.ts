import type { Journey, Quote } from '@/types';

export const DEFAULT_PICKUP_WAIT = 10;

export function isQuoteExpired(quote: Pick<Quote, 'expires_at'>, currentTimeMs: number): boolean {
  return !(Date.parse(quote.expires_at) > currentTimeMs);
}

export function isQuoteWithinPolicy(
  quote: Pick<Quote, 'estimated_fare_inr'>,
  policy: number | { max_total_fare_inr: number },
): boolean {
  const maxFare = typeof policy === 'number' ? policy : policy.max_total_fare_inr;
  return quote.estimated_fare_inr <= maxFare;
}

export function recommendRide(journey: Pick<Journey, 'quotes' | 'policy' | 'simulated_time' | 'need_by'>): Quote | undefined {
  const now = Date.parse(journey.simulated_time);
  const deadline = Date.parse(journey.need_by);

  return journey.quotes.filter((quote) =>
    !isQuoteExpired(quote, now) &&
    now + quote.pickup_eta_sec * 1000 <= deadline &&
    isQuoteWithinPolicy(quote, journey.policy)
  ).sort((a, b) => a.estimated_fare_inr - b.estimated_fare_inr || a.pickup_eta_sec - b.pickup_eta_sec)[0];
}
