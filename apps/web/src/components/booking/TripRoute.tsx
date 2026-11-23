'use client';

import dynamic from 'next/dynamic';
import { useId, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clipboard, ExternalLink, Route } from 'lucide-react';
import { formatDrivingDistance, formatDrivingDuration, getDrivingRoute, retryMapRequest } from '@/lib/maps';
import type { Location } from '@/types';

const DrivingMap = dynamic(() => import('./DrivingMap'), {
  ssr: false,
  loading: () => <div className="h-56 bg-[#e8edf8] sm:h-72" />,
});
const GoogleDrivingMap = dynamic(() => import('./GoogleDrivingMap'), {
  ssr: false,
  loading: () => <div className="h-56 bg-[#e8edf8] sm:h-72" />,
});
const googleRoutingEnabled = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim());
const wideMapViewport = '(min-width: 640px)';

function subscribeToMapViewport(update: () => void) {
  const viewport = window.matchMedia(wideMapViewport);
  viewport.addEventListener('change', update);
  return () => viewport.removeEventListener('change', update);
}

const point = (location: Location) => `${location.lng.toFixed(6)},${location.lat.toFixed(6)}`;

export function TripRoute({ pickup, dropoff, collapsed = false }: { pickup: Location; dropoff: Location; collapsed?: boolean }) {
  const titleId = useId();
  const mapId = useId();
  const [mapChoice, setMapChoice] = useState<boolean>();
  const wide = useSyncExternalStore(subscribeToMapViewport, () => window.matchMedia(wideMapViewport).matches, () => false);
  const canToggleMap = collapsed || !wide;
  const expanded = canToggleMap ? (mapChoice ?? false) : true;
  const [copyStatus, setCopyStatus] = useState<{ report: string; message: string } | null>(null);
  const from = point(pickup);
  const to = point(dropoff);
  const route = useQuery({
    queryKey: ['driving-route', googleRoutingEnabled ? 'google' : 'osrm', from, to],
    queryFn: async ({ signal }) => {
      if (!googleRoutingEnabled) return getDrivingRoute(from, to, signal);
      const { getGoogleDrivingRoute } = await import('@/lib/google-maps');
      return getGoogleDrivingRoute(pickup, dropoff);
    },
    enabled: from !== to,
    staleTime: googleRoutingEnabled ? 0 : 15 * 60_000,
    gcTime: googleRoutingEnabled ? 0 : undefined,
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
  const result = route.data;
  const isGoogle = result?.provider === 'google';
  const Map = isGoogle ? GoogleDrivingMap : DrivingMap;
  const externalLabel = result?.trafficAware ? 'Open in Google Maps' : 'Live traffic in Google Maps';
  const driveDuration = result && (result.durationText || formatDrivingDuration(result.durationSeconds));
  const driveDistance = result && (result.distanceText || formatDrivingDistance(result.distanceMeters));
  const roadAccess = result?.roadAccessMeters;
  const timingSource = isGoogle ? 'Google Maps' : 'FOSSGIS / OSRM';
  const traffic = result?.trafficAware ? 'Live traffic estimate' : 'Traffic excluded';
  const checked = result && new Date(result.calculatedAt);
  const roadAccessNote = roadAccess && [
    roadAccess[0] > 100 && `${formatDrivingDistance(roadAccess[0])} from pickup`,
    roadAccess[1] > 100 && `${formatDrivingDistance(roadAccess[1])} from the destination`,
  ].filter(Boolean).join(' and ');
  const report = result && [
    'RIDE & SEEK | Trip timing report',
    `${pickup.label} → ${dropoff.label}`,
    `${driveDuration} estimated drive · ${driveDistance}`,
    `${timingSource} · ${traffic}`,
    `Route calculated ${result.calculatedAt}`,
    roadAccessNote && `Road access is ${roadAccessNote}.`,
    'Map data © OpenStreetMap contributors',
    'https://www.openstreetmap.org/copyright',
    directions.href,
  ].filter(Boolean).join('\n');

  async function copyReport() {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report);
      setCopyStatus({ report, message: 'Timing report copied.' });
    } catch {
      setCopyStatus({ report, message: 'Clipboard unavailable. You can select the report text to copy it.' });
    }
  }

  return (
    <section aria-labelledby={titleId} className="min-w-0 overflow-hidden rounded-2xl border border-[#d9dbe7] bg-white">
      <div className="grid gap-3 bg-[#f4f6ff] p-3 sm:p-4">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#173ed7] text-white">
            <Route size={17} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 id={titleId} className="text-base font-extrabold text-[#171b37]">Trip timing report</h3>
            <p className="break-words text-xs font-medium text-[#475673] sm:text-sm">{pickup.label} → {dropoff.label}</p>
          </div>
        </div>
        <div aria-live="polite">
          {result && (
            <>
              <dl className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="min-w-0 rounded-xl bg-white px-3 py-2">
                  <dt className="text-xs font-semibold text-[#475673]">Estimated drive</dt>
                  <dd className="text-lg font-black leading-tight text-[#173ed7] sm:text-2xl">{driveDuration}</dd>
                </div>
                <div className="min-w-0 rounded-xl bg-white px-3 py-2">
                  <dt className="text-xs font-semibold text-[#475673]">Road distance</dt>
                  <dd className="text-lg font-black leading-tight text-[#171b37] sm:text-2xl">{driveDistance}</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-[#475673]">
                <span translate={isGoogle ? 'no' : undefined} className="whitespace-nowrap font-normal text-[#5e5e5e]">{timingSource}</span>
                {' · '}{traffic}
                {checked && !Number.isNaN(checked.valueOf()) && (
                  <>{' · Calculated '}<time dateTime={result.calculatedAt}>{checked.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time></>
                )}
              </p>
            </>
          )}
          {route.isPending && <p role="status" className="text-sm text-[#475673]">Calculating drive time…</p>}
          {route.isError && <p role="status" className="text-sm text-[#a42644]">{route.error.message}{' '}
            <button type="button" onClick={() => void route.refetch()} className="font-bold underline">Retry route</button>
          </p>}
        </div>
        <div className="-my-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-bold text-[#173ed7]">
          <a href={directions.href} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 motion-safe:transition-colors hover:bg-white sm:min-h-9">
            {externalLabel} <ExternalLink size={14} aria-hidden="true" />
          </a>
          {canToggleMap && result && (
            <button type="button" aria-controls={mapId} aria-expanded={expanded} onClick={() => setMapChoice(!expanded)} className="min-h-11 rounded-lg px-2 motion-safe:transition-colors hover:bg-white sm:min-h-9">
              {expanded ? 'Hide map' : 'Show map'}
            </button>
          )}
          {result && !isGoogle && (
            <button type="button" onClick={() => void copyReport()} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 motion-safe:transition-colors hover:bg-white sm:min-h-9">
              <Clipboard size={14} aria-hidden="true" /> Copy timing report
            </button>
          )}
          {isGoogle && result.trafficAware && (
            <button type="button" onClick={() => void route.refetch()} disabled={route.isFetching} className="min-h-11 rounded-lg px-2 hover:bg-white disabled:opacity-60 sm:min-h-9">
              {route.isFetching ? 'Updating traffic…' : 'Refresh traffic estimate'}
            </button>
          )}
        </div>
        {copyStatus && copyStatus.report === report && <p role="status" className="text-xs font-semibold text-[#475673]">{copyStatus.message}</p>}
      </div>
      {result && (
        <>
          <div id={mapId} hidden={!expanded}>
            {expanded && <Map coordinates={result.coordinates} pickup={pickup} dropoff={dropoff} />}
          </div>
          {roadAccessNote && (
            <p className="px-3 pt-2 text-xs text-[#475673]">Road access is {roadAccessNote}.</p>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 py-2 text-xs text-[#475673]">
            {isGoogle ? <>
              <a href="https://www.google.com/intl/en_us/help/terms_maps/" target="_blank" rel="noreferrer" className="underline">Google Maps terms</a>
              <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" className="underline">Google privacy policy</a>
            </> : <>
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">© OpenStreetMap contributors</a>
              <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noreferrer" className="underline">Routing by FOSSGIS / OSRM</a>
              <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer" className="underline">Report a map issue</a>
            </>}
          </div>
        </>
      )}
    </section>
  );
}
