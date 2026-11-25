'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Clock3, Route } from 'lucide-react';
import { useDrivingRoute } from '@/components/booking/TripRoute';
import { googleMapsKey } from '@/lib/google-maps';
import { formatDrivingDistance, formatDrivingDuration, type DrivingRoute } from '@/lib/maps';
import { tripPlayback, tripPlaybackLengthMs } from '@/lib/trip-playback';
import type { Journey, Location } from '@/types';
import { RideCab } from './RideCab';
import styles from './journey.module.css';

const GoogleDrivingMap = dynamic(() => import('@/components/booking/GoogleDrivingMap'), {
  ssr: false,
  loading: () => <div role="status" className="grid h-80 place-items-center bg-[#e8edf8] text-[#475673]">Loading destination map…</div>,
});

const point = ({ lat, lng }: Location) => `${lng.toFixed(6)},${lat.toFixed(6)}`;

export function useDestinationProgress(journey?: Journey) {
  const route = useDrivingRoute(
    journey ? point(journey.pickup) : '',
    journey ? point(journey.dropoff) : '',
    googleMapsKey ? 'google-map' : 'osm',
    !!journey,
  );
  const [now, setNow] = useState(Date.now);
  const startedAt = Date.parse(journey?.boarded_at ?? '');
  const arrivesAt = journey?.arrives_at;
  const canTrack = Number.isFinite(startedAt);
  const duration = route.data?.durationSeconds;
  const end = arrivesAt ? Date.parse(arrivesAt) :
    canTrack && duration !== undefined ? startedAt + tripPlaybackLengthMs(duration) : undefined;

  useEffect(() => {
    if (end === undefined) return;
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 1_000);
    const finish = window.setTimeout(() => {
      window.clearInterval(timer);
      update();
    }, Math.max(0, end - Date.now()));
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(finish);
    };
  }, [end]);

  const trip = canTrack && route.data ? tripPlayback(startedAt, now, route.data.durationSeconds, route.data.distanceMeters, end) : null;
  return { arrived: end !== undefined && now >= end, canTrack, route, trip };
}

type DestinationProgress = ReturnType<typeof useDestinationProgress>;

export default function DestinationTracking({ pickup, dropoff, progress }: {
  pickup: Location;
  dropoff: Location;
  progress: DestinationProgress;
}) {
  const { route, trip, canTrack } = progress;
  const result = route.data;
  const showMap = result?.provider === 'google' && result.coordinates.length >= 2;
  return (
    <div className={styles.pickupTracking}>
      <dl className={styles.stats}>
        <div><dt>Arrival ETA</dt><dd>{trip ? formatDrivingDuration(trip.remainingSeconds) : '—'}</dd></div>
        <div><dt>Remaining distance</dt><dd>{trip ? formatDrivingDistance(trip.remainingMeters) : '—'}</dd></div>
      </dl>
      {showMap ? (
        <div className={styles.pickupMap}>
          <div className={styles.approachHeading}><span>Destination route</span><span>Accelerated simulation · Google Maps</span></div>
          <GoogleDrivingMap coordinates={result.coordinates} pickup={pickup} dropoff={dropoff}
            driver={trip ? { marker: <RideCab />, progress: trip.progress, target: 'destination' } : undefined} />
          <div className={styles.approachFooter}><span>In transit</span><span>Destination · {dropoff.label}</span></div>
        </div>
      ) : <p role="status" className="text-sm text-[#e4eaff]">{route.isFetching
        ? 'Loading the destination route…' : result ? 'Estimated from the road route below.' : 'The destination route is unavailable.'}</p>}
      {!canTrack && <p className="mt-3 text-sm text-[#e4eaff]">Arrival tracking is unavailable for this booking.</p>}
    </div>
  );
}

export function TripCompleted({ pickup, dropoff, fare, route, loading }: {
  pickup: Location;
  dropoff: Location;
  fare?: number;
  route?: DrivingRoute;
  loading: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: 'nearest' });
  }, []);

  const unavailable = loading ? 'Loading…' : 'Unavailable';
  return (
    <section aria-labelledby="trip-completed" className="mx-auto max-w-lg overflow-hidden rounded-3xl border border-[#d9dce9] bg-[#fffdf8] shadow-lg">
      <header className="bg-[#111a42] bg-[radial-gradient(ellipse_at_top_right,#274696,transparent_75%)] px-5 py-6 text-[#fffdf8] sm:px-8 sm:py-8">
        <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-[#ffcbab] text-[#111a42]">
          <Check size={26} strokeWidth={3} aria-hidden="true" />
        </div>
        <h1 id="trip-completed" ref={heading} tabIndex={-1} className="scroll-mt-24 text-3xl font-black tracking-tight !text-[#fffdf8] focus:outline-none sm:text-4xl">Trip completed</h1>
        <p className="mt-2 break-words text-sm leading-relaxed text-[#dce5ff]">You’ve arrived at <strong className="text-white">{dropoff.label}</strong>.</p>
      </header>

      <div className="grid gap-5 p-5 sm:p-8">
        <dl className="grid grid-cols-2 gap-2.5" aria-live="polite">
          <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#edf1ff] px-4 py-3">
            <dt className="text-sm font-semibold text-[#43536b]">Simulated fare</dt>
            <dd className="text-2xl font-black tracking-tight text-[#173ed7]">{fare === undefined ? 'Unavailable' : `₹${fare.toLocaleString('en-IN')}`}</dd>
          </div>
          <div className="min-w-0 rounded-2xl border border-[#d9dce9] p-3">
            <dt className="flex items-center gap-1.5 text-xs font-semibold text-[#43536b]"><Clock3 size={15} aria-hidden="true" /> Trip time</dt>
            <dd className="mt-1.5 break-words text-lg font-extrabold text-[#111a42]">{route ? formatDrivingDuration(route.durationSeconds) : unavailable}</dd>
          </div>
          <div className="min-w-0 rounded-2xl border border-[#d9dce9] p-3">
            <dt className="flex items-center gap-1.5 text-xs font-semibold text-[#43536b]"><Route size={15} aria-hidden="true" /> Distance</dt>
            <dd className="mt-1.5 break-words text-lg font-extrabold text-[#111a42]">{route ? formatDrivingDistance(route.distanceMeters) : unavailable}</dd>
          </div>
        </dl>

        <div className="grid gap-2 border-b border-[#d9dce9] pb-4 text-sm">
          <p className="flex items-baseline gap-2 break-words [overflow-wrap:anywhere]"><span className="mt-1 size-2.5 shrink-0 rounded-full border-2 border-[#173ed7]" /><span><span className="sr-only">From </span>{pickup.label}</span></p>
          <p className="flex items-baseline gap-2 break-words [overflow-wrap:anywhere]"><span className="mt-1 size-2.5 shrink-0 rounded-sm bg-[#173ed7]" /><span><span className="sr-only">To </span>{dropoff.label}</span></p>
          {route && <p className="pl-[18px] text-xs text-[#43536b]">Route estimates from {route.provider === 'google' ? 'Google Maps' : 'OpenStreetMap'}.</p>}
        </div>

        <div className="grid gap-2">
          <Link className="btn w-full gap-2" href="/book">Book another ride <ArrowRight size={18} aria-hidden="true" /></Link>
          <Link className="inline-flex min-h-11 items-center justify-center rounded-xl text-sm font-bold text-[#173ed7] hover:bg-[#edf1ff]" href="/trips">Your rides</Link>
        </div>
      </div>
    </section>
  );
}
