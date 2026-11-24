'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { MapPin } from 'lucide-react';
import { useDrivingRoute } from '@/components/booking/TripRoute';
import { googleMapsKey } from '@/lib/google-maps';
import { measureRoute } from '@/lib/route-path';
import type { Location } from '@/types';
import { RideCab } from './RideCab';
import styles from './journey.module.css';

const GoogleDrivingMap = dynamic(() => import('@/components/booking/GoogleDrivingMap'), {
  ssr: false,
  loading: () => <div role="status" className="grid h-80 place-items-center bg-[#e8edf8] text-[#475673]">Loading pickup map…</div>,
});

export default function PickupApproach({ pickup, dropoff, startDistance, distance, progress, stalled, status }: {
  pickup: Location;
  dropoff: Location;
  startDistance: number;
  distance: string;
  progress: number;
  stalled: boolean;
  status: string;
}) {
  const format = (lng: number, lat: number) => `${lng.toFixed(6)},${lat.toFixed(6)}`;
  const to = format(pickup.lng, pickup.lat);
  const trip = useDrivingRoute(to, format(dropoff.lng, dropoff.lat), 'google-map', Boolean(googleMapsKey));
  // The simulator supplies distance only. Use a point on the outbound road as
  // its starting location, then ask Google for the legal route back to pickup.
  const path = trip.data?.provider === 'google' ? trip.data.coordinates : undefined;
  const origin = useMemo(() => path && path.length >= 2 && startDistance > 0
    ? measureRoute(path).pointAt(startDistance) : undefined, [path, startDistance]);
  const from = origin ? format(...origin) : to;
  const route = useDrivingRoute(from, to, 'google-map', Boolean(googleMapsKey && origin));
  const coordinates = route.data?.provider === 'google' ? route.data.coordinates : undefined;
  const showMap = !!(coordinates && coordinates.length >= 2);
  const cab = <RideCab stalled={stalled} progress={showMap ? undefined : progress} />;

  if (showMap) {
    return (
      <div className={styles.pickupMap}>
        <div className={styles.approachHeading}><span>Driver location</span><span>Simulated position · Google Maps</span></div>
        <GoogleDrivingMap coordinates={coordinates} pickup={pickup} dropoff={pickup} driver={{ progress, marker: cab }} />
        <div className={styles.approachFooter}><span>{stalled ? 'Position unchanged' : status}</span><span>Pickup · {pickup.label}</span></div>
      </div>
    );
  }

  const loading = googleMapsKey && (trip.fetchStatus !== 'idle' || (origin && route.fetchStatus !== 'idle'));
  return (
    <div className={styles.approach} role="img" aria-label={`Simulated driver approach. ${status}. ${stalled ? 'Driver position unchanged. ' : ''}${distance} to pickup.`}>
      <div className={styles.approachHeading} aria-hidden="true">
        <span>Driver location</span>
        <span>{loading ? 'Loading Google Maps pickup route…' : 'Simulated pickup route'}</span>
      </div>
      <div className={styles.approachTrack} aria-hidden="true">
        <span className={styles.approachPin}><MapPin size={23} /></span>
        {cab}
      </div>
      <div className={styles.approachFooter} aria-hidden="true">
        <span>{stalled ? 'Position unchanged' : status}</span>
        <span>Pickup · {pickup.label}</span>
      </div>
    </div>
  );
}
