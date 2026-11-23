'use client';

import { useEffect, useRef, useState } from 'react';
import { loadGoogleLibrary } from '@/lib/google-maps';
import type { DrivingRoute } from '@/lib/maps';
import type { Location } from '@/types';

export default function GoogleDrivingMap({ coordinates, pickup, dropoff }: Pick<DrivingRoute, 'coordinates'> & {
  pickup: Location;
  dropoff: Location;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const { lat: pickupLat, lng: pickupLng } = pickup;
  const { lat: dropoffLat, lng: dropoffLng } = dropoff;

  useEffect(() => {
    let disposed = false;
    const node = container.current;
    let line: google.maps.Polyline | undefined;
    let markers: google.maps.Marker[] = [];

    async function draw() {
      const [maps, core, marker] = await Promise.all([
        loadGoogleLibrary('maps'), loadGoogleLibrary('core'), loadGoogleLibrary('marker'),
      ]) as [google.maps.MapsLibrary, google.maps.CoreLibrary, google.maps.MarkerLibrary];
      if (!node || disposed) return;
      const path = coordinates.map(([lng, lat]) => ({ lat, lng }));
      const points = [{ lat: pickupLat, lng: pickupLng }, { lat: dropoffLat, lng: dropoffLng }];
      const bounds = new core.LatLngBounds();
      [...path, ...points].forEach((point) => bounds.extend(point));
      const map = new maps.Map(node, { gestureHandling: 'cooperative', streetViewControl: false });
      line = new maps.Polyline({ map, path, strokeColor: '#173ed7', strokeWeight: 5 });
      markers = points.map((position, index) => new marker.Marker({
        map, position, title: index ? 'Destination' : 'Pickup', label: index ? 'B' : 'A',
      }));
      map.fitBounds(bounds, 32);
    }

    void draw().catch(() => { if (!disposed) setFailed(true); });
    return () => {
      disposed = true;
      line?.setMap(null);
      markers.forEach((marker) => marker.setMap(null));
      node?.replaceChildren();
    };
  }, [coordinates, pickupLat, pickupLng, dropoffLat, dropoffLng]);

  return failed
    ? <p role="status" className="px-3 py-2 text-sm text-[#475673]">The map could not load. Open Google Maps to see directions.</p>
    : <div ref={container} role="region" aria-label="Driving route map" className="isolate z-0 h-56 w-full bg-[#e8edf8] sm:h-72" />;
}
