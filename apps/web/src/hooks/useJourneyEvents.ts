'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Event, Journey } from '@/types';

export type Connection = 'connecting' | 'live' | 'replaying' | 'offline';

export function drainReplayBatch(buffer: Map<number, Event>, journeyId: string, lastSeq: number, items: Event[]) {
  for (const item of items) {
    if (item.journey_id === journeyId && Number.isSafeInteger(item.seq) && item.seq > lastSeq) {
      buffer.set(item.seq, item);
    }
  }
  const ordered: Event[] = [];
  for (let seq = lastSeq + 1; ; seq++) {
    const event = buffer.get(seq);
    if (!event) break;
    ordered.push(event);
    buffer.delete(seq);
  }
  return ordered;
}

export function useJourneyEvents(journeyId: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const [stream, setStream] = useState<{ id: string; events: Event[]; connection: Connection }>({
    id: journeyId,
    events: [],
    connection: 'connecting',
  });

  useEffect(() => {
    if (!enabled) return;

    const queryKey = ['journey', journeyId];
    const received = new Map<number, Event>();
    let ordered: Event[] = [];
    let connection: Connection = 'connecting';
    let stopped = false;
    let replaying = false;
    let validator: { cursor: number; etag?: string } | undefined;
    let refresh: ReturnType<typeof setTimeout> | undefined;

    function publish(nextConnection: Connection = connection) {
      if (stopped) return;
      connection = nextConnection;
      setStream({ id: journeyId, events: ordered, connection });
    }

    function merge(items: Event[]) {
      if (stopped) return;
      const next = drainReplayBatch(received, journeyId, ordered.length, items);
      if (!next.length) return;
      ordered = [...ordered, ...next];
      publish();
      if (!refresh) {
        refresh = setTimeout(() => {
          refresh = undefined;
          const snapshot = queryClient.getQueryData<Journey>(queryKey);
          if ((snapshot?.last_event_seq ?? 0) < ordered.length) {
            void queryClient.invalidateQueries({ queryKey });
          }
        }, 100);
      }
    }

    async function replay() {
      if (replaying || stopped) return;
      replaying = true;
      try {
        const cursor = ordered.length;
        const { page, etag } = await api.events(journeyId, cursor, validator?.cursor === cursor ? validator.etag : undefined);
        validator = { cursor, etag };
        if (page) merge(page.events);
        if (connection !== 'live') publish('live');
      } catch {
        if (connection !== 'offline') publish('offline');
      } finally {
        replaying = false;
      }
    }

    void replay();
    const polling = setInterval(() => void replay(), 1500);
    return () => {
      stopped = true;
      clearInterval(polling);
      clearTimeout(refresh);
    };
  }, [enabled, journeyId, queryClient]);

  return stream.id === journeyId ? stream : { events: [], connection: 'connecting' as const };
}
