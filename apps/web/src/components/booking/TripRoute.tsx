'use client';

import dynamic from 'next/dynamic';
import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clipboard, Route } from 'lucide-react';
import { formatDrivingDistance, formatDrivingDuration, getDrivingRoute, retryMapRequest } from '@/lib/maps';
import type { Location } from '@/types';

const DrivingMap = dynamic(() => import('./DrivingMap'), {
  ssr: false,
  loading: () => <div className="h-56 bg-[#e8edf8] sm:h-72" />,
});
const GoogleDrivingMap = dynamic(() => import('./GoogleDrivingMap'), {
  ssr: false,
  loading: () => <div className="h-[clamp(20rem,50svh,27rem)] bg-[#e8edf8] sm:h-80" />,
});
const googleRoutingEnabled = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim());

const point = (location: Location) => `${location.lng.toFixed(6)},${location.lat.toFixed(6)}`;

export function useDrivingRoute(from: string, to: string, source?: 'google-map' | 'osm', enabled = true) {
  const googleView = source !== 'osm';
  return useQuery({
    queryKey: ['driving-route', source ?? 'google', from, to],
    queryFn: ({ signal }) => getDrivingRoute(from, to, signal, source),
    enabled: enabled && from !== to,
    staleTime: googleView ? 0 : 15 * 60_000,
    gcTime: googleView ? 0 : 15 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: retryMapRequest,
    retryDelay: 1100,
  });
}

export function TripRoute({ pickup, dropoff, hideGoogleMap = false }: { pickup: Location; dropoff: Location; hideGoogleMap?: boolean }) {
  const titleId = useId();
  const [showTraffic, setShowTraffic] = useState(false);
  const [copyStatus, setCopyStatus] = useState<{ report: string; message: string } | null>(null);
  const from = point(pickup);
  const to = point(dropoff);
  const source = googleRoutingEnabled ? 'google-map' : showTraffic ? undefined : 'osm';
  const route = useDrivingRoute(from, to, source);
  if (from === to) return null;

  const trafficUnavailable = showTraffic && route.data && route.data.provider !== 'google';
  const result = trafficUnavailable ? undefined : route.data;
  const isGoogle = result?.provider === 'google';
  const hasInlineMap = (result?.coordinates.length ?? 0) >= 2;
  const Map = isGoogle ? GoogleDrivingMap : DrivingMap;
  const driveDuration = result && formatDrivingDuration(result.durationSeconds);
  const driveDistance = result && formatDrivingDistance(result.distanceMeters);
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
      <div className="grid gap-3 bg-[#f4f6ff] p-3 max-sm:gap-2.5 sm:p-4">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#173ed7] text-white">
            <Route size={17} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 id={titleId} className="text-base font-extrabold text-[#171b37]">Trip timing report</h3>
            <p className="break-words text-xs font-medium text-[#475673] sm:text-sm">{pickup.label} → {dropoff.label}</p>
          </div>
        </div>
        {!googleRoutingEnabled && (
          <div aria-label="Route view" role="group" className="grid grid-cols-2 gap-1 rounded-xl bg-[#e4eaff] p-1">
            <button type="button" onClick={() => setShowTraffic(false)} aria-pressed={!showTraffic} className="min-h-11 rounded-lg px-2 text-xs font-bold text-[#475673] aria-pressed:bg-white aria-pressed:text-[#173ed7] sm:text-sm">Route map</button>
            <button type="button" onClick={() => setShowTraffic(true)} aria-pressed={showTraffic} className="min-h-11 rounded-lg px-2 text-xs font-bold text-[#475673] aria-pressed:bg-white aria-pressed:text-[#173ed7] sm:text-sm">Google traffic estimate</button>
          </div>
        )}
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
          {trafficUnavailable && <p role="status" className="text-sm text-[#475673]">Google traffic is unavailable. The route map still has a driving estimate.</p>}
          {route.isError && <p role="status" className="text-sm text-[#a42644]">{route.error.message}{' '}
            <button type="button" onClick={() => void route.refetch()} className="font-bold underline">Retry route</button>
          </p>}
        </div>
      </div>
      {result && (
        <>
          {hasInlineMap && (!isGoogle || !hideGoogleMap) && <Map coordinates={result.coordinates} pickup={pickup} dropoff={dropoff} />}
          {(!isGoogle || result.trafficAware) && (
            <div className="flex flex-wrap items-center gap-x-2 border-t border-[#d9dbe7] bg-[#f4f6ff] px-3 text-xs font-bold text-[#173ed7] sm:px-4">
              {!isGoogle && (
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
          )}
          {copyStatus && copyStatus.report === report && <p role="status" className="px-3 pt-2 text-xs font-semibold text-[#475673]">{copyStatus.message}</p>}
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
