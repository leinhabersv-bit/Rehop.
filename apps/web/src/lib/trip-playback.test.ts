import { expect, it } from 'vitest';
import { tripPlayback } from './trip-playback';

it('uses the recorded boarding time, advances both estimates, and stops at the destination', () => {
  expect(tripPlayback(5000, 4000, 1200, 10_000)).toEqual({ progress: 0, remainingSeconds: 1200, remainingMeters: 10_000 });
  expect(tripPlayback(5000, 35_000, 1200, 10_000)).toEqual({ progress: 0.5, remainingSeconds: 600, remainingMeters: 5000 });
  expect(tripPlayback(5000, 70_000, 1200, 10_000)).toEqual({ progress: 1, remainingSeconds: 0, remainingMeters: 0 });
  expect(tripPlayback(5000, 9000, 30, 200).progress).toBe(0.5);
});
