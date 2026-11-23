import { describe, it, expect } from 'vitest';
import { ProviderCard } from './ProviderCard';
import { BookingConfirmationModal } from './BookingConfirmationModal';
import { CompareScreen, FALLBACK_MOCK_JOURNEY } from './CompareScreen';
import { providerName, type Quote, type Provider } from '@/types';

describe('Compare & Confirmation Components & Business Logic', () => {
  it('exports valid React components', () => {
    expect(ProviderCard).toBeDefined();
    expect(typeof ProviderCard).toBe('function');
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

  it('validates FALLBACK_MOCK_JOURNEY specifications', () => {
    expect(FALLBACK_MOCK_JOURNEY.id).toBe('sim-fallback-demo');
    expect(FALLBACK_MOCK_JOURNEY.is_simulated).toBe(true);
    expect(FALLBACK_MOCK_JOURNEY.quotes.length).toBe(4);

    const providerList = FALLBACK_MOCK_JOURNEY.quotes.map((q) => q.provider);
    expect(providerList).toEqual(['PROVIDER_A', 'PROVIDER_B', 'PROVIDER_C', 'PROVIDER_D']);

    // Check all simulated flags and values
    for (const quote of FALLBACK_MOCK_JOURNEY.quotes) {
      expect(quote.is_simulated).toBe(true);
      expect(quote.estimated_fare_inr).toBeGreaterThan(0);
      expect(quote.pickup_eta_sec).toBeGreaterThan(0);
      expect(quote.expires_at).toBeDefined();
    }
  });

  it('correctly sorts quotes by fastest ETA', () => {
    const quotes = [...FALLBACK_MOCK_JOURNEY.quotes];
    const sortedByEta = [...quotes].sort((a, b) => a.pickup_eta_sec - b.pickup_eta_sec);

    expect(sortedByEta[0].provider).toBe('PROVIDER_A'); // 240s
    expect(sortedByEta[1].provider).toBe('PROVIDER_C'); // 300s
    expect(sortedByEta[2].provider).toBe('PROVIDER_B'); // 360s
    expect(sortedByEta[3].provider).toBe('PROVIDER_D'); // 480s
  });

  it('correctly sorts quotes by lowest price', () => {
    const quotes = [...FALLBACK_MOCK_JOURNEY.quotes];
    const sortedByPrice = [...quotes].sort((a, b) => a.estimated_fare_inr - b.estimated_fare_inr);

    expect(sortedByPrice[0].provider).toBe('PROVIDER_B'); // ₹820
    expect(sortedByPrice[1].provider).toBe('PROVIDER_A'); // ₹890
    expect(sortedByPrice[2].provider).toBe('PROVIDER_D'); // ₹960
    expect(sortedByPrice[3].provider).toBe('PROVIDER_C'); // ₹1050
  });

  it('correctly flags quotes exceeding policy max fare', () => {
    const maxFare = 900;
    const affordable = FALLBACK_MOCK_JOURNEY.quotes.filter(
      (q) => q.estimated_fare_inr <= maxFare
    );
    const exceeding = FALLBACK_MOCK_JOURNEY.quotes.filter(
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
});
