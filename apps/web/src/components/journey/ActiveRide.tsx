'use client';

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { queryOptions, useQueries, type UseQueryResult } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useDrivingRoute } from '@/components/booking/TripRoute';
import { api } from '@/lib/api/client';
import { googleMapsKey } from '@/lib/google-maps';
import { recentRideSnapshot, rememberRideArrival, subscribeToRides } from '@/lib/recent-rides';
import { tripPlaybackLengthMs } from '@/lib/trip-playback';
import type { Journey, Location } from '@/types';

const occupied = new Set(['MONITORING', 'AT_RISK', 'AWAITING_APPROVAL', 'RECOVERING', 'RECONCILING']);
const pickupInProgress = (ride?: Journey) => !!ride && (ride.booking_uncertain || occupied.has(ride.state));
const point = ({ lat, lng }: Location) => `${lng.toFixed(6)},${lat.toFixed(6)}`;
const serverSnapshot = () => null;

const ActiveRideContext = createContext<{
  active?: Journey;
  checking: boolean;
  entries: { id: string; query: UseQueryResult<Journey> }[];
  arrivals: Record<string, number>;
  now: number;
}>({ checking: true, entries: [], arrivals: {}, now: 0 });

export function ActiveRideProvider({ children }: { children: ReactNode }) {
  const raw = useSyncExternalStore(subscribeToRides, recentRideSnapshot, serverSnapshot);
  const [ids, localArrivals] = useMemo(() => (raw ? JSON.parse(raw) : [[], {}]) as [string[], Record<string, number>], [raw]);
  const [now, setNow] = useState(Date.now);
  const queries = useQueries({ queries: ids.map((id) => queryOptions({
    queryKey: ['journey', id], queryFn: () => api.journey(id), staleTime: 20_000,
    refetchInterval: (query) => pickupInProgress(query.state.data) ? 5_000 : false,
  })) });
  const arrivals = { ...localArrivals };
  const rides = queries.map(({ data }) => data);
  for (const ride of rides) {
    if (ride?.arrives_at) arrivals[ride.id] = Date.parse(ride.arrives_at);
  }
  const pickup = rides.find(pickupInProgress);
  const boarded = pickup ? undefined : rides.find((ride) =>
    ride?.state === 'PICKUP_CONFIRMED' && !!ride.boarded_at && (arrivals[ride.id] ?? Infinity) > now);
  const recorded = boarded ? arrivals[boarded.id] : undefined;
  const route = useDrivingRoute(boarded ? point(boarded.pickup) : '', boarded ? point(boarded.dropoff) : '',
    googleMapsKey ? 'google-map' : 'osm', !!boarded && recorded === undefined);
  const end = recorded ?? (boarded?.boarded_at && route.data
    ? Date.parse(boarded.boarded_at) + tripPlaybackLengthMs(route.data.durationSeconds) : undefined);

  useEffect(() => {
    if (!boarded || end === undefined) return;
    if (recorded === undefined) rememberRideArrival(boarded.id, end);
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, end - Date.now()) + 20);
    return () => window.clearTimeout(timer);
  }, [boarded, end, recorded]);

  const active = pickup ?? ((end === undefined && !route.isError) || (end !== undefined && end > now) ? boarded : undefined);
  const checking = raw === null || queries.some((query) => query.isPending);
  return <ActiveRideContext.Provider value={{
    active, checking, arrivals, now, entries: ids.map((id, i) => ({ id, query: queries[i] })),
  }}>{children}</ActiveRideContext.Provider>;
}

export const useActiveRide = () => useContext(ActiveRideContext);

export function ActiveRideGate({ children }: { children: ReactNode }) {
  const { active, checking } = useActiveRide();
  const path = usePathname();
  const router = useRouter();
  const tracking = active ? `/journey/${encodeURIComponent(active.id)}` : undefined;
  const redirectTo = tracking && path !== tracking ? tracking : undefined;

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  if (redirectTo) return <p role="status">Opening your ride…</p>;
  if (checking && !tracking && !path.startsWith('/journey/')) return <p role="status">Checking ride status…</p>;
  return children;
}
