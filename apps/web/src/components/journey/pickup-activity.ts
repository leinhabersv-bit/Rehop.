import { providerName, type Event, type Provider, type Ride } from '@/types';

const riderEvents: Record<string, string> = {
  DRIVER_CANCELLED: 'Your driver cancelled',
  DRIVER_ARRIVED: 'Your driver arrived at pickup',
  PICKUP_CONFIRMED: 'You confirmed pickup',
  USER_CANCELLED: 'You cancelled the ride',
  APPROVAL_REQUIRED: 'Your approval is needed to switch rides',
  SWITCH_REJECTED: 'You declined the backup ride',
  REPLACEMENT_QUOTE_LOST: 'The backup ride became unavailable',
  QUOTE_REFRESH_FAILED: 'The backup ride became unavailable',
  RECOVERY_EXHAUSTED: 'No replacement ride available',
};

function providerLabel(value: unknown) {
  return typeof value === 'string' && Object.hasOwn(providerName, value)
    ? providerName[value as Provider] : null;
}

export function pickupActivity(events: Event[], ride?: Ride | null) {
  const startedAt = Date.parse(events.find(event => event.type === 'RIDE_CONFIRMED')?.timestamp ?? '');
  const timeline: { seq: number; elapsed: string; label: string }[] = [];
  let currentRide: string | null = null;
  let initialDistance = 0;
  let lastDistance: number | null = null;
  let lastMove: number | null = null;
  let stalled = false;

  for (const event of events) {
    const timestamp = Date.parse(event.timestamp);
    let label = riderEvents[event.type];
    if (event.type === 'RIDE_CONFIRMED') {
      const confirmed = event.payload.ride as Partial<Ride> | undefined;
      const provider = providerLabel(confirmed?.provider);
      label = `${event.payload.replacement ? 'Replacement booked' : 'Ride booked'}${provider ? ` with ${provider}` : ''}`;
      currentRide = event.ride_id;
      initialDistance = confirmed?.distance_to_pickup_m ?? 0;
      lastDistance = confirmed?.distance_to_pickup_m ?? null;
      lastMove = timestamp;
      stalled = false;
    } else if (event.type === 'BACKUP_FOUND') {
      const candidate = event.payload.candidate as { provider?: Provider; pickup_eta_sec?: number } | undefined;
      const provider = providerLabel(candidate?.provider);
      const eta = candidate?.pickup_eta_sec;
      label = `Backup found${provider ? ` · ${provider}` : ''}${typeof eta === 'number' ? ` · ${Math.ceil(eta / 60)} min away` : ''}`;
    } else if (event.type === 'TELEMETRY_UPDATED' && event.ride_id === currentRide) {
      const distance = event.payload.distance_to_pickup_m;
      if (typeof distance === 'number' && event.payload.gps_quality === 'GOOD') {
        if (distance !== lastDistance) {
          lastDistance = distance;
          lastMove = timestamp;
          stalled = false;
        } else if (!stalled && distance > 0 && lastMove !== null && timestamp - lastMove >= 15_000) {
          stalled = true;
          label = 'Driver position has stayed the same';
        }
      }
    }
    if (label && Number.isFinite(startedAt) && timestamp >= startedAt) {
      const seconds = Math.floor((timestamp - startedAt) / 1000);
      timeline.push({ seq: event.seq, elapsed: `+${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`, label });
    }
  }

  const distance = ride?.distance_to_pickup_m ?? 0;
  const start = ride?.ride_id === currentRide ? initialDistance : distance;
  return {
    timeline,
    startDistance: ride?.ride_id === currentRide ? initialDistance : 0,
    progress: distance <= 0 ? 1 : start > 0 ? Math.max(0, 1 - distance / start) : 0,
    stalled: !!ride && ride.ride_id === currentRide && distance > 0 && stalled,
  };
}
