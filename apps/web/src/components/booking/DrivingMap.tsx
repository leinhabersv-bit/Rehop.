'use client';

import { useEffect, useRef } from 'react';
import { circleMarker, latLng, map, polyline, tileLayer } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { DrivingRoute } from '@/lib/maps';
import type { Location } from '@/types';

type DrivingMapProps = Pick<DrivingRoute, 'coordinates'> & {
  pickup: Location;
  dropoff: Location;
};

export default function DrivingMap({ coordinates, pickup, dropoff }: DrivingMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const { lat: pickupLat, lng: pickupLng } = pickup;
  const { lat: dropoffLat, lng: dropoffLng } = dropoff;

  useEffect(() => {
    if (!container.current) return;
    const view = map(container.current, { scrollWheelZoom: false, attributionControl: false });
    const points = coordinates.map(([lng, lat]) => latLng(lat, lng));
    const start = latLng(pickupLat, pickupLng);
    const end = latLng(dropoffLat, dropoffLng);
    tileLayer(process.env.NEXT_PUBLIC_REHOP_MAP_TILES || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(view);
    const outline = polyline(points, { color: '#fff', weight: 9, interactive: false }).addTo(view);
    polyline(points, { color: '#173ed7', weight: 5, interactive: false }).addTo(view);
    circleMarker(start, { color: '#fff', weight: 3, radius: 7, fillColor: '#173ed7', fillOpacity: 1 })
      .addTo(view).bindTooltip('Pickup');
    circleMarker(end, { color: '#fff', weight: 3, radius: 7, fillColor: '#a64e24', fillOpacity: 1 })
      .addTo(view).bindTooltip('Destination');
    view.fitBounds(outline.getBounds().extend(start).extend(end), { padding: [32, 32], maxZoom: 16, animate: false });
    return () => { view.remove(); };
  }, [coordinates, pickupLat, pickupLng, dropoffLat, dropoffLng]);

  return <div ref={container} role="region" aria-label="Driving route map" className="isolate z-0 h-56 w-full bg-[#e8edf8] sm:h-72" />;
}
