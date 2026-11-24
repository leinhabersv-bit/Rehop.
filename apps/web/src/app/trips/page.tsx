'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQueries } from '@tanstack/react-query';
import { ArrowUpRight, Route } from 'lucide-react';
import { api } from '@/lib/api/client';
import { readRecentRides } from '@/lib/recent-rides';

const status: Record<string, string> = {
  MONITORING: 'Pickup in progress', PICKUP_CONFIRMED: 'Boarded', USER_CANCELLED: 'Cancelled',
  EXHAUSTED: 'No replacement', AWAITING_APPROVAL: 'Action needed', RECONCILING: 'Verifying status',
};

export default function TripsPage() {
  const [ids, setIds] = useState<string[] | null>(null);
  useEffect(() => { setIds(readRecentRides()); }, []);
  const trips = useQueries({ queries: (ids ?? []).map((id) => ({ queryKey: ['journey', id], queryFn: () => api.journey(id) })) });

  return <div className="mx-auto max-w-3xl">
    <h1 className="mb-2 text-4xl font-black tracking-tight sm:text-5xl">Your rides</h1>
    <p className="mb-6 text-[#43536b]">Bookings made on this device.</p>
    {ids === null ? <p role="status">Loading rides…</p> : ids.length === 0 ? (
      <section className="rounded-3xl border border-[#d4dcec] bg-white p-6 sm:p-8">
        <Route size={27} className="mb-4 text-[#173ed7]" aria-hidden="true" />
        <h2 className="text-xl font-bold">No rides yet</h2>
        <Link className="btn mt-4 inline-flex" href="/book">Plan a ride</Link>
      </section>
    ) : <ul className="space-y-3">
      {trips.map((item, index) => <li key={ids[index]} className={`rounded-2xl border border-[#d4dcec] bg-white p-4 sm:p-5 ${item.data ? 'max-sm:p-0' : ''}`}>
        {item.data ? <Link className="flex items-center justify-between gap-3 rounded-lg max-sm:min-h-16 max-sm:p-4" href={
          '/journey/' + encodeURIComponent(item.data.id)
        }>
          <div><strong>{item.data.pickup.label} → {item.data.dropoff.label}</strong><p className="mt-1 text-sm text-[#43536b]">{status[item.data.state] ?? 'View ride status'}</p></div>
          <ArrowUpRight size={20} className="shrink-0 text-[#173ed7]" aria-hidden="true" />
        </Link> : item.isPending ? <p role="status">Loading ride status…</p> : <p>Ride status is unavailable.</p>}
      </li>)}
    </ul>}
  </div>;
}
