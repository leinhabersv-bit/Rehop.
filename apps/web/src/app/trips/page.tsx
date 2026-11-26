'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Route, Trash2 } from 'lucide-react';
import { useActiveRide } from '@/components/journey/ActiveRide';
import { ApiError } from '@/lib/api/client';
import { deleteRecentRide } from '@/lib/recent-rides';

const status: Record<string, string> = {
  MONITORING: 'Pickup in progress', PICKUP_CONFIRMED: 'Boarded', USER_CANCELLED: 'Cancelled',
  EXHAUSTED: 'No replacement', AWAITING_APPROVAL: 'Action needed', RECONCILING: 'Verifying status',
};

export default function TripsPage() {
  const { entries, arrivals, now } = useActiveRide();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');

  return <div className="mx-auto max-w-3xl">
    <h1 className="mb-2 text-4xl font-black tracking-tight sm:text-5xl">Your rides</h1>
    <p className="mb-6 text-[#43536b]">Bookings made on this device.</p>
    {feedback && <p role="status" className="mb-3 text-sm text-[#43536b]">{feedback}</p>}
    {entries.length === 0 ? (
      <section className="rounded-3xl bg-[#111a42] bg-[radial-gradient(ellipse_at_top_right,#274696,transparent_75%)] p-6 text-white sm:p-8">
        <span className="mb-4 grid size-11 place-items-center rounded-xl bg-[#ffcbab] text-[#111a42]"><Route size={23} aria-hidden="true" /></span>
        <h2 className="text-2xl font-black !text-white">No rides yet</h2>
        <p className="mt-2 text-sm text-[#e4eaff]">Your completed and cancelled rides will appear here.</p>
        <Link className="btn mt-4 gap-2 !border-[#ffcbab] !bg-[#ffcbab] !text-[#111a42]" href="/book">Plan a ride <ArrowUpRight size={16} aria-hidden="true" /></Link>
      </section>
    ) : <>
      <h2 className="mb-3 text-lg font-extrabold">Recent rides</h2>
      <ul className="space-y-3">
        {entries.map(({ id, query }) => {
          const ride = query.data;
          const label = ride ? `${ride.pickup.label} → ${ride.dropoff.label}` : 'Ride status is unavailable';
          const arrived = ride?.state === 'PICKUP_CONFIRMED' && (arrivals[id] ?? Infinity) <= now;
          const removable = ride ? ['USER_CANCELLED', 'EXHAUSTED'].includes(ride.state) || ride.state === 'PICKUP_CONFIRMED' && (!ride.boarded_at || arrived)
            : query.error instanceof ApiError && query.error.status === 404;
          return <li key={id} className="rounded-2xl border border-[#d4dcec] bg-white p-4 sm:p-5">
            <div className="flex items-center gap-2">
              {ride ? <Link className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg max-sm:min-h-12" href={'/journey/' + encodeURIComponent(id)}>
                <div className="min-w-0 break-words"><strong>{label}</strong><p className="mt-1 text-sm text-[#43536b]">{arrived ? 'Arrived' : status[ride.state] ?? 'View ride status'}</p></div>
                <ArrowUpRight size={18} className="shrink-0 text-[#173ed7]" aria-hidden="true" />
              </Link> : query.isPending ? <p className="flex-1" role="status">Loading ride status…</p> : <p className="flex-1">{label}.</p>}
              {removable && deleting !== id && <button type="button" aria-label={`Delete ride: ${label}`} onClick={() => { setDeleting(id); setFeedback(''); }}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-[#e7cdd6] px-2.5 text-xs font-bold text-[#8c3651] hover:bg-[#fff2f6]">
                <Trash2 size={15} aria-hidden="true" /> <span className="max-sm:sr-only">Delete</span>
              </button>}
            </div>
            {removable && deleting === id && <div className="mt-3 rounded-xl bg-[#fff2f6] p-3 text-sm">
              <p className="mb-2 font-semibold">Delete this ride from this device’s history?</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn danger" onClick={() => {
                  setFeedback(deleteRecentRide(id) ? 'Ride deleted.' : 'Couldn’t delete this ride. Try again.');
                  setDeleting(null);
                }}>Delete ride</button>
                <button type="button" className="btn secondary" onClick={() => setDeleting(null)}>Keep ride</button>
              </div>
            </div>}
          </li>;
        })}
      </ul>
    </>}
  </div>;
}
