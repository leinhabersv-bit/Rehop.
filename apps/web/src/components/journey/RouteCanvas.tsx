import type {Ride} from '@/types';
export default function RouteCanvas({ride}:{ride:Ride|null}){
  const progress=ride?Math.min(1,Math.max(0,1-ride.distance_to_pickup_m/2200)):0;
  const x=80+progress*440;
  return <svg className="route-diagram" viewBox="0 0 600 250" role="img" aria-label="Illustrative simulated driver progress to pickup">
    <path d="M80 170 C155 90 265 70 330 120 S430 165 520 80" fill="none" stroke="#b5d9d1" strokeWidth="36" strokeLinecap="round"/>
    <path d="M80 170 C155 90 265 70 330 120 S430 165 520 80" fill="none" stroke="#52bea7" strokeWidth="6" strokeDasharray="8 12" strokeLinecap="round"/>
    <circle cx="520" cy="80" r="19" fill="#0a8b79" stroke="white" strokeWidth="5"/>
    <text x="490" y="48" fill="#156d63" fontWeight="bold" fontSize="13">PICKUP</text>
    <g transform={`translate(${x} ${165-progress*75})`}>
      <circle r="27" fill="#0b1e2d" opacity="0.09"/><rect x="-20" y="-13" width="40" height="24" rx="7" fill="#104b4a"/>
      <rect x="-12" y="-21" width="24" height="14" rx="5" fill="#104b4a"/>
      <circle cx="-12" cy="13" r="5" fill="#081e2b"/><circle cx="12" cy="13" r="5" fill="#081e2b"/>
    </g><text x="35" y="225" fill="#63877f" fontSize="12">Conceptual route • No live GPS</text>
  </svg>
}
