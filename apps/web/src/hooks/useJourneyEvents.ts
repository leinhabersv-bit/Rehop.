'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_BASE, api } from '@/lib/api/client';
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
    let socket: WebSocket | undefined;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
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
        const response = await api.events(journeyId, ordered.length);
        merge(response.events);
        if (socket?.readyState !== WebSocket.OPEN) publish('replaying');
      } catch {
        if (socket?.readyState !== WebSocket.OPEN) publish('offline');
      } finally {
        replaying = false;
      }
    }

    function reconnectLater() {
      if (stopped) return;
      void replay();
      reconnect = setTimeout(connect, 2500);
    }

    function connect() {
      if (stopped) return;
      try {
        const url = new URL(`${API_BASE.replace(/\/$/, '')}/ws/journeys/${encodeURIComponent(journeyId)}`);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        url.searchParams.set('since_seq', String(ordered.length));
        const activeSocket = new WebSocket(url);
        socket = activeSocket;
        activeSocket.onopen = () => {
          publish('live');
          void queryClient.invalidateQueries({ queryKey });
        };
        activeSocket.onmessage = ({ data }) => {
          try {
            const event = JSON.parse(data) as Event;
            merge([event]);
            if (received.size) void replay();
          } catch {
            void replay();
          }
        };
        activeSocket.onclose = () => {
          publish('connecting');
          reconnectLater();
        };
        activeSocket.onerror = () => activeSocket.close();
      } catch {
        reconnectLater();
      }
    }

    connect();
    const fallback = setInterval(() => {
      if (received.size || socket?.readyState !== WebSocket.OPEN) void replay();
    }, 4000);
    return () => {
      stopped = true;
      clearInterval(fallback);
      clearTimeout(refresh);
      clearTimeout(reconnect);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, [enabled, journeyId, queryClient]);

  return stream.id === journeyId ? stream : { events: [], connection: 'connecting' as const };
}
