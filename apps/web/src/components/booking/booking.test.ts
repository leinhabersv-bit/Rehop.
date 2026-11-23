import { describe, it, expect } from 'vitest';
import { DEFAULT_LOCATIONS } from './LocationInput';

describe('Booking Components & Logic', () => {
  it('provides default fallback locations', () => {
    expect(DEFAULT_LOCATIONS.length).toBeGreaterThanOrEqual(4);
    const vit = DEFAULT_LOCATIONS.find((l) => l.label === 'VIT Chennai');
    const airport = DEFAULT_LOCATIONS.find((l) => l.label === 'Chennai Airport');
    expect(vit).toBeDefined();
    expect(airport).toBeDefined();
    expect(vit).toMatchObject({ lat: 12.8405315, lng: 80.1530341 });
    expect(airport).toMatchObject({ lat: 12.9825533, lng: 80.167339 });
  });
});
