'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useDrivingRoute } from '@/components/booking/TripRoute';
import { googleMapsKey } from '@/lib/google-maps';
import { formatDrivingDistance, formatDrivingDuration } from '@/lib/maps';
import { tripPlayback, tripPlaybackLengthMs } from '@/lib/trip-playback';
import type { Location } from '@/types';
import { RideCab } from './RideCab';
import styles from './journey.module.css';

const GoogleDrivingMap = dynamic(() => import('@/components/booking/GoogleDrivingMap'), {
  ssr: false,
  loading: () => <div role="status" className="grid h-80 place-items-center bg-[#e8edf8] text-[#475673]">Loading destination map…</div>,
});

export default function DestinationTracking({ pickup, dropoff, boardedAt }: {
  pickup: Location;
  dropoff: Location;
  boardedAt?: string | null;
}) {
  const point = ({ lat, lng }: Location) => `${lng.toFixed(6)},${lat.toFixed(6)}`;
  const route = useDrivingRoute(point(pickup), point(dropoff), googleMapsKey ? 'google-map' : 'osm');
  const [now, setNow] = useState(Date.now);
  const startedAt = Date.parse(boardedAt ?? '');
  const canTrack = Number.isFinite(startedAt);
  const duration = route.data?.durationSeconds;

  useEffect(() => {
    if (!canTrack || duration === undefined) return;
    const end = startedAt + tripPlaybackLengthMs(duration);
    const update = () => setNow(Date.now());
    const timer = window.setInterval(() => {
      update();
      if (Date.now() >= end) window.clearInterval(timer);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [canTrack, duration, startedAt]);

  const trip = canTrack && route.data ? tripPlayback(startedAt, now, route.data.durationSeconds, route.data.distanceMeters) : null;
  const arrived = trip?.progress === 1;
  const result = route.data;
  const showMap = result?.provider === 'google' && result.coordinates.length >= 2;
  return (
    <div className={styles.pickupTracking}>
      <dl className={styles.stats}>
        <div><dt>Arrival ETA</dt><dd>{arrived ? 'Arrived' : trip ? formatDrivingDuration(trip.remainingSeconds) : '—'}</dd></div>
        <div><dt>Remaining distance</dt><dd>{trip ? formatDrivingDistance(trip.remainingMeters) : '—'}</dd></div>
      </dl>
      {arrived && <p role="status" className="pb-3 text-sm font-bold text-[#ffcbab]">Arrived at {dropoff.label}</p>}
      {showMap ? (
        <div className={styles.pickupMap}>
          <div className={styles.approachHeading}><span>Destination route</span><span>Accelerated simulation · Google Maps</span></div>
          <GoogleDrivingMap coordinates={result.coordinates} pickup={pickup} dropoff={dropoff}
            driver={trip ? { marker: <RideCab />, progress: trip.progress, target: 'destination' } : undefined} />
          <div className={styles.approachFooter}><span>{arrived ? 'Trip complete' : 'In transit'}</span><span>Destination · {dropoff.label}</span></div>
        </div>
      ) : <p role="status" className="text-sm text-[#e4eaff]">{route.isFetching
        ? 'Loading the destination route…' : result ? 'Estimated from the road route below.' : 'The destination route is unavailable.'}</p>}
      {!canTrack && <p className="mt-3 text-sm text-[#e4eaff]">Arrival tracking is unavailable for this booking.</p>}
    </div>
  );
}
