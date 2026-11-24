'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LocateFixed } from 'lucide-react';
import { loadGoogleLibrary } from '@/lib/google-maps';
import type { DrivingRoute } from '@/lib/maps';
import { measureRoute, routeScreenHeading, trackingCenter, trackingZoom } from '@/lib/route-path';
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
  driver?: { progress: number; marker: ReactNode; target?: 'destination' };
}) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<MapView | null>(null);
  const [following, setFollowing] = useState(true);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const displayed = useRef<number | null>(null);
  const fitRoute = useRef<(() => void) | null>(null);
  const followFrame = useRef<{ map: google.maps.Map; viewport: typeof viewport; route: ReturnType<typeof measureRoute>; zoom: number } | null>(null);
  const tracking = driver !== undefined;
  const toDestination = driver?.target === 'destination';
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
      const map = new maps.Map(node, {
        gestureHandling: 'cooperative', streetViewControl: false, mapTypeControl: !tracking,
        isFractionalZoomEnabled: tracking ? false : undefined,
      });
      const line = new maps.Polyline({ map, strokeColor: '#173ed7', strokeWeight: 5 });
      const markers = (tracking ? [toDestination ? 'Destination' : 'Pickup'] : ['Pickup', 'Destination']).map((title, index) => new marker.Marker({
        map, title, label: tracking ? toDestination ? 'D' : 'P' : index ? 'B' : 'A',
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
  }, [tracking, toDestination]);

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
    if (!tracking) fit();
    const observer = new ResizeObserver(() => {
      if (tracking) {
        const { clientWidth: width, clientHeight: height } = node;
        setViewport((size) => size.width === width && size.height === height ? size : { width, height });
      } else fit();
    });
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
    const endpoint = track.pointAt(track.length);
    if (!following) followFrame.current = null;
    const place = (distance: number) => {
      displayed.current = distance;
      const point = track.pointAt(distance);
      if (following && viewport.width && viewport.height) {
        const frame = followFrame.current;
        const reframing = !frame || frame.map !== map || frame.viewport !== viewport || frame.route !== track;
        const zoom = reframing ? trackingZoom(track.remainingPoints(distance), endpoint, viewport, toDestination) : frame.zoom;
        const [lng, lat] = trackingCenter(point, endpoint, track.pointAt(distance + 120), viewport, toDestination, zoom);
        // Leave zoom out of movement updates so Google can pan the same tile layer.
        map.moveCamera(reframing ? { center: { lat, lng }, zoom } : { center: { lat, lng } });
        if (reframing) followFrame.current = { map, viewport, route: track, zoom };
      }
      const heading = routeScreenHeading(track.pointAt(distance - 12), track.pointAt(distance + 12));
      cab.place({ lng: point[0], lat: point[1] }, heading);
    };
    if (start === target || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      place(target);
      return;
    }
    const startedAt = performance.now();
    const duration = toDestination ? 1_000 : 900;
    let frame: number;
    function animate(now: number) {
      const elapsed = Math.min(1, (now - startedAt) / duration);
      const step = toDestination ? elapsed : elapsed * elapsed * (3 - 2 * elapsed);
      place(start + (target - start) * step);
      if (elapsed < 1) frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [view, track, progress, following, viewport, toDestination]);

  return failed
    ? <p role="status" className="px-3 py-2 text-sm text-[#475673]">The map could not load. Reload the page to try again.</p>
    : <div className="relative isolate">
      <div ref={container} role="region" aria-label={tracking ? toDestination ? 'Google Maps destination route' : 'Google Maps pickup route' : 'Driving route map'} className="isolate z-0 h-[clamp(20rem,50svh,27rem)] w-full bg-[#e8edf8] sm:h-80" />
      {view?.cab && (
        <div className="absolute left-2 top-2 z-10 flex gap-1 text-xs font-bold text-[#173a9c]">
          <button type="button" aria-pressed={following} onClick={() => setFollowing(!following)}
            className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-[#c7d1ee] bg-white px-2 shadow-sm aria-pressed:border-[#173ed7] aria-pressed:bg-[#edf1ff]">
            <LocateFixed size={15} aria-hidden="true" /> Follow driver
          </button>
          <button type="button" onClick={() => { setFollowing(false); fitRoute.current?.(); }}
            className="min-h-11 rounded-xl border border-[#c7d1ee] bg-white px-2 shadow-sm">Full route</button>
        </div>
      )}
      {view?.cab && driver && createPortal(driver.marker, view.cab.node)}
    </div>;
}
