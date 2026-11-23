'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api/client';
import { providerName, type Event, type Journey } from '@/types';
import { useJourneyEvents, type Connection } from '@/hooks/useJourneyEvents';
import RouteCanvas from './RouteCanvas';
import { TripRoute } from '@/components/booking/TripRoute';
import SwitchReview from './SwitchReview';
import styles from './journey.module.css';

const finished = new Set(['PICKUP_CONFIRMED', 'EXHAUSTED', 'USER_CANCELLED']);
const journeyLabels: Record<string, string> = {
  WAITING_FOR_RIDE: 'Waiting for booking',
  MONITORING: 'Monitoring pickup',
  AWAITING_APPROVAL: 'Approval needed',
  RECOVERING: 'Finding a replacement',
  RECONCILING: 'Verifying provider status',
  PICKUP_CONFIRMED: 'Pickup confirmed',
  EXHAUSTED: 'Recovery ended',
  USER_CANCELLED: 'Journey stopped',
};
const rideLabels: Record<string, string> = {
  CONFIRMED: 'Booking accepted',
  DRIVER_EN_ROUTE: 'Driver approaching',
  DRIVER_ARRIVED: 'Driver arrived',
  IN_PROGRESS: 'Passenger boarded',
};
const connectionLabels: Record<Connection, string> = {
  connecting: 'Connecting to live updates',
  live: 'Live updates',
  replaying: 'Reconnecting · checking for updates',
  offline: 'Updates interrupted · reconnecting',
};
const eventLabels: Record<string, string> = {
  RIDE_CONFIRMED: 'Provider confirmed booking',
  DRIVER_CANCELLED: 'Driver cancelled the ride',
  DRIVER_ARRIVED: 'Driver arrived at pickup',
  PICKUP_CONFIRMED: 'Passenger confirmed boarding',
  BACKUP_FOUND: 'Backup quote found',
  QUOTE_REFRESHED: 'Backup quote rechecked',
  QUOTE_REFRESH_FAILED: 'Backup unavailable on recheck',
  APPROVAL_REQUIRED: 'Rider approval required',
  SWITCH_APPROVED: 'Rider approved switch',
  SWITCH_REJECTED: 'Rider declined recovery',
  RIDE_CANCEL_REQUESTED: 'Original cancellation requested',
  RIDE_CANCEL_CONFIRMED: 'Original cancellation confirmed',
  RECOVERY_SUCCEEDED: 'Replacement booking confirmed',
  REPLACEMENT_QUOTE_LOST: 'Replacement unavailable after cancellation',
  DRIVER_MESSAGE_CLASSIFIED: 'Driver message classified',
};
const recoveryEvents = new Set([
  'APPROVAL_REQUIRED', 'QUOTE_REFRESH_FAILED', 'RECOVERY_SUCCEEDED', 'REPLACEMENT_QUOTE_LOST',
  'RECOVERY_EXHAUSTED', 'RECOVERY_BLOCKED', 'SWITCH_REJECTED',
]);
const backgroundEvents = new Set(['TELEMETRY_UPDATED', 'RISK_UPDATED', 'DEADLINE_DECISION']);
const readable = (value: string) => value.replaceAll('_', ' ').toLowerCase();
const clockTime = (value: string) => new Date(value).toLocaleTimeString('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: 'UTC',
});
const minutes = (seconds: number) => Math.ceil(seconds / 60);

function recoveryStatus(journey: Journey, event?: Event): string | null {
  if (journey.state === 'PICKUP_CONFIRMED') return 'Passenger boarded. Recovery has stopped.';
  if (journey.state === 'USER_CANCELLED') return 'Journey stopped. No further recovery actions will run.';
  if (journey.booking_uncertain) {
    return 'Booking status is unknown. Another booking is blocked until the provider status is verified.';
  }
  if (journey.state === 'RECONCILING') {
    return 'Original cancellation status is unknown. A replacement is blocked until cancellation is verified.';
  }
  if (journey.state === 'EXHAUSTED') {
    if (event?.type === 'REPLACEMENT_QUOTE_LOST') {
      return 'The original cancellation was confirmed, then the replacement quote became unavailable. You have no confirmed ride.';
    }
    if (event?.type === 'SWITCH_REJECTED') return 'You declined the backup. You have no confirmed ride.';
    if (event?.payload.original_cancellation_confirmed === true) {
      return 'The original cancellation was confirmed. The replacement booking failed, so you have no confirmed ride.';
    }
    return 'Recovery ended. You have no confirmed ride.';
  }
  if (event?.type === 'QUOTE_REFRESH_FAILED') {
    return journey.active_ride
      ? 'The backup became unavailable on recheck. Your original ride remains active.'
      : 'The backup became unavailable on recheck.';
  }
  if (event?.type === 'RECOVERY_BLOCKED' && event.payload.reason === 'CANCELLATION_FEE_LIMIT') {
    return 'The possible cancellation fee is above your limit. Your original ride remains active.';
  }
  if (event?.type === 'RECOVERY_SUCCEEDED' && journey.active_ride?.ride_id === event.ride_id) {
    return `Replacement confirmed with ${providerName[journey.active_ride.provider]}. Tracking now follows this ride.`;
  }
  return null;
}

export default function JourneyPanel({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const queryKey = ['journey', id];
  const stream = useJourneyEvents(id, queryClient.getQueryData(queryKey) != null);
  const query = useQuery({
    queryKey,
    queryFn: () => api.journey(id),
    refetchInterval: stream.connection === 'live' ? false : 5000,
  });
  const data = query.data;
  const [reviewed, setReviewed] = useState<Journey | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [reviewCancel, setReviewCancel] = useState(false);
  const inFlight = useRef(false);
  const recoveryHeading = useRef<HTMLHeadingElement>(null);

  async function act(label: string, send: () => Promise<Journey>) {
    if (inFlight.current || query.isError) return;
    inFlight.current = true;
    setAction(label);
    setError('');
    try {
      const updated = await send();
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<Journey>(queryKey, (current) =>
        current && current.version > updated.version ? current : updated);
    } catch (failure) {
      // A lost response may have followed a committed action. Read status without replaying the action.
      const result = await query.refetch();
      const detail = failure instanceof Error ? failure.message : 'Request failed.';
      if (failure instanceof ApiError && failure.code === 'STALE_JOURNEY_VERSION') {
        setError('The journey changed. Review the latest ride details before taking an action.');
      } else if (result.isError) {
        setError(`${detail} RIDE & SEEK could not verify the current journey status. Refresh status before taking another action.`);
      } else if (failure instanceof ApiError && (
        ['NETWORK_ERROR', 'TIMEOUT', 'PARSE_ERROR'].includes(failure.code) || failure.code.startsWith('HTTP_5')
      )) {
        setError('The action response was interrupted. The latest verified status is shown below.');
      } else {
        setError(detail);
      }
    } finally {
      inFlight.current = false;
      setAction(null);
    }
  }

  if (!data) {
    return (
      <section className="panel stack">
        <h1>Your pickup</h1>
        {query.error ? (
          <>
            <p role="alert">{query.error.message}</p>
            <div className="button-row">
              <button className="btn secondary" onClick={() => void query.refetch()} disabled={query.isFetching}>Retry connection</button>
              <Link className="btn ghost" href="/trips">Your rides</Link>
            </div>
          </>
        ) : <p role="status">Loading your ride…</p>}
      </section>
    );
  }

  const ride = data.active_ride;
  const risk = data.risk;
  const done = finished.has(data.state);
  const reconciling = data.state === 'RECONCILING' || data.booking_uncertain;
  const canBook = data.state === 'WAITING_FOR_RIDE' && !reconciling;
  const canAct = !action && !query.isError && !done && !reconciling;
  const canApprove = canAct && data.state === 'AWAITING_APPROVAL' && data.pending_backup !== null;
  const canBoard = canAct && ride?.state === 'DRIVER_ARRIVED';
  const remainingSeconds = (Date.parse(data.need_by) - Date.parse(data.simulated_time)) / 1000;
  const late = Boolean(ride && ride.state === 'DRIVER_EN_ROUTE' && ride.eta_sec > remainingSeconds);
  const backup = data.state === 'AWAITING_APPROVAL' && !reconciling ? data.pending_backup : null;
  const bookedQuote = ride ? data.quotes.find((quote) => quote.quote_id === ride.quote_id) : undefined;
  const latestRecovery = stream.events.findLast((event) => recoveryEvents.has(event.type));
  const status = recoveryStatus(data, latestRecovery);
  const timeline = stream.events.filter((event) => !backgroundEvents.has(event.type));

  return (
    <>
      {reviewed && (
        <SwitchReview
          reviewed={reviewed}
          current={data}
          available={canApprove}
          onClose={() => setReviewed(null)}
          onApprove={() => {
            if (!canApprove) return;
            setReviewed(null);
            requestAnimationFrame(() => recoveryHeading.current?.focus());
            void act('Checking backup and provider status…', () => api.approve(id, true, reviewed.version));
          }}
        />
      )}
      <header className={styles.heading}>
        <div>
          <Link href="/trips" className="text-sm font-bold text-[#173ed7]">← Your rides</Link>
          <h1 className="mt-3">{data.state === 'PICKUP_CONFIRMED' ? 'You’re on your way' : 'Your pickup'}</h1>
          <p className="lead">{data.pickup.label} → {data.dropoff.label}</p>
        </div>
        <span className="badge">{journeyLabels[data.state] ?? readable(data.state)}</span>
      </header>
      {query.isError && (
        <div className={`error ${styles.notice}`} role="alert">
          <p>The latest status is unavailable. Showing the last verified snapshot.</p>
          <button className="btn secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh status</button>
        </div>
      )}
      <div className={styles.columns}>
        <div className="stack">
          <section className={`panel stack ${styles.card}`} aria-labelledby="progress-title">
            <div className={styles.cardHeading}>
              <h2 id="progress-title">Pickup status</h2>
              {ride && <span className="badge">{rideLabels[ride.state] ?? readable(ride.state)}</span>}
            </div>
            <RouteCanvas ride={ride} uncertain={risk?.band === 'UNKNOWN' || reconciling || query.isError} />
            {ride && <div className={styles.driver}>
              <strong>{providerName[ride.provider]}</strong>
              <span className="muted">Driver {ride.driver_id}</span>
            </div>}
            <dl className={styles.stats}>
              <div className="stat"><dt>Driver to pickup</dt><dd>{
                ride?.state === 'DRIVER_ARRIVED' ? 'At pickup' :
                ride?.state === 'IN_PROGRESS' ? 'Boarded' :
                ride?.state === 'DRIVER_EN_ROUTE' || ride?.state === 'CONFIRMED' ? `${minutes(ride.eta_sec)} min` : '—'
              }</dd></div>
              <div className="stat"><dt>Distance to pickup</dt><dd>{ride ? `${(ride.distance_to_pickup_m / 1000).toFixed(1)} km` : '—'}</dd></div>
              <div className="stat"><dt>Recovery attempts</dt><dd>{data.recovery_attempts}/{data.policy.max_recovery_attempts}</dd></div>
            </dl>
            <p className="helper">Driver position and pickup time are simulated.</p>
            {late && !done && !reconciling && <p className={styles.warning}>
              {risk?.band === 'UNKNOWN' ? 'The last reported pickup estimate' : 'The current pickup estimate'} is past your deadline.
            </p>}
            {canBook && <div className="button-row"><Link href={`/compare?journey=${encodeURIComponent(id)}`} className="btn">Compare rides</Link></div>}
            {ride?.state === 'DRIVER_ARRIVED' && !done && <div className="button-row">
              <button className="btn" disabled={!canBoard} onClick={() => void act('Confirming boarding…', () => api.confirmPickup(id, data.version))}>Confirm boarding</button>
            </div>}
          </section>

          <section className={`panel stack ${styles.card}`} aria-labelledby="recovery-title">
            <div className={styles.cardHeading}>
              <h2 ref={recoveryHeading} id="recovery-title" tabIndex={-1}>Pickup protection</h2>
              {risk && !done && !reconciling && <span className={`badge ${risk.band === 'HIGH' ? 'high' : risk.band === 'LOW' ? 'low' : ''}`}>{readable(risk.band)} risk</span>}
            </div>
            {status && <div className={done || reconciling ? 'inline-note' : styles.recoveryNotice} role="status">{status}</div>}
            {risk && risk.band !== 'LOW' && !done && !reconciling && (
              <div className="inline-note">
                <strong>{risk.band === 'UNKNOWN' ? 'Pickup risk is uncertain' : `Pickup risk ${risk.score_0_100}/100`}</strong>
                <p>{risk.explanation}</p>
              </div>
            )}
            {(!risk || risk.band === 'LOW') && !status && <p className="muted">{ride ? 'Watching for pickup delays and driver cancellations.' : 'Pickup monitoring begins when a provider confirms a ride.'}</p>}
            {backup && (
              <div className={`stack ${styles.backup}`}>
                {ride && <p className="helper">Your current ride stays active until you approve a switch and the provider confirms cancellation.</p>}
                <dl className={styles.options}>
                  {ride && <div>
                    <dt>Current · {providerName[ride.provider]}</dt>
                    <dd>{bookedQuote && `₹${bookedQuote.estimated_fare_inr} estimated · `}{minutes(ride.eta_sec)} min to pickup</dd>
                  </div>}
                  <div>
                    <dt>Backup · {providerName[backup.provider]}</dt>
                    <dd>₹{backup.estimated_fare_inr} estimated · {minutes(backup.pickup_eta_sec)} min to pickup</dd>
                  </div>
                </dl>
                {ride && data.cancellation_fee_notice && <p className={styles.warning}>Possible fee if you switch · Up to ₹{data.cancellation_fee_notice.potential_fee_upper_bound_inr}</p>}
                <p className="helper">This quote is subject to a fresh provider check. It does not hold a ride.</p>
                <div className="button-row">
                  <button className="btn" disabled={!canApprove} onClick={() => setReviewed(data)}>{ride ? 'Review switch & fee' : 'Review replacement'}</button>
                  <button className="btn ghost" disabled={!canApprove} onClick={() => void act('Recording your choice…', () => api.approve(id, false, data.version))}>{ride ? 'Keep waiting' : 'Decline backup'}</button>
                </div>
              </div>
            )}
            {action && <p role="status" className="helper">{action}</p>}
            {error && <p role="alert" className="error">{error}</p>}
          </section>

          {canAct && (
            <section aria-label="Manage ride" className="rounded-2xl border border-[#d9dce9] bg-[#fffdf8] p-4">
              {reviewCancel ? <>
                <p className="mb-3 text-sm font-bold">Cancel this ride?</p>
                <div className="button-row">
                  <button type="button" className="btn danger" onClick={() => {
                    setReviewCancel(false);
                    void act('Cancelling your ride…', () => api.cancel(id, data.version));
                  }}>Confirm cancellation</button>
                  <button type="button" className="btn ghost" onClick={() => setReviewCancel(false)}>Keep ride</button>
                </div>
              </> : <button type="button" className="btn ghost" onClick={() => setReviewCancel(true)}>Cancel ride</button>}
            </section>
          )}

          <TripRoute pickup={data.pickup} dropoff={data.dropoff} />
        </div>

        <aside className={`panel stack ${styles.card} ${styles.timelinePanel}`}>
          <div className={styles.cardHeading}>
            <h2>Ride activity</h2>
          </div>
          <p role="status" className={`helper ${styles.connection}`} data-live={stream.connection === 'live'}>{connectionLabels[stream.connection]}</p>
          {timeline.length ? (
            <ol className={styles.timeline} aria-label="Journey events, newest first">
              {timeline.slice().reverse().map((event) => (
                <li key={event.seq}>
                  <time dateTime={event.timestamp}>{clockTime(event.timestamp)}</time>
                  <span>{eventLabels[event.type] ?? readable(event.type)}</span>
                </li>
              ))}
            </ol>
          ) : <p className="muted">Journey updates will appear here.</p>}
        </aside>
      </div>
    </>
  );
}
