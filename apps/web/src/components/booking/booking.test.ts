import { describe, it, expect } from 'vitest';
import { DEFAULT_LOCATIONS } from './LocationInput';

describe('Booking Components & Logic', () => {
  it('provides default fallback locations', () => {
    expect(DEFAULT_LOCATIONS.length).toBeGreaterThanOrEqual(4);
    const vit = DEFAULT_LOCATIONS.find((l) => l.label === 'VIT Chennai');
    const airport = DEFAULT_LOCATIONS.find((l) => l.label === 'Chennai Airport');
    expect(vit).toBeDefined();
    expect(airport).toBeDefined();
    expect(vit?.lat).toBe(12.8406);
    expect(airport?.lat).toBe(12.9941);
  });
});
