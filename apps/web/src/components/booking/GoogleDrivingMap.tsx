'use client';

import { useEffect, useRef, useState } from 'react';
import { loadGoogleLibrary } from '@/lib/google-maps';
import type { DrivingRoute } from '@/lib/maps';
import type { Location } from '@/types';

type MapView = {
  map: google.maps.Map;
  line: google.maps.Polyline;
  markers: google.maps.Marker[];
  LatLngBounds: typeof google.maps.LatLngBounds;
};

export default function GoogleDrivingMap({ coordinates, pickup, dropoff }: Pick<DrivingRoute, 'coordinates'> & {
  pickup: Location;
  dropoff: Location;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<MapView | null>(null);
  const { lat: pickupLat, lng: pickupLng } = pickup;
  const { lat: dropoffLat, lng: dropoffLng } = dropoff;

  useEffect(() => {
    let disposed = false;
    const node = container.current;
    let loaded: MapView | undefined;

    async function draw() {
      const [maps, core, marker] = await Promise.all([
        loadGoogleLibrary('maps'), loadGoogleLibrary('core'), loadGoogleLibrary('marker'),
      ]) as [google.maps.MapsLibrary, google.maps.CoreLibrary, google.maps.MarkerLibrary];
      if (!node || disposed) return;
      const map = new maps.Map(node, { gestureHandling: 'cooperative', streetViewControl: false });
      const line = new maps.Polyline({ map, strokeColor: '#173ed7', strokeWeight: 5 });
      const markers = ['Pickup', 'Destination'].map((title, index) => new marker.Marker({
        map, title, label: index ? 'B' : 'A',
      }));
      loaded = { map, line, markers, LatLngBounds: core.LatLngBounds };
      setView(loaded);
    }

    void draw().catch(() => { if (!disposed) setFailed(true); });
    return () => {
      disposed = true;
      loaded?.line.setMap(null);
      loaded?.markers.forEach((marker) => marker.setMap(null));
      node?.replaceChildren();
    };
  }, []);

  useEffect(() => {
    const node = container.current;
    if (!view || !node) return;
    const path = coordinates.map(([lng, lat]) => ({ lat, lng }));
    const points = [{ lat: pickupLat, lng: pickupLng }, { lat: dropoffLat, lng: dropoffLng }];
    const bounds = new view.LatLngBounds();
    [...path, ...points].forEach((point) => bounds.extend(point));
    view.line.setPath(path);
    view.markers.forEach((marker, index) => marker.setPosition(points[index]));
    const fit = () => {
      if (node.clientWidth && node.clientHeight) view.map.fitBounds(bounds, 32);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    return () => observer.disconnect();
  }, [view, coordinates, pickupLat, pickupLng, dropoffLat, dropoffLng]);

  return failed
    ? <p role="status" className="px-3 py-2 text-sm text-[#475673]">The map could not load. Reload the page to try again.</p>
    : <div ref={container} role="region" aria-label="Driving route map" className="isolate z-0 h-[clamp(20rem,50svh,27rem)] w-full bg-[#e8edf8] sm:h-80" />;
}
