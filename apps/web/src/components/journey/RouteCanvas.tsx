import type { Ride } from '@/types';
import styles from './journey.module.css';

const route = [[65, 193], [153, 147], [232, 147], [303, 90], [414, 90], [485, 44]];
const segmentLengths = route.slice(1).map(([x, y], index) => Math.hypot(x - route[index][0], y - route[index][1]));
const routeLength = segmentLengths.reduce((total, length) => total + length, 0);

function pointAt(progress: number) {
  let remaining = progress * routeLength;
  for (let index = 0; index < segmentLengths.length; index++) {
    const length = segmentLengths[index];
    if (remaining <= length) {
      const [x, y] = route[index];
      const [endX, endY] = route[index + 1];
      return [x + (endX - x) * remaining / length, y + (endY - y) * remaining / length];
    }
    remaining -= length;
  }
  return route[route.length - 1];
}

export default function RouteCanvas({ ride, uncertain }: { ride: Ride | null; uncertain: boolean }) {
  const progress = ride
    ? ride.state === 'DRIVER_ARRIVED' || ride.state === 'IN_PROGRESS'
      ? 1
      : Math.max(0, Math.min(1, 1 - ride.distance_to_pickup_m / 2200))
    : 0;
  const [x, y] = pointAt(progress);
  const points = route.map((point) => point.join(',')).join(' ');
  const roads = 'M-35 101L335 -15M-30 203L285 -20M155 270L550 5M381 268L580 134M-25 164L550 273M-30 47L555 156M64 -20L226 270M289 -20L453 278';

  return (
    <figure className={styles.route}>
      <svg viewBox="0 0 550 240" role="img" aria-label={ride ? 'Illustration of simulated driver progress along the pickup route' : 'No active driver position'}>
        <rect width="550" height="240" fill="#101b2d" />
        <path d={roads} stroke="#243249" strokeWidth="12" fill="none" />
        <path d={roads} stroke="#35465b" strokeWidth="1" fill="none" />
        <rect x="72" y="36" width="56" height="30" rx="6" fill="#1c343c" />
        <rect x="394" y="151" width="68" height="43" rx="6" fill="#1d3839" />
        {ride && <polyline points={points} fill="none" stroke="var(--rehop-primary)" strokeOpacity=".25" strokeWidth="16" strokeLinejoin="round" strokeLinecap="round" />}
        {ride && <polyline points={points} fill="none" stroke="var(--rehop-primary)" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />}
        <circle cx="485" cy="44" r="11" fill="var(--rehop-primary)" stroke="#101b2d" strokeWidth="4" />
        <text x="441" y="24" fill="var(--rehop-text)" fontSize="13" fontWeight="700">Pickup</text>
        {ride && (
          <g className={styles.marker} style={{ transform: `translate(${x}px, ${y}px)`, opacity: uncertain ? 0.7 : 1 }}>
            <circle r="15" fill="#101b2d" stroke="var(--rehop-primary)" strokeWidth="3" />
            <path d="M-6 4h12v-7L3 -7h-6l-3 4Zm0-6h12M-5 1h1m8 0h1" fill="none" stroke="var(--rehop-text)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}
      </svg>
      <figcaption>{ride ? uncertain ? 'Last reported position · Simulated map' : 'Progress based on simulated distance to pickup' : 'No active driver position'}</figcaption>
    </figure>
  );
}
