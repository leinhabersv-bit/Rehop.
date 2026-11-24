import { describe, expect, it } from 'vitest';
import type { Event } from '@/types';
import { drainReplayBatch } from './useJourneyEvents';

function event(seq: number, journeyId = 'journey-1'): Event {
  return {
    event_id: `${journeyId}-${seq}`,
    journey_id: journeyId,
    seq,
    timestamp: '2026-11-23T08:30:00Z',
    type: 'TELEMETRY_UPDATED',
    ride_id: null,
    payload: {},
  };
}

describe('Journey event replay', () => {
  it('keeps the replay cursor behind a gap and emits overlapping batches in order', () => {
    const buffer = new Map<number, Event>();
    expect(drainReplayBatch(buffer, 'journey-1', 0, [event(1), event(4)])).toEqual([event(1)]);
    expect(drainReplayBatch(buffer, 'journey-1', 1, [event(1), event(3), event(2), event(4)])).toEqual([
      event(2), event(3), event(4),
    ]);
    expect(drainReplayBatch(buffer, 'journey-1', 4, [event(3), event(4)])).toEqual([]);
    expect(buffer.size).toBe(0);
  });

  it('ignores events from another journey even when their sequence could fill a gap', () => {
    const buffer = new Map<number, Event>();
    expect(drainReplayBatch(buffer, 'journey-1', 1, [event(2, 'journey-2'), event(3)])).toEqual([]);
    expect(drainReplayBatch(buffer, 'journey-1', 1, [event(2)])).toEqual([event(2), event(3)]);
  });
});
