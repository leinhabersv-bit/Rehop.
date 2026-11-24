'use client';

import { useEffect, useRef, useState } from 'react';
import { circleMarker, latLng, map, polyline, tileLayer, type Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { DrivingRoute } from '@/lib/maps';
import type { Location } from '@/types';

type DrivingMapProps = Pick<DrivingRoute, 'coordinates'> & {
  pickup: Location;
  dropoff: Location;
};

export default function DrivingMap({ coordinates, pickup, dropoff }: DrivingMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const viewRef = useRef<LeafletMap | null>(null);
  const resetView = useRef<(() => void) | null>(null);
  const [panning, setPanning] = useState(false);
  const { lat: pickupLat, lng: pickupLng } = pickup;
  const { lat: dropoffLat, lng: dropoffLng } = dropoff;

  useEffect(() => {
    if (!container.current) return;
    const compact = window.matchMedia('(max-width: 639px)');
    const view = map(container.current, {
      scrollWheelZoom: false,
      dragging: !compact.matches,
      attributionControl: false,
    });
    viewRef.current = view;
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
    const bounds = outline.getBounds().extend(start).extend(end);
    resetView.current = () => view.fitBounds(bounds, { padding: [28, 28], maxZoom: 16, animate: false });
    resetView.current();
    const onResize = new ResizeObserver(() => view.invalidateSize({ pan: false }));
    onResize.observe(container.current);
    return () => {
      onResize.disconnect();
      resetView.current = null;
      viewRef.current = null;
      view.remove();
    };
  }, [coordinates, pickupLat, pickupLng, dropoffLat, dropoffLng]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const compact = window.matchMedia('(max-width: 639px)');
    const apply = () => {
      if (!compact.matches || panning) view.dragging.enable();
      else view.dragging.disable();
    };
    apply();
    compact.addEventListener('change', apply);
    return () => compact.removeEventListener('change', apply);
  }, [panning, coordinates, pickupLat, pickupLng, dropoffLat, dropoffLng]);

  return (
    <>
      <div ref={container} role="region" aria-label="Driving route map" className="driving-route-map isolate z-0 h-[clamp(14rem,36svh,22rem)] w-full bg-[#e8edf8] sm:h-80" />
      <div className="flex flex-wrap items-center justify-between gap-x-2 border-t border-[#d9dbe7] px-3 text-xs font-semibold text-[#475673]">
        <span className="inline-flex flex-wrap items-center gap-3 py-2">
          <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="size-2 rounded-full bg-[#173ed7]" /> Pickup</span>
          <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="size-2 rounded-full bg-[#a64e24]" /> Destination</span>
        </span>
        <div className="flex items-center gap-2">
          <button type="button" aria-pressed={panning} onClick={() => setPanning(!panning)} className="min-h-11 text-[#173ed7] underline underline-offset-2 sm:hidden">Pan map</button>
          <button type="button" onClick={() => resetView.current?.()} className="min-h-11 text-[#173ed7] underline underline-offset-2">Fit route</button>
        </div>
      </div>
    </>
  );
}
