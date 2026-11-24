'use client';

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { queryOptions, useQueries, type UseQueryResult } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowRight, CarFront } from 'lucide-react';
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
  const [ids, arrivals] = useMemo(() => (raw ? JSON.parse(raw) : [[], {}]) as [string[], Record<string, number>], [raw]);
  const [now, setNow] = useState(Date.now);
  const queries = useQueries({ queries: ids.map((id) => queryOptions({
    queryKey: ['journey', id], queryFn: () => api.journey(id), staleTime: 20_000,
    refetchInterval: (query) => pickupInProgress(query.state.data) ? 5_000 : false,
  })) });
  const pickup = queries.map(({ data }) => data).find(pickupInProgress);
  const boarded = pickup ? undefined : queries.map(({ data }) => data).find((ride) =>
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

  const active = pickup ?? (end === undefined || end > now ? boarded : undefined);
  const checking = raw === null || queries.some((query) => query.isPending);
  return <ActiveRideContext.Provider value={{
    active, checking, arrivals, now, entries: ids.map((id, i) => ({ id, query: queries[i] })),
  }}>{children}</ActiveRideContext.Provider>;
}

export const useActiveRide = () => useContext(ActiveRideContext);

export function ActiveRideCard({ ride, heading: Heading = 'h1' }: { ride: Journey; heading?: 'h1' | 'h2' }) {
  return <section className="mx-auto grid max-w-3xl gap-4 rounded-3xl border border-[#dce4ff] bg-[#edf1ff] p-6 sm:p-8">
    <CarFront className="text-[#173ed7]" size={28} aria-hidden="true" />
    <Heading className="text-2xl font-black sm:text-4xl">Your ride is in progress</Heading>
    <p className="break-words text-[#475673]">{ride.pickup.label} → {ride.dropoff.label}</p>
    <Link href={`/journey/${encodeURIComponent(ride.id)}`} className="btn w-fit">Track ride <ArrowRight size={17} aria-hidden="true" /></Link>
  </section>;
}
