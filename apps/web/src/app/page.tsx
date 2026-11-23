import Link from 'next/link';
import TripSetup from '@/components/setup/TripSetup';
export default function Home(){return <>
  <span className="eyebrow">Simulation-first AI ride recovery</span>
  <h1>Your cab cancelled.<br/><span className="highlight">Your plans shouldn&apos;t.</span></h1>
  <p className="lead">RideRescue watches pickup progress, flags likely delays, and safely prepares your next ride if the first one fails.</p>
  <div className="grid"><TripSetup/><aside className="hero-graphic">
    <strong>From booking to actual pickup.</strong>
    <p>Monitor. Detect. Recover. All within the limits you set.</p>
    <svg viewBox="0 0 500 270" role="img" aria-label="Illustrative route showing a cab approaching the destination">
      <path d="M40 230 C100 235 105 45 210 72 S360 200 450 33" stroke="#2c6475" strokeWidth="38" fill="none" strokeLinecap="round"/>
      <path d="M40 230 C100 235 105 45 210 72 S360 200 450 33" stroke="#7af2d3" strokeWidth="6" fill="none" strokeLinecap="round" strokeDasharray="5 15"/>
      <circle cx="40" cy="230" r="15" fill="#82e9d1"/><circle cx="450" cy="33" r="15" fill="#ffca7e"/>
      <g transform="translate(258 112)"><rect x="-38" y="-21" width="76" height="42" rx="12" fill="#b7ffe1"/>
      <rect x="-21" y="-35" width="42" height="20" rx="7" fill="#b7ffe1"/>
      <circle cx="-21" cy="23" r="8" fill="#0b1e2d"/><circle cx="21" cy="23" r="8" fill="#0b1e2d"/></g>
    </svg>
    <Link href="/demo" className="btn secondary" style={{display:'inline-block'}}>Try the incident demo →</Link>
  </aside></div>
</>}
