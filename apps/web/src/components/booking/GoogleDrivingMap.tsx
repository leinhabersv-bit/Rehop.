'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LocateFixed } from 'lucide-react';
import { loadGoogleLibrary } from '@/lib/google-maps';
import type { DrivingRoute } from '@/lib/maps';
import { interpolateRoutePoint, measureRoute, routeScreenHeading } from '@/lib/route-path';
import type { Location } from '@/types';

type MapView = {
  map: google.maps.Map;
  line: google.maps.Polyline;
  markers: google.maps.Marker[];
  LatLngBounds: typeof google.maps.LatLngBounds;
  cab?: { node: HTMLDivElement; place: (point: google.maps.LatLngLiteral, heading: number) => void; remove: () => void };
};

export default function GoogleDrivingMap({ coordinates, pickup, dropoff, driver }: Pick<DrivingRoute, 'coordinates'> & {
  pickup: Location;
  dropoff: Location;
  driver?: { progress: number; marker: ReactNode };
}) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<MapView | null>(null);
  const [following, setFollowing] = useState(true);
  const displayed = useRef<number | null>(null);
  const fitRoute = useRef<(() => void) | null>(null);
  const tracking = driver !== undefined;
  const progress = driver?.progress;
  const track = useMemo(() => tracking ? measureRoute(coordinates) : null, [tracking, coordinates]);
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
      const map = new maps.Map(node, { gestureHandling: 'cooperative', streetViewControl: false, mapTypeControl: !tracking });
      const line = new maps.Polyline({ map, strokeColor: '#173ed7', strokeWeight: 5 });
      const markers = (tracking ? ['Pickup'] : ['Pickup', 'Destination']).map((title, index) => new marker.Marker({
        map, title, label: tracking ? 'P' : index ? 'B' : 'A',
      }));
      let cab: MapView['cab'];
      if (tracking) {
        const overlay = new maps.OverlayView();
        const cabNode = document.createElement('div');
        cabNode.style.cssText = 'position:absolute;pointer-events:none;width:0;height:0';
        let position: google.maps.LatLngLiteral | undefined;
        let heading = 0;
        overlay.onAdd = () => { overlay.getPanes()?.markerLayer.append(cabNode); };
        overlay.draw = () => {
          const pixel = position && overlay.getProjection()?.fromLatLngToDivPixel(position);
          if (pixel) cabNode.style.transform = `translate(${pixel.x}px, ${pixel.y}px) rotate(${heading}deg)`;
        };
        overlay.onRemove = () => cabNode.remove();
        overlay.setMap(map);
        cab = {
          node: cabNode,
          place: (point, angle) => { position = point; heading = angle; overlay.draw(); },
          remove: () => overlay.setMap(null),
        };
      }
      loaded = { map, line, markers, LatLngBounds: core.LatLngBounds, cab };
      setView(loaded);
    }

    void draw().catch(() => { if (!disposed) setFailed(true); });
    return () => {
      disposed = true;
      loaded?.cab?.remove();
      loaded?.line.setMap(null);
      loaded?.markers.forEach((marker) => marker.setMap(null));
      node?.replaceChildren();
    };
  }, [tracking]);

  useEffect(() => {
    const node = container.current;
    if (!view || !node) return;
    const path = coordinates.map(([lng, lat]) => ({ lat, lng }));
    const points = tracking ? [path[path.length - 1]] : [{ lat: pickupLat, lng: pickupLng }, { lat: dropoffLat, lng: dropoffLng }];
    const bounds = new view.LatLngBounds();
    [...path, ...points].forEach((point) => bounds.extend(point));
    view.line.setPath(path);
    view.markers.forEach((marker, index) => marker.setPosition(points[index]));
    const fit = () => {
      if (node.clientWidth && node.clientHeight) view.map.fitBounds(bounds, tracking ? 56 : 32);
    };
    fitRoute.current = fit;
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    return () => {
      observer.disconnect();
      fitRoute.current = null;
    };
  }, [view, coordinates, pickupLat, pickupLng, dropoffLat, dropoffLng, tracking]);

  useEffect(() => {
    const node = container.current;
    if (!view?.cab || !node) return;
    const drag = view.map.addListener('dragstart', () => setFollowing(false));
    const pinch = (event: TouchEvent) => { if (event.touches.length > 1) setFollowing(false); };
    node.addEventListener('touchstart', pinch, { passive: true });
    return () => {
      drag.remove();
      node.removeEventListener('touchstart', pinch);
    };
  }, [view]);

  useEffect(() => {
    if (!view?.cab || !track || progress === undefined) return;
    const { cab, map } = view;
    const target = track.length * progress;
    const start = displayed.current ?? target;
    const pickupPoint = track.pointAt(track.length);
    const cameraStart = following && window.matchMedia('(max-width: 639px)').matches ? map.getCenter()?.toJSON() : undefined;
    const place = (distance: number, cameraProgress = 0) => {
      displayed.current = distance;
      const point = track.pointAt(distance);
      const heading = routeScreenHeading(track.pointAt(distance - 12), track.pointAt(distance + 12));
      cab.place({ lng: point[0], lat: point[1] }, heading);
      if (cameraStart && cameraProgress) {
        // Keep the cab and the pickup together at the zoom that fit the whole route.
        const center = interpolateRoutePoint(point, pickupPoint, 0.5);
        const [lng, lat] = interpolateRoutePoint([cameraStart.lng, cameraStart.lat], center, cameraProgress);
        map.moveCamera({ center: { lat, lng } });
      }
    };
    if (start === target) {
      place(target);
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      place(target, 1);
      return;
    }
    const startedAt = performance.now();
    let frame: number;
    function animate(now: number) {
      const elapsed = Math.min(1, (now - startedAt) / 750);
      const eased = elapsed * elapsed * (3 - 2 * elapsed);
      place(start + (target - start) * eased, eased);
      if (elapsed < 1) frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [view, track, progress, following]);

  return failed
    ? <p role="status" className="px-3 py-2 text-sm text-[#475673]">The map could not load. Reload the page to try again.</p>
    : <div className="relative isolate">
      <div ref={container} role="region" aria-label={tracking ? 'Google Maps pickup route' : 'Driving route map'} className="isolate z-0 h-[clamp(20rem,50svh,27rem)] w-full bg-[#e8edf8] sm:h-80" />
      {view?.cab && (
        <button type="button" aria-pressed={following} onClick={() => {
          if (!following) fitRoute.current?.();
          setFollowing(!following);
        }} className="absolute left-2 top-2 z-10 inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[#c7d1ee] bg-white px-3 text-xs font-bold text-[#173a9c] shadow-sm aria-pressed:border-[#173ed7] aria-pressed:bg-[#edf1ff] sm:hidden">
          <LocateFixed size={16} aria-hidden="true" /> Follow driver
        </button>
      )}
      {view?.cab && driver && createPortal(driver.marker, view.cab.node)}
    </div>;
}
