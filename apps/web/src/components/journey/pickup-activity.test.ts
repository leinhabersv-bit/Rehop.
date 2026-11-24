import { expect, it } from 'vitest';
import type { Event, Ride } from '@/types';
import { pickupActivity } from './pickup-activity';

it('shows movement and one stall update, with elapsed time since booking', () => {
  const event = (seq: number, seconds: number, type: string, payload: Event['payload'] = {}): Event => ({
    seq, type, payload, event_id: String(seq), journey_id: 'journey', ride_id: 'ride',
    timestamp: new Date(Date.UTC(2026, 10, 23, 8, 30, seconds)).toISOString(),
  });
  const sample = (seq: number, seconds: number, distance: number) => event(seq, seconds, 'TELEMETRY_UPDATED', {
    distance_to_pickup_m: distance, gps_quality: 'GOOD',
  });
  const events = [
    event(1, 0, 'QUOTES_READY'),
    event(2, 0, 'RIDE_CONFIRMED', { ride: { provider: 'PROVIDER_B', distance_to_pickup_m: 900 } }),
    sample(3, 5, 750), sample(4, 10, 750), sample(5, 15, 750), sample(6, 20, 750), sample(7, 25, 750),
    event(8, 25, 'BACKUP_FOUND', { candidate: { provider: 'PROVIDER_A', pickup_eta_sec: 175 } }),
  ];
  const ride = { ride_id: 'ride', distance_to_pickup_m: 750 } as Ride;
  expect(pickupActivity(events, ride)).toEqual({
    progress: expect.closeTo(1 / 6), stalled: true,
    timeline: [
      { seq: 2, elapsed: '+0:00', label: 'Ride booked with Provider B' },
      { seq: 6, elapsed: '+0:20', label: 'Driver position has stayed the same' },
      { seq: 8, elapsed: '+0:25', label: 'Backup found · Provider A · 3 min away' },
    ],
  });
  const resumed = pickupActivity([...events, sample(9, 30, 600)], { ...ride, distance_to_pickup_m: 600 });
  expect(resumed.stalled).toBe(false);
  expect(resumed.progress).toBeCloseTo(1 / 3);
});
