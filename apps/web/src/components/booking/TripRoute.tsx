'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Route } from 'lucide-react';
import { getDrivingRoute, retryMapRequest } from '@/lib/maps';
import type { Location } from '@/types';

const DrivingMap = dynamic(() => import('./DrivingMap'), {
  ssr: false,
  loading: () => <div className="h-56 bg-[#e8edf8] sm:h-72" />,
});

const point = (location: Location) => `${location.lng.toFixed(6)},${location.lat.toFixed(6)}`;

export function TripRoute({ pickup, dropoff, collapsed = false }: { pickup: Location; dropoff: Location; collapsed?: boolean }) {
  const [expanded, setExpanded] = useState(!collapsed);
  const from = point(pickup);
  const to = point(dropoff);
  const route = useQuery({
    queryKey: ['driving-route', from, to],
    queryFn: ({ signal }) => getDrivingRoute(from, to, signal),
    enabled: from !== to,
    staleTime: 15 * 60_000,
    retry: retryMapRequest,
  });
  if (from === to) return null;

  const directions = new URL('https://www.google.com/maps/dir/');
  directions.search = new URLSearchParams({
    api: '1',
    origin: `${pickup.lat},${pickup.lng}`,
    destination: `${dropoff.lat},${dropoff.lng}`,
    travelmode: 'driving',
  }).toString();

  return (
    <div className="overflow-hidden rounded-2xl border border-[#d9dbe7] bg-white" aria-label="Trip drive estimate">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 sm:px-4">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#edf1ff] text-[#173ed7]">
            <Route size={17} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="font-extrabold text-[#171b37]">Driving route</p>
            {route.data && <p className="text-sm text-[#475673]">
              <strong className="text-[#173ed7]">{Math.max(1, Math.ceil(route.data.durationSeconds / 60))} min drive</strong>
              {' · '}{(route.data.distanceMeters / 1000).toFixed(1)} km · Traffic excluded
            </p>}
            {route.isPending && <p role="status" className="text-sm text-[#475673]">Calculating drive time…</p>}
            {route.isError && <p role="status" className="text-sm text-[#a42644]">{route.error.message}{' '}
              <button type="button" onClick={() => void route.refetch()} className="font-bold underline">Retry route</button>
            </p>}
          </div>
        </div>
        {collapsed && route.data ? (
          <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="min-h-9 rounded-lg px-2 text-sm font-bold text-[#173ed7] hover:bg-[#edf1ff]">
            {expanded ? 'Hide map' : 'Show map'}
          </button>
        ) : (
          <a href={directions.href} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-bold text-[#173ed7] hover:bg-[#edf1ff]">
            Open in Google Maps <ExternalLink size={14} aria-hidden="true" />
          </a>
        )}
      </div>
      {route.data && (
        <>
          {expanded && <DrivingMap coordinates={route.data.coordinates} pickup={pickup} dropoff={dropoff} />}
          <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 py-2 text-xs text-[#475673]">
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">© OpenStreetMap contributors</a>
            <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noreferrer" className="underline">Routing by FOSSGIS / OSRM</a>
            <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer" className="underline">Report a map issue</a>
            {collapsed && expanded && <a href={directions.href} target="_blank" rel="noreferrer" className="font-bold text-[#173ed7] underline">Open in Google Maps</a>}
          </div>
        </>
      )}
    </div>
  );
}
